import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PLAN_CONFIG, PLAN_ORDER, canPlanUseFeature, getPlanConfig, validateExportCreativeManifest, type BillingInterval, type ExportCreativeManifest, type FeatureKey, type PlanSlug } from "../src/config/plans.ts";
import { buildPricingTiers, lookupPriceEnv } from "../src/config/pricing-tiers.ts";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email.ts";
import { env } from "../src/env.ts";
import { db, type ComplimentaryGrant, type EmailPreference, type Membership, type Subscription, type UsageRecord, type User } from "../src/db.ts";
import { inboxSummarySafe, recordContactFormMessage } from "./inbox-core.ts";
import { claimGiftCode } from "./gift-codes.ts";
import { giftEndsAt, isGiftLength } from "../src/lib/gift-lengths.ts";
import { rateLimit as kvRateLimit } from "../src/rate-limiter.ts";

/**
 * The social profiles the owner can publish on the site and in the app.
 * Each link must be an HTTPS URL on the platform's own domain, so a typo
 * (or a pasted tracking redirect) can never become a footer icon that sends
 * visitors somewhere else.
 */
export const SOCIAL_LINK_PLATFORMS = [
  { id: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { id: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com"] },
  { id: "linkedin", label: "LinkedIn", hosts: ["linkedin.com"] },
  { id: "x", label: "X", hosts: ["x.com", "twitter.com"] },
  { id: "tiktok", label: "TikTok", hosts: ["tiktok.com"] },
] as const;
export type SocialPlatformId = (typeof SOCIAL_LINK_PLATFORMS)[number]["id"];
type SocialLinks = Record<SocialPlatformId, string>;
const SOCIAL_LINKS_SETTING_KEY = "social_links";

/**
 * Validates and normalizes the social-link fields. An empty string
 * clears a link. A link pasted without a scheme ("www.youtube.com/@x") is
 * treated as https, because that is how addresses are copied from a browser
 * bar or a profile page. Returns the clean record, or a human-readable error
 * naming the first field that is wrong.
 */
export function sanitizeSocialLinks(input: unknown): { links: SocialLinks } | { error: string } {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const links = { youtube: "", facebook: "", linkedin: "", x: "" } as SocialLinks;
  for (const platform of SOCIAL_LINK_PLATFORMS) {
    const raw = String(body[platform.id] ?? "").trim();
    if (!raw) continue;
    if (raw.length > 300) return { error: `The ${platform.label} link is too long (300 characters maximum).` };
    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    let url: URL;
    try { url = new URL(candidate); } catch { return { error: `The ${platform.label} link is not a valid URL. Paste the full address, for example https://${platform.hosts[0]}/yourprofile.` }; }
    if (url.protocol !== "https:") return { error: `The ${platform.label} link must use https://.` };
    const host = url.hostname.toLowerCase();
    if (!platform.hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return { error: `The ${platform.label} link must point at ${platform.hosts.join(" or ")}.` };
    links[platform.id] = url.toString();
  }
  return { links };
}

/** The social links as the public site and app read them — never missing keys. */
async function publicSocialLinks(): Promise<SocialLinks> {
  const raw = await db.getSetting(SOCIAL_LINKS_SETTING_KEY);
  const stored = raw ? (JSON.parse(raw) as Partial<SocialLinks>) : {};
  /* Built from SOCIAL_LINK_PLATFORMS, not a literal: a platform added to that
     one list is published, sanitized and defaulted here with no second edit,
     and a stored record saved before the platform existed still answers with
     an empty string rather than `undefined`. */
  return Object.fromEntries(
    SOCIAL_LINK_PLATFORMS.map((platform) => [platform.id, stored[platform.id] || ""])
  ) as SocialLinks;
}

const now = () => new Date().toISOString();
/** Verification links are intentionally long-lived enough for users who only
 * check email once a day, while still limiting the lifetime of a bearer
 * token. Keep this value shared by registration and resend so the email copy
 * and the database check cannot drift apart. */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const DEVELOPMENT_SESSION_SECRET = "scenering-local-development-secret";
function isProduction() { return env().NODE_ENV === "production"; }
function sessionSecret() {
  const secret = env().SESSION_SECRET || (!isProduction() ? DEVELOPMENT_SESSION_SECRET : "");
  if (!secret || (isProduction() && secret.length < 32)) throw new Error("SESSION_SECRET must be a unique production secret of at least 32 characters");
  return secret;
}
const hashToken = (token: string) => createHmac("sha256", sessionSecret()).update(token).digest("hex");

export function assertSecurePlatformConfiguration() {
  sessionSecret();
  const publicAppUrl = env().PUBLIC_APP_URL;
  if (isProduction() && !publicAppUrl) throw new Error("PUBLIC_APP_URL is required in production");
  if (publicAppUrl) { const url = new URL(publicAppUrl); if (isProduction() && url.protocol !== "https:") throw new Error("PUBLIC_APP_URL must use HTTPS in production"); }
}

function passwordHash(password: string): string { const salt = randomBytes(16); const derived = scryptSync(password, salt, 64); return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`; }
function passwordMatches(password: string, stored: string): boolean {
  const [, saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex"); const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function cookies(req: Request): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    try { result[key] = decodeURIComponent(part.slice(separator + 1)); } catch { /* Ignore malformed cookies. */ }
  }
  return result;
}
/** The real client IP as Cloudflare reports it. Under the Workers↔Express
 *  bridge (`cloudflare:node`'s httpServerHandler) there is no real TCP
 *  socket, so `req.ip`/`req.socket.remoteAddress` cannot be trusted the way
 *  they could on a bare Node host — the header Cloudflare itself attaches to
 *  every request reaching the Worker is the reliable source. */
function clientIp(req: Request): string { return String(req.headers["cf-connecting-ip"] || req.ip || "unknown"); }

function safeUser(user: User) { return { id: user.id, email: user.email, displayName: user.displayName, emailVerified: user.isVerified, role: user.role, createdAt: user.createdAt }; }

function configuredOwnerEmail() { return String(env().SCENERING_OWNER_EMAIL || "").trim().toLowerCase(); }

/** Keeps the owner's admin role and SceneForge membership in sync with
 *  SCENERING_OWNER_EMAIL every time that account signs in, registers, or is
 *  looked up by its session — rather than once at process startup (there is
 *  no such moment on Workers; a Worker is re-evaluated per isolate, not
 *  "booted" the way a long-lived Node process is). */
async function ensureOwnerPrivileges(user: User): Promise<User> {
  const ownerEmail = configuredOwnerEmail();
  if (!ownerEmail || user.email !== ownerEmail || user.role === "admin") return user;
  await db.updateUser(user.id, { role: "admin" });
  const membership = await db.findMembershipByUserId(user.id);
  if (membership) await db.updateMembership(membership.id, { plan: "sceneforge", status: "active" });
  else await db.createMembership(user.id, "sceneforge");
  return { ...user, role: "admin" };
}

/** A subscription that was cancelled or is in dunning keeps its plan until
 *  the period that was paid for runs out. Paddle sends `subscription.canceled`
 *  then, but a webhook that is never delivered must not leave a paid
 *  plan switched on forever, so the stored end date is the backstop. Scoped
 *  to one user (not a full-table sweep) so it is cheap enough to run on the
 *  authenticated request path. */
async function sweepUserSubscriptionExpiry(userId: string): Promise<void> {
  const sub = await db.findActiveSubscriptionByUserId(userId);
  if (!sub) return;
  if ((sub.status === "active" || sub.status === "on_trial") && !sub.cancelAtPeriodEnd) return;
  const ends = Date.parse(String(sub.expiresAt || sub.currentPeriodEnd || ""));
  if (!Number.isFinite(ends) || ends > Date.now()) return;
  if (sub.status !== "cancelled") {
    await db.updateSubscription(sub.id, { status: "expired" });
  }
  const membership = await db.findMembershipByUserId(userId);
  if (membership && membership.plan !== "free") await db.updateMembership(membership.id, { plan: "free" });
}

async function activeComplimentaryGrant(userId: string) {
  await db.expireStaleComplimentaryGrants();
  return db.findActiveComplimentaryGrant(userId);
}

async function getUserPlan(user: User): Promise<PlanSlug> {
  if (user.role === "admin") return "sceneforge";
  await sweepUserSubscriptionExpiry(user.id);
  const membership = await db.findMembershipByUserId(user.id);
  const grant = await activeComplimentaryGrant(user.id);
  const paid: PlanSlug = membership?.plan || "free";
  const complimentary: PlanSlug = grant?.planId || "free";
  const rank: Record<PlanSlug, number> = { free: 0, sceneflow: 1, sceneforge: 2 };
  return rank[complimentary] > rank[paid] ? complimentary : paid;
}

async function effectiveMembership(user: User, plan: PlanSlug) {
  const stored = await db.findMembershipByUserId(user.id);
  const grant = await activeComplimentaryGrant(user.id);
  return {
    ...(stored ? { id: stored.id, user_id: stored.userId, status: stored.status } : { id: "", user_id: user.id, status: "active" }),
    plan_id: plan,
    source: user.role === "admin" ? "owner_admin" : grant && grant.planId === plan ? "complimentary" : plan === "free" ? "free" : "verified_subscription",
    complimentary_ends_at: grant && grant.planId === plan ? grant.endsAt : null,
    complimentary_period: grant && grant.planId === plan ? grant.period : null,
  };
}

/**
 * What the Email Centre inbox shows about a member next to their messages:
 * plan (with where it comes from), gift end date, sign-up date and email
 * consent. Uses the same plan resolution as everything else above.
 */
export async function adminMemberSummary(userId: string) {
  const user = await db.findUserById(userId);
  if (!user) return null;
  const plan = await getUserPlan(user);
  const membership = await effectiveMembership(user, plan);
  const preference = await db.findEmailPreference(user.id);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    verified: user.isVerified,
    createdAt: user.createdAt,
    plan,
    source: membership.source,
    complimentaryEndsAt: membership.complimentary_ends_at,
    complimentaryPeriod: membership.complimentary_period,
    marketingConsent: Boolean(preference?.marketingConsent),
  };
}

/** The subscription worth showing. A cancelled one is still shown while the
 *  paid period runs, so the customer can see the end date and reopen Paddle's
 *  management links. Once its end date has passed, it is no longer current. */
async function subscriptionForUser(userId: string) {
  const sub = await db.findActiveSubscriptionByUserId(userId);
  if (!sub) return null;
  if (sub.status === "cancelled") {
    const ends = Date.parse(String(sub.expiresAt || sub.currentPeriodEnd || ""));
    if (!Number.isFinite(ends) || ends <= Date.now()) return null;
  }
  return sub;
}

/** The API's wire format for subscriptions: snake_case, exactly the shape
 *  the account modal's TypeScript interface declares and the billing suite
 *  pins (billing_interval, customer_portal_url, …). The db layer's row
 *  mappers return camelCase; this converts on the way out. */
function apiSubscription(sub: import("../src/db.ts").Subscription | null) {
  if (!sub) return null;
  return {
    subscription_id: sub.providerSubscriptionId,
    customer_id: sub.providerCustomerId,
    subscription_status: sub.status,
    price_id: sub.providerPriceId,
    product_id: sub.providerProductId,
    status: sub.status,
    plan_id: sub.planId,
    billing_interval: sub.billingInterval,
    current_period_start: sub.currentPeriodStart,
    current_period_end: sub.currentPeriodEnd,
    cancel_at_period_end: sub.cancelAtPeriodEnd,
    cancelled_at: sub.cancelledAt,
    expires_at: sub.expiresAt,
    customer_portal_url: sub.customerPortalUrl,
    update_payment_url: sub.updatePaymentUrl,
    card_brand: sub.cardBrand,
    card_last_four: sub.cardLastFour,
    renewal_price: sub.renewalPrice,
    created_at: sub.createdAt,
  };
}

/** Same for complimentary grants (ends_at, plan_id, …) — the account modal
 *  and the administration panel read these snake_case fields. */
function apiGrant(grant: import("../src/db.ts").ComplimentaryGrant | null) {
  if (!grant) return null;
  return {
    id: grant.id,
    user_id: grant.userId,
    plan_id: grant.planId,
    period: grant.period,
    status: grant.status,
    starts_at: grant.startsAt,
    ends_at: grant.endsAt,
    granted_by: grant.grantedBy,
    reason: grant.reason,
    access_code_id: grant.accessCodeId,
    created_at: grant.createdAt,
    revoked_at: grant.revokedAt,
  };
}

/** Session cookie attributes. The real policy is HttpOnly; SameSite=Lax
 *  (plus Secure in production). Embedded development previews — the app
 *  shown inside an HTTPS iframe, as sandbox preview panes do — are the one
 *  exception: browsers refuse to send Lax cookies inside a cross-site
 *  frame, which makes sign-in appear to work and then fail with 401 on the
 *  next request. DEV_EMBEDDED_PREVIEW=1 (never set in production; ignored
 *  there) switches to SameSite=None; Secure so the preview behaves like the
 *  deployed site. */
function sessionCookieAttributes() {
  if (!isProduction() && env().DEV_EMBEDDED_PREVIEW === "1") return "Path=/; HttpOnly; SameSite=None; Secure";
  return `Path=/; HttpOnly; SameSite=Lax${isProduction() ? "; Secure" : ""}`;
}
function setSessionCookie(res: Response, token: string) { res.setHeader("Set-Cookie", `scenering_session=${encodeURIComponent(token)}; ${sessionCookieAttributes()}; Max-Age=2592000; Priority=High`); }
function clearSessionCookie(res: Response) { res.setHeader("Set-Cookie", `scenering_session=; ${sessionCookieAttributes()}; Max-Age=0; Priority=High`); }

type Auth = { user: User; plan: PlanSlug };

/** Resolves the signed-in user (and plan) for a request, or null. Exported
 *  for the Email Centre's preference endpoints, which accept EITHER a
 *  session OR the signed token a marketing email carries — so they cannot
 *  simply mount requireUser. */
export async function findSession(req: Request): Promise<Auth | null> {
  const raw = cookies(req).scenering_session;
  if (raw) {
    const session = await db.findSessionByToken(hashToken(raw));
    const user = session && (await db.findUserById(session.userId));
    // A session may have been issued before verification enforcement was
    // deployed, or a user may have been unverified by an administrative data
    // repair. Never let an existing cookie bypass the verification gate.
    if (user && user.isVerified) { const resolved = await ensureOwnerPrivileges(user); return { user: resolved, plan: await getUserPlan(resolved) }; }
    // Revoke any legacy session that belongs to an unverified account. This
    // prevents it becoming usable if verification state changes later.
    if (session && user && !user.isVerified) await db.deleteSessionByToken(session.token);
  }
  /* DEV_AUTO_OWNER=1 — development previews only. Some browsers refuse to
     store any cookie for an embedded or proxied preview, which makes
     cookie-based sign-in impossible there no matter what the server sends.
     With this flag the preview treats every request as the configured owner
     administrator, so the product can be reviewed end to end. Double-gated:
     ignored in production, and never set in any deployment configuration. */
  if (!isProduction() && env().DEV_AUTO_OWNER === "1") {
    const ownerEmail = configuredOwnerEmail();
    const owner = ownerEmail && (await db.findUserByEmail(ownerEmail));
    if (owner && owner.role === "admin" && owner.isVerified) return { user: owner, plan: "sceneforge" };
  }
  return null;
}

function requireUserMiddleware(req: Request, res: Response, next: NextFunction) {
  findSession(req).then((auth) => {
    if (!auth) return res.status(401).json({ error: "Sign in required" });
    (req as any).auth = auth;
    next();
  }, next);
}
function requireAdminMiddleware(req: Request, res: Response, next: NextFunction) {
  findSession(req).then((auth) => {
    if (!auth) return res.status(401).json({ error: "Sign in required" });
    if (auth.user.role !== "admin") return res.status(403).json({ error: "Owner administrator access required" });
    (req as any).auth = auth;
    next();
  }, next);
}
const requireUser = requireUserMiddleware;
const requireAdmin = requireAdminMiddleware;
export const requirePlatformUser = requireUserMiddleware;
/** The admin-only middleware the Email Centre (server/email-centre.ts) and
 *  any other owner surface mounts — identical to what /api/admin/* uses
 *  here: 401 without a session, 403 unless the account's role is admin. */
export const requirePlatformAdmin = requireAdminMiddleware;

/** Synchronous — safe to call from any handler that runs after
 *  requireUser/requireAdmin, because the plan was already resolved once by
 *  findSession() and cached on req.auth. */
export function platformFeatureAllowed(req: Request, feature: FeatureKey) {
  const auth = (req as any).auth as Auth | undefined;
  return Boolean(auth && canPlanUseFeature(auth.plan, feature));
}
export function requirePlatformFeature(feature: FeatureKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    findSession(req).then((auth) => {
      if (!auth) return res.status(401).json({ error: "Sign in required" });
      if (!canPlanUseFeature(auth.plan, feature)) return res.status(403).json({ error: "This capability is not included in your membership.", code: "ENTITLEMENT_REQUIRED", feature, plan: auth.plan });
      (req as any).auth = auth;
      next();
    }, next);
  };
}

function weekStart() { const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); d.setUTCHours(0, 0, 0, 0); return d; }
async function weeklyUsage(userId: string) {
  const rows = await db.listUsageSince(userId, weekStart().toISOString());
  return { finalExports: rows.length, finalExportMinutes: Number(rows.reduce((sum, r) => sum + r.durationMinutes, 0).toFixed(2)) };
}
async function remainingUsage(userId: string, plan: PlanSlug) {
  const config = getPlanConfig(plan);
  const rows = await db.listUsageSince(userId, weekStart().toISOString());
  const usage = { finalExports: rows.length };
  const shortCount = rows.filter((r) => r.format === "short" || (!r.format && r.durationMinutes <= 1)).length;
  const longCount = rows.length - shortCount;
  return {
    finalExports: config.limits.finalExportsPerWeek == null ? null : Math.max(0, config.limits.finalExportsPerWeek - usage.finalExports),
    shortExports: config.limits.shortExportsPerWeek == null ? null : Math.max(0, config.limits.shortExportsPerWeek - shortCount),
    longExports: config.limits.longExportsPerWeek == null ? null : Math.max(0, config.limits.longExportsPerWeek - longCount),
  };
}
async function canExport(userId: string, plan: PlanSlug, duration: number, format: "short" | "long") {
  await db.expireStaleReservations();
  const config = getPlanConfig(plan);
  const rows = await db.listUsageSince(userId, weekStart().toISOString());
  const reserved = await db.listReservedSince(userId, weekStart().toISOString());
  if (config.id === "free") {
    const shortUsed = rows.filter((r) => r.format === "short" || (!r.format && r.durationMinutes <= 1)).length + reserved.filter((r) => r.format === "short").length;
    const longUsed = (rows.length - rows.filter((r) => r.format === "short" || (!r.format && r.durationMinutes <= 1)).length) + reserved.filter((r) => r.format === "long").length;
    if (format === "short") return duration <= (config.limits.maxShortMinutes || 0) && shortUsed < (config.limits.shortExportsPerWeek || 0);
    return duration <= (config.limits.maxLongMinutes || 0) && longUsed < (config.limits.longExportsPerWeek || 0);
  }
  return config.limits.finalExportsPerWeek == null || rows.length + reserved.length < config.limits.finalExportsPerWeek;
}
function parseCreativeManifest(value: unknown): ExportCreativeManifest | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const list = (key: string) => Array.isArray(input[key]) && (input[key] as unknown[]).length <= 100 && (input[key] as unknown[]).every((item) => typeof item === "string") ? input[key] as string[] : null;
  const features = list("features"), backgroundMusic = list("backgroundMusic"), audioVisualisers = list("audioVisualisers"), callsToAction = list("callsToAction");
  if (!features || !backgroundMusic || !audioVisualisers || !callsToAction || typeof input.voice !== "string" || typeof input.captionStyle !== "string") return null;
  return { features: features as FeatureKey[], voice: input.voice.slice(0, 100), captionStyle: input.captionStyle.slice(0, 100), backgroundMusic, audioVisualisers, callsToAction };
}

async function accountPayload(user: User) {
  const plan = await getUserPlan(user);
  const [usage, remaining, subscription, membership, resolvedCustomer] = await Promise.all([
    weeklyUsage(user.id), remainingUsage(user.id, plan), subscriptionForUser(user.id), effectiveMembership(user, plan), resolvePaddleCustomerForUser(user),
  ]);
  // `subscription` goes out in the API's snake_case wire format
  // (apiSubscription) — the same shape the membership object uses and the
  // account modal's TypeScript interface declares.
  return { user: safeUser(user), membership, subscription: apiSubscription(subscription), has_billing_customer: Boolean(resolvedCustomer), plan: getPlanConfig(plan), usage, remaining };
}

/**
 * Distributed, Workers-native replacement for the old in-memory sliding
 * window: a KV counter per (name, subject, window). KV is eventually
 * consistent with no atomic increment, so under heavy concurrent traffic a
 * handful of requests can slip past the limit right at the boundary — an
 * accepted tradeoff for abuse mitigation (not a hard security boundary).
 * See src/rate-limiter.ts.
 */
export function platformRateLimit(name: string, max: number, windowMs: number) {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));
  return (req: Request, res: Response, next: NextFunction) => {
    const subject = (req as any).auth?.user?.id || clientIp(req);
    const key = `rl:${name}:${subject}`;
    kvRateLimit(key, max, windowSeconds).then((allowed) => {
      if (!allowed) { res.setHeader("Retry-After", String(windowSeconds)); return res.status(429).json({ error: "Too many requests. Please try again later." }); }
      next();
    }, next);
  };
}
const rateLimit = platformRateLimit;

/**
 * Paddle Billing — the payment provider.
 *
 * Paddle is the merchant of record: it sells the subscription, takes the card,
 * charges the tax and pays Scenering. This server never sees a card number and
 * stores no payment details of its own — only the subscription's status, plan,
 * period dates and the two hosted management links Paddle returns.
 *
 * Two things make the loop work, and both are why the pieces below look the
 * way they do:
 *
 *   1. `custom_data`. The server creates the Paddle transaction itself
 *      (`POST /transactions`) and puts the signed-in account's id in
 *      `custom_data`. Paddle signs it, carries it through the payment, copies
 *      it onto the subscription it creates, and sends it home on every webhook
 *      for that subscription. It cannot be edited by the person paying, which
 *      is what makes it safe to grant a plan on the strength of it.
 *   2. `Paddle-Signature`. Every webhook is HMAC-SHA256 over `ts:rawBody` with
 *      the webhook secret key, so a delivery that did not come from Paddle
 *      cannot be forged and an old one cannot be replayed.
 *
 * Sandbox and live are separate Paddle accounts with separate API keys,
 * separate price ids and separate webhook destinations. Nothing here infers
 * which is which from a key's prefix — `PADDLE_ENVIRONMENT` says so.
 */
export const PADDLE_API_BASE_URLS = {
  sandbox: "https://sandbox-api.paddle.com",
  live: "https://api.paddle.com",
} as const;
export type PaddleEnvironment = keyof typeof PADDLE_API_BASE_URLS;

export function paddleEnvironment(): PaddleEnvironment {
  const configured = String(env().PADDLE_ENVIRONMENT || "").trim().toLowerCase();
  // Sandbox is the default: an unset or misspelled environment must never
  // quietly point production traffic at the live API.
  return configured === "live" || configured === "production" ? "live" : "sandbox";
}
export function paddleApiBaseUrl(): string { return PADDLE_API_BASE_URLS[paddleEnvironment()]; }

/**
 * The Paddle events that change what a member can do. Everything else Paddle
 * sends — transactions, adjustments, discounts, payment methods — is recorded
 * and ignored rather than guessed at: a transaction event carries a transaction
 * id (`txn_…`) where this code expects a subscription id (`sub_…`), and
 * treating one as the other would create a subscription row that no later event
 * could ever update. Ignoring `transaction.completed` costs nothing, because
 * `subscription.activated` follows it within seconds.
 */
export const PADDLE_SUBSCRIPTION_EVENTS = [
  "subscription.activated", "subscription.created", "subscription.updated", "subscription.canceled",
  "subscription.paused", "subscription.resumed", "subscription.trialing", "subscription.past_due",
  "subscription.imported",
] as const;

/**
 * Paddle's customer events are the only ones that carry an email address, so
 * they are what lets a subscription webhook — customer id but no email — be
 * matched to an account when a purchase arrived without `custom_data`. They
 * map a Paddle customer to a Scenering account and nothing more: no customer
 * event ever grants a plan on its own.
 */
export const PADDLE_CUSTOMER_EVENTS = ["customer.created", "customer.updated"] as const;

/** Every event to subscribe to in Paddle → Developer tools → Notifications. */
export const PADDLE_WEBHOOK_EVENTS = [...PADDLE_SUBSCRIPTION_EVENTS, ...PADDLE_CUSTOMER_EVENTS] as const;
export const PADDLE_WEBHOOK_PATH = "/api/webhooks/paddle";

/**
 * How far a webhook's `ts` may drift from this server's clock before the
 * delivery is treated as a replay. Paddle's own SDK allows five seconds, which
 * rejects genuine deliveries whenever the two clocks disagree by more than
 * that; five minutes still makes a captured delivery useless to an attacker
 * while tolerating skew and queueing. The real replay defence is the UNIQUE
 * `provider_event_id` in `webhook_events` — this is the belt to that brace.
 */
export const PADDLE_SIGNATURE_MAX_AGE_SECONDS = 300;

const paddleText = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

/**
 * Verifies Paddle's `Paddle-Signature` header against the untouched request
 * bytes. The header is `ts=<unix seconds>;h1=<hex digest>`; the signed string
 * is `${ts}:${rawBody}`; the digest is HMAC-SHA256 under the webhook secret
 * key. The bytes are hashed as received (never a re-serialised object, which
 * would not match), and the comparison is constant-time — Paddle's SDK uses a
 * plain `===` on the hex, this does not.
 *
 * Returns the parsed timestamp, or null when the header is absent, malformed,
 * stale or wrong. The caller answers 401 for all four alike: telling them apart
 * would tell an attacker which part they had got right.
 */
export function verifyPaddleSignature(rawBody: Buffer, header: string, secret: string): { ts: number } | null {
  const parts: Record<string, string> = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) parts[part.slice(0, index).trim().toLowerCase()] = part.slice(index + 1).trim();
  }
  const h1 = (parts.h1 || "").toLowerCase();
  const ts = Number.parseInt(parts.ts || "", 10);
  if (!h1 || !Number.isFinite(ts)) return null;
  const ageSeconds = Date.now() / 1000 - ts;
  if (ageSeconds > PADDLE_SIGNATURE_MAX_AGE_SECONDS || ageSeconds < -PADDLE_SIGNATURE_MAX_AGE_SECONDS) return null;
  const expected = createHmac("sha256", secret).update(Buffer.from(`${ts}:`, "utf8")).update(rawBody).digest("hex");
  if (h1.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(h1, "utf8"), Buffer.from(expected, "utf8"))) return null;
  return { ts };
}

/** Signs a body exactly the way Paddle does, so tests (and a self-check in the
 *  administration panel) can produce a valid `Paddle-Signature` header. */
export function paddleSignatureHeader(rawBody: string, secret: string, ts = Math.floor(Date.now() / 1000)): string {
  const h1 = createHmac("sha256", secret).update(Buffer.from(`${ts}:`, "utf8")).update(Buffer.from(rawBody, "utf8")).digest("hex");
  return `ts=${ts};h1=${h1}`;
}

/**
 * Paddle counts a webhook as delivered only if it gets a 2xx within five
 * seconds, and a connection that runs long counts against the same retry budget
 * as a failure. The webhook path therefore calls the API with a hard ceiling
 * well inside that; the checkout path is a human waiting on a page, so it gets
 * a more generous one.
 */
const PADDLE_WEBHOOK_API_TIMEOUT_MS = 3000;
const PADDLE_CHECKOUT_API_TIMEOUT_MS = 10000;

/** One call to the Paddle API. `data` is the unwrapped payload, since every
 *  Paddle response is `{ data, meta }` or `{ error: { … } }`. */
/* ------------------------------------------------------------------ *
 * Paddle's published source ranges                                    *
 * ------------------------------------------------------------------ */

/** Paddle publishes the ranges its webhook deliveries come from, and the list
 *  can change, so it is fetched rather than written down somewhere that rots.
 *  `GET /ips` is public — it needs no API key — which matters because the
 *  allowlist has to work before any credential is configured. */
const PADDLE_IPS_PATHNAME = "/ips";
const PADDLE_IPS_REFRESH_MS = 24 * 60 * 60 * 1000;
const PADDLE_IPS_FETCH_TIMEOUT_MS = 3000;

let paddleIpCache: { cidrs: string[]; fetchedAt: number } | null = null;
let paddleIpInFlight: Promise<string[] | null> | null = null;

export function paddleWebhookIpAllowlistEnabled(): boolean {
  return String(env().PADDLE_WEBHOOK_IP_ALLOWLIST || "").trim().toLowerCase() === "on";
}

async function fetchPaddleSourceCidrs(): Promise<string[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PADDLE_IPS_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${paddleApiBaseUrl()}${PADDLE_IPS_PATHNAME}`, { signal: controller.signal });
    if (!response.ok) return null;
    const payload: any = await response.json().catch(() => null);
    const data = payload?.data ?? payload;
    const cidrs = [
      ...(Array.isArray(data?.ipv4_cidrs) ? data.ipv4_cidrs : []),
      ...(Array.isArray(data?.ipv6_cidrs) ? data.ipv6_cidrs : []),
    ]
      .map((cidr: unknown) => String(cidr || "").trim())
      .filter((cidr: string) => cidr.includes("/"));
    if (!cidrs.length) return null;
    paddleIpCache = { cidrs, fetchedAt: Date.now() };
    return cidrs;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Paddle's current source ranges, or null when they have never been fetched
 *  successfully. Callers must fail open on null: refusing a delivery because
 *  *we* could not reach Paddle would lose a real payment, and the signature
 *  check behind this is what actually authenticates the caller. A stale list
 *  beats no list, so the last good one is kept if a refresh fails. */
async function paddleSourceCidrs(): Promise<string[] | null> {
  const maxAge = Number(env().PADDLE_IPS_REFRESH_MS || "") || PADDLE_IPS_REFRESH_MS;
  if (paddleIpCache && Date.now() - paddleIpCache.fetchedAt < maxAge) return paddleIpCache.cidrs;
  if (!paddleIpInFlight) {
    paddleIpInFlight = fetchPaddleSourceCidrs().finally(() => { paddleIpInFlight = null; });
  }
  const fresh = await paddleIpInFlight;
  return fresh ?? paddleIpCache?.cidrs ?? null;
}

/** IPv4 CIDR membership. Paddle publishes /32s today, but that is not a
 *  promise, so the prefix length is honoured rather than assumed. */
function ipv4InCidr(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split("/");
  const prefix = Number(bits);
  const toLong = (value: string): number | null => {
    const parts = value.split(".");
    if (parts.length !== 4) return null;
    let out = 0;
    for (const part of parts) {
      if (!/^\d{1,3}$/.test(part)) return null;
      const octet = Number(part);
      if (octet > 255) return null;
      out = out * 256 + octet;
    }
    return out >>> 0;
  };
  const address = toLong(ip);
  const network = toLong(range);
  if (address === null || network === null || !Number.isFinite(prefix) || prefix < 0 || prefix > 32) return false;
  if (prefix === 0) return true;
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  return ((address & mask) >>> 0) === ((network & mask) >>> 0);
}

/** Is this sender one of Paddle's published ranges? IPv6 is compared exactly
 *  rather than parsed: a wrong-but-permissive v6 matcher sitting on a payment
 *  path is worse than no v6 matcher at all. */
export function ipIsFromPaddle(ip: string, cidrs: readonly string[]): boolean {
  const candidate = String(ip || "").trim();
  if (!candidate) return false;
  /* Behind Cloudflare an IPv4 client can reach the Worker mapped as
     ::ffff:a.b.c.d, which would otherwise fail every range check. */
  const normalised = candidate.toLowerCase().startsWith("::ffff:") ? candidate.slice(7) : candidate;
  if (normalised.includes(".")) return cidrs.some((cidr) => cidr.includes(".") && ipv4InCidr(normalised, cidr));
  return cidrs.some((cidr) => cidr.toLowerCase() === normalised.toLowerCase());
}

async function paddleApi(pathname: string, init?: { method?: string; body?: unknown; timeoutMs?: number }): Promise<{ ok: boolean; status: number; data: any; error: string | null }> {
  const key = String(env().PADDLE_API_KEY || "");
  if (!key) return { ok: false, status: 0, data: null, error: "PADDLE_API_KEY is not set" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init?.timeoutMs ?? PADDLE_CHECKOUT_API_TIMEOUT_MS);
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(`${paddleApiBaseUrl()}${pathname}`, {
      method: init?.method || "GET",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: controller.signal,
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch (cause) {
    return { ok: false, status: 0, data: null, error: `Paddle API unreachable: ${(cause as Error)?.message || String(cause)}` };
  } finally {
    clearTimeout(timer);
  }
  let payload: any = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) return { ok: false, status: response.status, data: payload, error: paddleErrorText(payload) || `Paddle API responded ${response.status}` };
  return { ok: true, status: response.status, data: payload?.data ?? payload, error: null };
}

/** Paddle's error shape, flattened to one line an owner can act on. */
function paddleErrorText(payload: any): string | null {
  const errors = payload?.error?.errors;
  if (Array.isArray(errors) && errors.length) return errors.map((entry: any) => `${entry.field || "request"}: ${entry.detail || entry.code || "invalid"}`).join("; ");
  return paddleText(payload?.error?.detail) || paddleText(payload?.error?.code);
}

/**
 * Paddle's subscription webhooks deliberately omit `management_urls` — the
 * cancel and update-card links exist only on the API's subscription object. So
 * they are read once per subscription event and stored, which is what makes
 * "Manage or cancel" and "Update payment card" work from the account window.
 * Failing here must not lose a payment: the plan change is the part that
 * matters, so both links fall back to null and the buttons simply do not show.
 */
async function paddleManagementUrls(subscriptionId: string): Promise<{ cancel: string | null; updatePaymentMethod: string | null }> {
  if (!subscriptionId) return { cancel: null, updatePaymentMethod: null };
  const result = await paddleApi(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { timeoutMs: PADDLE_WEBHOOK_API_TIMEOUT_MS });
  const urls = (result.ok ? result.data?.management_urls : null) || {};
  const https = (value: unknown) => (typeof value === "string" && value.startsWith("https://") ? value : null);
  return { cancel: https(urls.cancel), updatePaymentMethod: https(urls.update_payment_method) };
}

let discoveredPaddlePricesCache: { env: PaddleEnvironment; map: Record<string, string>; fetchedAt: number } | null = null;

async function resolvePaddlePriceEnvMap(): Promise<Record<string, string>> {
  const e = env();
  const out: Record<string, string> = {};
  let missingAny = false;
  for (const slug of PLAN_ORDER.slice(1)) {
    for (const interval of ["monthly", "yearly"] as const) {
      const envKey = PLAN_CONFIG[slug].priceEnv[interval];
      const val = lookupPriceEnv((k) => e[k] as string | undefined, envKey);
      if (val) out[envKey] = val;
      else missingAny = true;
    }
  }
  const apiKey = String(e.PADDLE_API_KEY || "").trim();
  if (!missingAny || (!apiKey.startsWith("pdl_sdbx_") && !apiKey.startsWith("pdl_live_"))) return out;

  const mode = paddleEnvironment();
  if (discoveredPaddlePricesCache && discoveredPaddlePricesCache.env === mode && Date.now() - discoveredPaddlePricesCache.fetchedAt < 60_000) {
    return { ...discoveredPaddlePricesCache.map, ...out };
  }

  const res = await paddleApi("/prices?status=active&include=product&per_page=50", { timeoutMs: 4000 });
  const discovered: Record<string, string> = {};
  if (res.ok && Array.isArray(res.data)) {
    for (const item of res.data) {
      const id = String(item?.id || "").trim();
      if (!id.startsWith("pri_")) continue;
      const cycle = String(item?.billing_cycle?.interval || item?.custom_data?.interval || "").toLowerCase();
      const interval: BillingInterval | null = cycle === "month" || cycle === "monthly" ? "monthly" : cycle === "year" || cycle === "yearly" ? "yearly" : null;
      if (!interval) continue;
      const customPlan = String(item?.custom_data?.plan || item?.product?.custom_data?.plan || "").toLowerCase();
      const text = `${item?.product?.name || ""} ${item?.name || ""} ${item?.description || ""}`.toLowerCase();
      const amount = Number(item?.unit_price?.amount ?? NaN);
      let slug: PlanSlug | null = null;
      if (customPlan === "sceneflow" || text.includes("sceneflow") || text.includes("scene flow")) slug = "sceneflow";
      else if (customPlan === "sceneforge" || text.includes("sceneforge") || text.includes("scene forge")) slug = "sceneforge";
      else if (Number.isFinite(amount)) {
        if (amount === PLAN_CONFIG.sceneflow.prices[interval] * 100) slug = "sceneflow";
        else if (amount === PLAN_CONFIG.sceneforge.prices[interval] * 100) slug = "sceneforge";
      }
      if (slug) {
        const envKey = PLAN_CONFIG[slug].priceEnv[interval];
        if (!discovered[envKey]) discovered[envKey] = id;
      }
    }
    discoveredPaddlePricesCache = { env: mode, map: discovered, fetchedAt: Date.now() };
  }
  return { ...discovered, ...out };
}

/**
 * Which Scenering plan and interval a Paddle price id (`pri_…`) is. The price
 * ids are configuration rather than code, so a price created in Paddle becomes
 * a purchasable plan here by setting one variable (or via catalog discovery
 * when PADDLE_API_KEY is configured).
 */
export function planForPaddlePrice(priceId: string, priceMap?: Record<string, string>): { plan: PlanSlug; interval: BillingInterval } | null {
  if (!priceId) return null;
  const e = env();
  for (const slug of PLAN_ORDER.slice(1)) {
    for (const interval of ["monthly", "yearly"] as const) {
      const key = PLAN_CONFIG[slug].priceEnv[interval];
      const configured = String(priceMap?.[key] || lookupPriceEnv((k) => e[k] as string | undefined, key) || "");
      if (configured === priceId) return { plan: slug, interval };
    }
  }
  return null;
}

/**
 * The price id on a Paddle notification. Subscription webhooks nest the whole
 * price object under `items[].price`, so `items[].price.id` is the identifier
 * to match; a bare `price_id` is accepted too, because that is the shape the
 * API's transaction items use.
 */
function activeSubscriptionItems(items: unknown): any[] {
  if (!Array.isArray(items)) return [];
  const active = items.filter((item) => {
    const status = String((item as any)?.status || "").toLowerCase();
    return !status || status === "active" || status === "trialing";
  });
  return active.length ? active : items;
}

function paddlePriceId(items: unknown): string {
  for (const item of activeSubscriptionItems(items)) {
    const candidate = String((item as any)?.price?.id || (item as any)?.price_id || (item as any)?.priceId || "");
    if (candidate) return candidate;
  }
  return "";
}

function paddleProductId(items: unknown): string {
  for (const item of activeSubscriptionItems(items)) {
    const candidate = String(
      (item as any)?.price?.product_id ||
      (item as any)?.price?.productId ||
      (item as any)?.product?.id ||
      (item as any)?.product_id ||
      (item as any)?.productId ||
      ""
    );
    if (candidate) return candidate;
  }
  return "";
}

export type SubscriptionPlanChange = "initial" | "upgrade" | "downgrade" | "unchanged";

/**
 * Compares the previous mirrored subscription state against the newly parsed
 * subscription items (`price_id` -> `plan` + `interval`) on `subscription.updated`
 * to determine whether the subscription was upgraded or downgraded.
 */
export function classifySubscriptionChange(
  previous: { planId: PlanSlug; billingInterval: BillingInterval; providerPriceId?: string | null } | null | undefined,
  next: { plan: PlanSlug; interval: BillingInterval; priceId?: string | null },
): SubscriptionPlanChange {
  if (!previous) return "initial";
  const planRank: Record<PlanSlug, number> = { free: 0, sceneflow: 1, sceneforge: 2 };
  const prevRank = planRank[previous.planId] ?? 0;
  const nextRank = planRank[next.plan] ?? 0;
  if (nextRank > prevRank) return "upgrade";
  if (nextRank < prevRank) return "downgrade";
  if (previous.billingInterval !== next.interval) {
    return next.interval === "yearly" ? "upgrade" : "downgrade";
  }
  return "unchanged";
}

/** The renewal price as Paddle states it: minor units plus the currency, so
 *  "1900 USD" is nineteen dollars. Stored as text because the currency is part
 *  of the fact, and a bare number would lose it. */
function paddleRenewalPrice(items: unknown): string | null {
  if (!Array.isArray(items)) return null;
  for (const item of items) {
    const unit = (item as any)?.price?.unit_price;
    if (unit && unit.amount != null) return `${String(unit.amount)} ${String(unit.currency_code || "").trim()}`.trim();
  }
  return null;
}

/**
 * Paddle's five subscription statuses (`active`, `trialing`, `past_due`,
 * `paused`, `canceled`) mapped onto the ones the rest of this server already
 * understands — including the expiry sweep, which keeps a cancelled or
 * past-due plan until the period paid for actually ends. "canceled" is
 * Paddle's spelling and "cancelled" this codebase's; the translation happens
 * once, here, so every comparison downstream stays on one vocabulary.
 *
 * An event name wins over the payload's status where the event is the more
 * specific statement — `subscription.resumed` means active whatever the
 * payload was mid-write — and an unrecognised status is stored as-is rather
 * than defaulted to something that grants access.
 */
export function sceneringStatusForPaddle(eventName: string, paddleStatus: string): string {
  switch (eventName) {
    case "subscription.activated":
    case "subscription.resumed": return "active";
    case "subscription.trialing": return "on_trial";
    case "subscription.canceled": return "cancelled";
    case "subscription.paused": return "paused";
    case "subscription.past_due": return "past_due";
    default: {
      const byStatus: Record<string, string> = { active: "active", trialing: "on_trial", past_due: "past_due", paused: "paused", canceled: "cancelled" };
      return byStatus[paddleStatus] || paddleStatus || "pending";
    }
  }
}

/**
 * Decides whether a subscription currently grants paid access.
 *
 * Treats `active`, `trialing` (stored as `on_trial`), and `past_due` (dunning
 * retry window) as access-granting. A `scheduled_change` to `cancel` or `pause`
 * at period end keeps the subscription `active` / `trialing` / `past_due` until
 * its effective date, so access is NOT revoked until `status` actually flips to
 * `canceled` (`cancelled`) or `paused`.
 */
export function subscriptionGrantsPaidAccess(
  input: string | { status?: string | null; subscription_status?: string | null; scheduledChangeAction?: string | null; cancelAtPeriodEnd?: boolean | null } | null | undefined,
): boolean {
  if (!input) return false;
  const raw = typeof input === "string" ? input : String(input.status ?? input.subscription_status ?? "");
  const status = raw.trim().toLowerCase() === "trialing" ? "on_trial" : raw.trim().toLowerCase();
  return ["active", "on_trial", "past_due"].includes(status);
}

/**
 * Resolves a signed-in user's Paddle `customer_id` (`ctm_…`) and owned
 * `subscription_ids` (`sub_…`) strictly server-side from the mirrored
 * `subscriptions` and `billing_customers` tables — never from client input.
 */
export async function resolvePaddleCustomerForUser(user: User): Promise<{ customerId: string; subscriptionIds: string[] } | null> {
  const [subs, mapped] = await Promise.all([
    db.listSubscriptionsForUser(user.id),
    db.findBillingCustomerByUser(user.id, user.email),
  ]);
  const paddleSubs = subs.filter((s) => s.provider === "paddle");
  const activeSubWithCustomer = paddleSubs.find((s) => s.status !== "expired" && s.providerCustomerId);
  const anySubWithCustomer = paddleSubs.find((s) => s.providerCustomerId);
  const customerId = String(activeSubWithCustomer?.providerCustomerId || mapped?.providerCustomerId || anySubWithCustomer?.providerCustomerId || "").trim();
  if (!customerId) return null;
  const subscriptionIds = [
    ...new Set(
      paddleSubs
        .filter((s) => (!s.providerCustomerId || s.providerCustomerId === customerId) && s.providerSubscriptionId)
        .map((s) => String(s.providerSubscriptionId).trim())
        .filter(Boolean)
    ),
  ].slice(0, 25);
  return { customerId, subscriptionIds };
}

/**
 * What goes into the owner's webhook log: a handful of ids and statuses, not
 * the payload. The log is rendered in the administration panel, and it is no
 * place to accumulate customer data. `environment` is recorded because a
 * sandbox delivery is a test purchase — Paddle has no per-event test flag, the
 * two environments are simply separate accounts.
 */
function paddleLogPayload(event: any) {
  const data = event?.data || {};
  return {
    data_id: paddleText(data.id),
    customer_id: paddleText(data.customer_id),
    status: paddleText(data.status),
    price_id: paddlePriceId(data.items) || null,
    environment: paddleEnvironment(),
  };
}

/**
 * What is, and is not, configured for billing. The owner sees this as a
 * checklist in the administration panel, so going live is a matter of filling
 * the gaps it names rather than reading the source.
 */
export function billingConfiguration() {
  const e = env();
  const plans = PLAN_ORDER.slice(1).map((slug) => ({
    plan: slug,
    name: PLAN_CONFIG[slug].name,
    intervals: (["monthly", "yearly"] as const).map((interval) => ({
      interval,
      checkoutEnv: PLAN_CONFIG[slug].checkoutEnv[interval],
      checkoutUrlSet: Boolean(e[PLAN_CONFIG[slug].checkoutEnv[interval]]),
      priceEnv: PLAN_CONFIG[slug].priceEnv[interval],
      priceIdSet: Boolean(lookupPriceEnv((k) => e[k] as string | undefined, PLAN_CONFIG[slug].priceEnv[interval])),
    })),
  }));
  const webhookSecretSet = Boolean(e.PADDLE_WEBHOOK_SECRET);
  const apiKey = paddleText(e.PADDLE_API_KEY);
  const envMode = paddleEnvironment();
  const apiKeyMatchesEnv = Boolean(apiKey) && (envMode === "sandbox" ? !apiKey!.startsWith("pdl_live_apikey_") : !apiKey!.startsWith("pdl_sdbx_apikey_"));
  const apiKeySet = Boolean(apiKey) && apiKeyMatchesEnv;
  const clientToken = paddleText(e.PADDLE_CLIENT_TOKEN);
  const clientEnvironment = paddleText(e.PADDLE_CLIENT_ENVIRONMENT)?.toLowerCase();
  const expectedClientEnv = envMode === "live" ? "production" : "sandbox";
  const clientEnvironmentSet = (clientEnvironment === "sandbox" || clientEnvironment === "production") && clientEnvironment === expectedClientEnv;
  const clientTokenMatchesEnv = Boolean(clientToken) && (expectedClientEnv === "sandbox" ? clientToken!.startsWith("test_") : clientToken!.startsWith("live_"));
  const clientTokenSet = Boolean(clientToken) && clientTokenMatchesEnv;
  const everyPriceSet = plans.every((plan) => plan.intervals.every((i) => i.priceIdSet));
  const everyLinkSet = plans.every((plan) => plan.intervals.every((i) => i.checkoutUrlSet));
  return {
    provider: "paddle",
    environment: paddleEnvironment(),
    apiBaseUrl: paddleApiBaseUrl(),
    webhookSecretSet,
    apiKeySet,
    clientTokenSet,
    clientEnvironmentSet,
    publicAppUrlSet: Boolean(e.PUBLIC_APP_URL),
    webhookPath: PADDLE_WEBHOOK_PATH,
    webhookUrl: e.PUBLIC_APP_URL ? `${String(e.PUBLIC_APP_URL).replace(/\/$/, "")}${PADDLE_WEBHOOK_PATH}` : null,
    requiredEvents: [...PADDLE_WEBHOOK_EVENTS],
    subscriptionEvents: [...PADDLE_SUBSCRIPTION_EVENTS],
    /* Paddle's sandbox and live are separate accounts with separate keys and
       separate price ids, so a production deployment still pointed at sandbox
       is not "almost ready" — it is a site that cannot take a real payment
       while looking as though it can. The checklist says so out loud. */
    sandboxInProduction: isProduction() && paddleEnvironment() === "sandbox",
    ipAllowlistEnabled: paddleWebhookIpAllowlistEnabled(),
    plans,
    /** True when a real customer could buy a plan and have access granted. The
     *  API key counts because without it the server cannot create the tagged
     *  transaction that checkout hands the customer, so price ids alone cannot
     *  take a payment — and the approved checkout URLs count because Paddle
     *  returns no link to send the customer to without one. The client token
     *  and its environment count because the public pricing page previews
     *  prices and opens the overlay checkout with them; without them the
     *  page cannot sell at all. */
    ready: webhookSecretSet && apiKeySet && everyPriceSet && everyLinkSet && clientTokenSet && clientEnvironmentSet && Boolean(e.PUBLIC_APP_URL),
  };
}

export function registerPaddleWebhook(app: Express) {
  app.post(PADDLE_WEBHOOK_PATH, express.raw({ type: "application/json", limit: "2mb" }), asyncHandlerVoid(async (req, res) => {
    const secret = env().PADDLE_WEBHOOK_SECRET as string | undefined;
    if (!secret) return res.status(503).json({ error: "Billing webhook is not configured" });

    /* Defence in depth, off by default and switchable with
       PADDLE_WEBHOOK_IP_ALLOWLIST=on. When it is on, a delivery from outside
       Paddle's published ranges is refused before its body is parsed at all.
       When the ranges cannot be fetched it fails open and says so, because the
       signature check below is what authenticates the caller, and dropping a
       genuine payment over our own transient network failure is the worse
       outcome. Signature verification is never skipped either way. */
    if (paddleWebhookIpAllowlistEnabled()) {
      const cidrs = await paddleSourceCidrs();
      if (cidrs && cidrs.length) {
        const senderIp = clientIp(req);
        if (!ipIsFromPaddle(senderIp, cidrs)) {
          console.warn(`[paddle] refused a webhook from ${senderIp}: not in Paddle's published source ranges`);
          return res.status(403).json({ error: "Forbidden" });
        }
      } else {
        console.warn("[paddle] source-IP allowlist is on but Paddle's /ips could not be fetched; accepting this delivery on its signature alone");
      }
    }
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
    if (!verifyPaddleSignature(body, String(req.headers["paddle-signature"] || ""), secret)) return res.status(401).json({ error: "Invalid signature" });
    let event: any; try { event = JSON.parse(body.toString("utf8")); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
    const eventId = String(event.event_id || ""); const eventName = String(event.event_type || "");
    if (!eventId || !eventName) return res.status(400).json({ error: "Invalid event" });
    const data = (event.data && typeof event.data === "object" ? event.data : {}) as any;

    const result = await (async () => {
      if (await db.webhookEventExists(eventId)) {
        // Not an error — Paddle retries until it gets a 2xx — but the owner's
        // webhook log should show that it happened, so the original row is
        // marked rather than a second row inserted for the same event id.
        await db.markWebhookEventDuplicate(eventId);
        return "duplicate";
      }
      const record = async (status: string) => {
        await db.recordWebhookEvent({ providerEventId: eventId, eventName, status, payload: paddleLogPayload(event) });
        return status;
      };

      /* A customer event: record which account this Paddle customer is, so a
         later subscription webhook can be matched on the customer id alone. */
      if ((PADDLE_CUSTOMER_EVENTS as readonly string[]).includes(eventName)) {
        const customerId = String(data.id || ""); const email = String(data.email || "").trim().toLowerCase();
        if (!customerId || !email) return record("ignored");
        const customUserId = String(data.custom_data?.user_id || "");
        let user = customUserId ? await db.findUserById(customUserId) : null;
        // The email is the stronger identity: a Paddle customer is created from
        // whatever address was typed at checkout, so it wins over a custom_data
        // id that does not belong to the same account.
        if (!user || user.email !== email) { const byEmail = await db.findUserByEmail(email); if (byEmail) user = byEmail; }
        if (!user) return record("unmatched");
        await db.upsertBillingCustomer({ provider: "paddle", providerCustomerId: customerId, userId: user.id, email, lastEventAt: paddleText(event.occurred_at) });
        return record("mapped");
      }

      const isTransactionFulfillment = eventName === "transaction.completed" && Boolean(String(data.subscription_id || "").trim());
      if (!(PADDLE_SUBSCRIPTION_EVENTS as readonly string[]).includes(eventName) && !isTransactionFulfillment) return record("ignored");

      const subscriptionId = isTransactionFulfillment ? String(data.subscription_id || "").trim() : String(data.id || "");
      /* Without a subscription id there is nothing to key a row on, and every
         later event would insert a second one for the same purchase. Refuse it
         as unparseable rather than accumulate rows nobody can update. */
      if (!subscriptionId) return record("ignored");
      const customerId = String(data.customer_id || "");
      const priceId = paddlePriceId(data.items);
      const productId = paddleProductId(data.items);

      /* Which account this subscription belongs to, best evidence first: the
         `custom_data` the server set when it created the transaction, then the
         customer mapping a customer webhook left behind, then any subscription
         already stored against that customer id. */
      const customEmail = String(data.custom_data?.email || "").trim().toLowerCase();
      const customUserId = String(data.custom_data?.user_id || "");
      let user: User | null = customUserId ? await db.findUserById(customUserId) : null;
      if (!user && customEmail) user = await db.findUserByEmail(customEmail);
      if (!user && customerId) {
        const mappedCustomer = await db.findBillingCustomer(customerId);
        const existing = mappedCustomer ? null : await db.findSubscriptionByProviderCustomerId(customerId);
        user = (mappedCustomer ? await db.findUserById(mappedCustomer.userId) : null) || (existing ? await db.findUserById(existing.userId) : null);
        if (!user) {
          const customerRes = await paddleApi(`/customers/${encodeURIComponent(customerId)}`, { timeoutMs: PADDLE_WEBHOOK_API_TIMEOUT_MS });
          const fetchedEmail = customerRes.ok ? String(customerRes.data?.email || "").trim().toLowerCase() : "";
          if (fetchedEmail) {
            user = await db.findUserByEmail(fetchedEmail);
            if (user) {
              await db.upsertBillingCustomer({ provider: "paddle", providerCustomerId: customerId, userId: user.id, email: fetchedEmail, lastEventAt: paddleText(event.occurred_at) });
            }
          }
        }
      }
      if (!user) return record("unmatched");

      let mapped = planForPaddlePrice(priceId);
      if (!mapped && priceId) {
        const resolvedPrices = await resolvePaddlePriceEnvMap();
        mapped = planForPaddlePrice(priceId, resolvedPrices);
      }
      if (!mapped) return record("unknown_price");

      const period = (data.current_billing_period || data.billing_period || {}) as { starts_at?: unknown; ends_at?: unknown };
      const scheduled = (data.scheduled_change || null) as { action?: string; effective_at?: string; resume_at?: string | null } | null;
      const status = isTransactionFulfillment ? "active" : sceneringStatusForPaddle(eventName, String(data.status || ""));
      const periodEnd = paddleText(period.ends_at) || paddleText(data.next_billed_at);
      const cancelScheduled = scheduled?.action === "cancel";

      /* When access ends. Paddle cancels either immediately — `canceled_at` is
         the moment it stopped — or at the end of the period paid for, in which
         case the status stays `active` and a `scheduled_change` of `cancel`
         says when. A pause runs to the end of the current period too. Anything
         else has no end date at all. */
      const expiresAt =
        status === "cancelled" ? paddleText(data.canceled_at) || periodEnd
        : cancelScheduled ? paddleText(scheduled?.effective_at) || periodEnd
        : status === "paused" ? periodEnd
        : null;

      let sub = await db.findSubscriptionByProviderId(subscriptionId);
      /* Paddle guarantees nothing about delivery order: a retry or a replay can
         arrive after a newer event, and applying the older one would resurrect
         state the customer has already moved past — a cancellation undone by a
         late `subscription.updated`, for instance. So an event older than the
         newest one applied to this subscription is logged and dropped. ISO-8601
         UTC strings compare correctly as text, which is how this codebase
         already stores every timestamp. */
      const occurredAt = paddleText(event.occurred_at);
      if (sub && occurredAt && sub.providerEventOccurredAt && occurredAt < sub.providerEventOccurredAt) return record("stale");
      const previousPlanId = sub?.planId ?? null;
      const change = classifySubscriptionChange(sub, { plan: mapped.plan, interval: mapped.interval, priceId });
      const management = await paddleManagementUrls(subscriptionId);
      const fields = {
        provider: "paddle",
        providerCustomerId: customerId || null, providerSubscriptionId: subscriptionId || null,
        providerProductId: productId || null, providerPriceId: priceId || null,
        planId: mapped.plan, billingInterval: mapped.interval, status,
        currentPeriodStart: paddleText(period.starts_at) || paddleText(data.started_at),
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: status === "cancelled" || cancelScheduled,
        // Paddle's own timestamp when it gives one, so the audit trail says
        // when the cancellation happened rather than when this Worker woke up.
        cancelledAt: status === "cancelled" ? paddleText(data.canceled_at) || now() : null,
        expiresAt,
        customerPortalUrl: management.cancel, updatePaymentUrl: management.updatePaymentMethod,
        renewalPrice: paddleRenewalPrice(data.items),
        providerEventOccurredAt: occurredAt,
        /* Paddle sends no card brand or last four on a subscription webhook, so
           those two columns stay as they are; the account window hides the
           line when they are empty. */
      };
      if (!sub) {
        sub = await db.createSubscription({
          id: db.newId("sub"), userId: user.id, provider: "paddle", planId: mapped.plan, billingInterval: mapped.interval, status,
          providerCustomerId: customerId || null, providerSubscriptionId: subscriptionId || null,
          providerProductId: productId || null, providerPriceId: priceId || null,
          currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelledAt: null, expiresAt: null,
          customerPortalUrl: null, updatePaymentUrl: null, cardBrand: null, cardLastFour: null, renewalPrice: null,
          providerEventOccurredAt: null,
        });
      }
      await db.updateSubscription(sub.id, fields);
      if (customerId) {
        await db.upsertBillingCustomer({
          provider: "paddle",
          providerCustomerId: customerId,
          userId: user.id,
          email: customEmail || user.email,
          lastEventAt: occurredAt,
        });
      }

      /* Which statuses are worth access. This is where Paddle and the provider
         it replaced genuinely differ, and getting it wrong either gives service
         away or takes it from somebody who has paid:

           - `canceled` is TERMINAL. Paddle only flips the status once the
             scheduled cancellation takes effect, so the period paid for has
             already run. "Will not renew, but still paid up" is not a status
             here — it is an `active` subscription carrying a `scheduled_change`
             of `cancel`, which the block above records as cancel_at_period_end.
           - `paused` means no billing and no service. A pause that has not
             started yet is likewise still `active` with a scheduled change, so
             the member keeps the plan until the pause actually lands.
           - `past_due` keeps access: Paddle is retrying the card (dunning), and
             the account window says so and offers the update-card link.

         The per-user expiry sweep is still the backstop for the case Paddle
         cannot help with — a subscription whose period ended and whose next
         webhook never arrived. */
      const paid = subscriptionGrantsPaidAccess(status);
      const membership = await db.findMembershipByUserId(user.id);
      if (membership) await db.updateMembership(membership.id, { plan: paid ? mapped.plan : "free", status: "active" });
      else await db.createMembership(user.id, paid ? mapped.plan : "free");
      await record("processed");
      await db.recordBillingEvent({
        userId: user.id,
        subscriptionId: sub.id,
        eventName,
        fromProvider: true,
        extra: {
          change,
          previous_plan_id: previousPlanId,
          plan_id: mapped.plan,
          billing_interval: mapped.interval,
          price_id: priceId || null,
          product_id: productId || null,
        },
      });
      return "processed";
    })();
    return res.status(result === "unmatched" || result === "unknown_price" ? 202 : 200).json({ received: true, status: result });
  }));
}

function asyncHandlerVoid(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
}

export function registerPlatformRoutes(app: Express) {
  /* Allow: /api/social-links — the one API address the public pages read.
     Google renders pages the way a browser does but obeys robots.txt for
     every request the page makes, so with /api/ blocked it never saw the
     social links in the header and footer, nor the profiles they add to
     the structured data (src/shared/structured-data.ts). The longer, more
     specific Allow wins over Disallow: /api/ — the rest of the API stays
     closed to crawlers. */
  app.get("/robots.txt", (req, res) => res.type("text/plain").send(`User-agent: *\nAllow: /\nAllow: /api/social-links\nDisallow: /app\nDisallow: /login\nDisallow: /register\nDisallow: /forgot-password\nDisallow: /verify-email\nDisallow: /reset-password\nDisallow: /api/\nDisallow: /functions/\nSitemap: ${baseUrl(req)}/sitemap.xml\n`));
  app.get("/sitemap.xml", (req, res) => { const root = baseUrl(req); const pages = ["", "/features", "/how-it-works", "/pricing", "/about", "/manual", "/faq", "/contact", "/privacy", "/terms", "/cookies", "/refunds"]; res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((page) => `<url><loc>${root}${page || "/"}</loc></url>`).join("")}</urlset>`); });
  app.get("/api/plans", (_req, res) => res.json({ plans: PLAN_ORDER.map((slug) => PLAN_CONFIG[slug]) }));

  app.post("/api/auth/register", rateLimit("register", 5, 3600000), asyncHandlerVoid(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase(); const displayName = String(req.body?.displayName || "").trim(); const password = String(req.body?.password || "");
    if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email) || displayName.length < 2 || displayName.length > 100 || password.length < 10 || password.length > 256) return res.status(400).json({ error: "Use a valid email, a display name of 2–100 characters, and a password of 10–256 characters." });
    if (await db.findUserByEmail(email)) return res.status(409).json({ error: "An account with that email already exists." });
    const isOwner = Boolean(configuredOwnerEmail() && email === configuredOwnerEmail());
    const user = await db.createUser({ id: db.newId("usr"), email, passwordHash: passwordHash(password), displayName, role: isOwner ? "admin" : "user", isVerified: false });
    await db.createMembership(user.id, isOwner ? "sceneforge" : "free");
    await db.upsertEmailPreference({ userId: user.id, marketingConsent: Boolean(req.body?.marketingConsent), consentTimestamp: now(), consentSource: "registration", consentVersion: "2026-10", trainingStep: 0, updatedAt: now() });
    const raw = randomBytes(32).toString("base64url");
    await db.deleteVerificationTokensForUser(user.id, "verify");
    await db.createVerificationToken(user.id, hashToken(raw), "verify", new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString());
    await sendVerificationEmail(user.email, user.displayName, `${baseUrl(req)}/verify-email?token=${encodeURIComponent(raw)}`);
    return res.status(201).json({ message: "Account created. Check your email to verify it.", requiresVerification: true, ...(!isProduction() ? { developmentVerificationUrl: `/verify-email?token=${encodeURIComponent(raw)}` } : {}) });
  }));

  app.post("/api/auth/login", rateLimit("login", 12, 900000), asyncHandlerVoid(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase(); const password = String(req.body?.password || "");
    let user = await db.findUserByEmail(email);
    if (!user || !passwordMatches(password, user.passwordHash)) return res.status(401).json({ error: "Email or password is incorrect." });
    if (!user.isVerified) return res.status(403).json({ error: "Verify your email before signing in.", code: "EMAIL_UNVERIFIED" });
    user = await ensureOwnerPrivileges(user);
    const raw = randomBytes(32).toString("base64url");
    await db.createSession(user.id, hashToken(raw), new Date(Date.now() + 24 * 30 * 3600000).toISOString());
    setSessionCookie(res, raw);
    return res.json(await accountPayload(user));
  }));

  app.post("/api/auth/logout", asyncHandlerVoid(async (req, res) => {
    const raw = cookies(req).scenering_session;
    if (raw) await db.deleteSessionByToken(hashToken(raw));
    clearSessionCookie(res); res.json({ ok: true });
  }));

  app.get("/api/auth/session", asyncHandlerVoid(async (req, res) => {
    const auth = await findSession(req);
    return auth ? res.json(await accountPayload(auth.user)) : res.status(401).json({ error: "No active session" });
  }));

  app.post("/api/auth/verify-email", rateLimit("verify", 10, 3600000), asyncHandlerVoid(async (req, res) => {
    const hash = hashToken(String(req.body?.token || ""));
    const token = await db.findVerificationToken(hash, "verify");
    const user = token && (await db.findUserById(token.userId));
    if (!token || !user) return res.status(400).json({ error: "This verification link is invalid or expired." });
    await db.updateUser(user.id, { isVerified: true });
    await db.deleteVerificationToken(token.id);
    return res.json({ message: "Email verified. You can now sign in." });
  }));

  app.post("/api/auth/resend-verification", rateLimit("resend", 3, 3600000), asyncHandlerVoid(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = await db.findUserByEmail(email);
    if (user && !user.isVerified) {
      const raw = randomBytes(32).toString("base64url");
      await db.deleteVerificationTokensForUser(user.id, "verify");
      await db.createVerificationToken(user.id, hashToken(raw), "verify", new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString());
      await sendVerificationEmail(user.email, user.displayName, `${baseUrl(req)}/verify-email?token=${encodeURIComponent(raw)}`);
    }
    res.json({ message: "If the account exists, a verification message has been sent." });
  }));

  app.post("/api/auth/forgot-password", rateLimit("forgot", 3, 3600000), asyncHandlerVoid(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = await db.findUserByEmail(email);
    let developmentResetUrl = "";
    if (user) {
      const raw = randomBytes(32).toString("base64url");
      await db.deleteVerificationTokensForUser(user.id, "reset");
      await db.createVerificationToken(user.id, hashToken(raw), "reset", new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString());
      developmentResetUrl = `/reset-password?token=${encodeURIComponent(raw)}`;
      await sendPasswordResetEmail(user.email, user.displayName, `${baseUrl(req)}${developmentResetUrl}`);
    }
    res.json({ message: "If the account exists, a password-reset message has been sent.", ...(!isProduction() && developmentResetUrl ? { developmentResetUrl } : {}) });
  }));

  app.post("/api/auth/reset-password", rateLimit("reset", 5, 3600000), asyncHandlerVoid(async (req, res) => {
    const password = String(req.body?.password || "");
    if (password.length < 10 || password.length > 256) return res.status(400).json({ error: "Use between 10 and 256 characters." });
    const hash = hashToken(String(req.body?.token || ""));
    const token = await db.findVerificationToken(hash, "reset");
    const user = token && (await db.findUserById(token.userId));
    if (!token || !user) return res.status(400).json({ error: "This reset link is invalid or expired." });
    await db.updateUser(user.id, { passwordHash: passwordHash(password) });
    await db.deleteVerificationTokensForUser(user.id, "reset");
    await db.deleteSessionsForUser(user.id);
    return res.json({ message: "Password updated. Sign in with your new password." });
  }));

  app.get("/api/account", requireUser, asyncHandlerVoid(async (req, res) => { const { user } = (req as any).auth as Auth; res.json(await accountPayload(user)); }));
  app.get("/api/entitlements", requireUser, asyncHandlerVoid(async (req, res) => { const { user, plan } = (req as any).auth as Auth; res.json({ plan, entitlements: getPlanConfig(plan), usage: await weeklyUsage(user.id), remaining: await remainingUsage(user.id, plan) }); }));
  app.get("/api/entitlements/:feature", requireUser, (req, res) => { const { plan } = (req as any).auth as Auth; const feature = req.params.feature as FeatureKey; if (!(feature in PLAN_CONFIG.free.features)) return res.status(404).json({ error: "Unknown feature" }); res.json({ allowed: canPlanUseFeature(plan, feature), plan }); });

  app.post("/api/usage/final-export/check", requireUser, rateLimit("export-check", 120, 3600000), asyncHandlerVoid(async (req, res) => {
    const { user, plan } = (req as any).auth as Auth; const duration = Number(req.body?.durationMinutes); const format = req.body?.format === "short" ? "short" : "long";
    if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) return res.status(400).json({ error: "Valid duration required" });
    res.json({ allowed: await canExport(user.id, plan, duration, format), remaining: await remainingUsage(user.id, plan) });
  }));
  app.post("/api/usage/final-export/reserve", requireUser, rateLimit("export-reserve", 30, 3600000), asyncHandlerVoid(async (req, res) => {
    const { user, plan } = (req as any).auth as Auth; const duration = Number(req.body?.durationMinutes); const format = req.body?.format === "short" ? "short" : req.body?.format === "long" ? "long" : null;
    const projectId = String(req.body?.projectId || "").slice(0, 200); const creativeManifest = parseCreativeManifest(req.body?.creativeManifest);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 1440 || !format || !projectId || !creativeManifest) return res.status(400).json({ error: "Valid export details and creative manifest required" });
    const policyError = validateExportCreativeManifest(plan, creativeManifest);
    if (policyError) return res.status(403).json({ error: `${policyError}. You can still preview it or change membership.` });
    if (!(await canExport(user.id, plan, duration, format))) return res.status(403).json({ error: "Your final-export allowance has been reached. Previews remain unlimited." });
    const reservation = await db.createExportReservation({ userId: user.id, projectId, durationMinutes: duration, format, creativeManifest, expiresAt: new Date(Date.now() + 2 * 3600000).toISOString() });
    return res.status(201).json({ reservationId: reservation.id, expiresAt: reservation.expiresAt });
  }));
  app.post("/api/usage/final-export/complete", requireUser, rateLimit("export-complete", 60, 3600000), asyncHandlerVoid(async (req, res) => {
    const { user } = (req as any).auth as Auth; const reservationId = String(req.body?.reservationId || "");
    const row = await db.findExportReservation(reservationId, user.id);
    if (!row) return res.status(404).json({ error: "Export reservation not found" });
    if (row.status === "completed") return res.json({ recorded: true });
    if (row.status !== "reserved") return res.status(409).json({ error: "Export reservation is no longer valid" });
    await db.completeExportReservation(row.id);
    await db.createUsageRecord({ userId: user.id, kind: "final_export", durationMinutes: row.durationMinutes, format: row.format, projectId: row.projectId, reservationId: row.id });
    return res.json({ recorded: true });
  }));
  app.post("/api/usage/final-export/cancel", requireUser, rateLimit("export-cancel", 60, 3600000), asyncHandlerVoid(async (req, res) => {
    const { user } = (req as any).auth as Auth; const reservationId = String(req.body?.reservationId || "");
    const row = await db.findExportReservation(reservationId, user.id);
    if (row && row.status === "reserved") await db.cancelExportReservation(row.id);
    res.json({ cancelled: true });
  }));
  app.post("/api/usage/final-export", requireUser, asyncHandlerVoid(async (req, res) => {
    const { user, plan } = (req as any).auth as Auth; const duration = Number(req.body?.durationMinutes); const format = req.body?.format === "short" ? "short" : "long";
    if (!(duration > 0)) return res.status(400).json({ error: "Valid duration required" });
    if (!(await canExport(user.id, plan, duration, format))) return res.status(403).json({ error: "Your final-export allowance has been reached. Previews remain unlimited." });
    await db.createUsageRecord({ userId: user.id, kind: "final_export", durationMinutes: duration, format, projectId: String(req.body?.projectId || "") || null, reservationId: null });
    return res.status(201).json({ recorded: true });
  }));

  /* ONE DOWNLOAD = ONE USE OF THE PLAN'S WEEKLY ALLOWANCE.
     Rendering is free: a finished render waits in the Vault, and the Vault's
     Download button calls this BEFORE the file is saved — the browser only
     writes the file after a 201 here. The limit check and the insert are a
     single statement (db.createUsageRecordWithinLimit), so downloads racing
     in parallel tabs cannot overspend. Free keeps its separate weekly
     Shorts / long-video counts and its length ceilings; SceneForge has no
     count, but every download is still recorded. The week starts Monday
     00:00 UTC, the same week remainingUsage() reports. */
  app.post("/api/usage/download", requireUser, rateLimit("download", 60, 3600000), asyncHandlerVoid(async (req, res) => {
    const { user, plan } = (req as any).auth as Auth;
    const duration = Number(req.body?.durationMinutes);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) return res.status(400).json({ error: "Valid duration required" });
    // Derived here, never taken from the browser: one minute or less is a Short.
    const format: "short" | "long" = duration <= 1 ? "short" : "long";
    const projectId = String(req.body?.projectId || "").slice(0, 200) || null;
    const config = getPlanConfig(plan);
    const refuse = async (error: string) =>
      res.status(403).json({ error, code: "DOWNLOAD_LIMIT_REACHED", remaining: await remainingUsage(user.id, plan) });
    const record = { userId: user.id, kind: "download" as const, durationMinutes: duration, format, projectId, reservationId: null };
    const since = weekStart().toISOString();
    let recorded: UsageRecord | null;
    if (config.id === "free") {
      const maxMinutes = format === "short" ? config.limits.maxShortMinutes : config.limits.maxLongMinutes;
      if (maxMinutes != null && duration > maxMinutes) return refuse(`Free downloads can be up to ${maxMinutes} minutes long. Upgrade to download longer videos.`);
      const limit = format === "short" ? config.limits.shortExportsPerWeek : config.limits.longExportsPerWeek;
      recorded = limit == null ? await db.createUsageRecord(record) : await db.createUsageRecordWithinLimit(record, since, limit, format);
      if (!recorded) return refuse(`You have used this week's ${limit} Free ${format === "short" ? "Shorts" : "long-video"} download${limit === 1 ? "" : "s"}. Your downloads reset on Monday (00:00 UTC), or upgrade for more.`);
    } else {
      const limit = config.limits.finalExportsPerWeek;
      recorded = limit == null ? await db.createUsageRecord(record) : await db.createUsageRecordWithinLimit(record, since, limit, "all");
      if (!recorded) return refuse(`You have used this week's ${limit} ${config.name} downloads. Your downloads reset on Monday (00:00 UTC).`);
    }
    return res.status(201).json({ recorded: true, remaining: await remainingUsage(user.id, plan) });
  }));

  /**
   * Hands the signed-in member a Paddle checkout link for the plan they picked.
   *
   * The transaction is created here, server to server, rather than by giving
   * the browser a link to build on: `custom_data` is the only thing that ties a
   * Paddle payment back to a Scenering account, and it has to be set by the
   * party that knows who is signed in. Paddle signs the transaction, carries
   * `custom_data` through the payment onto the subscription it creates, and
   * sends it home on every webhook for that subscription — so a customer cannot
   * edit it to somebody else's account, and a payment cannot arrive that this
   * server cannot attribute.
   */
  app.get("/api/billing/checkout/:plan/:interval", requireUser, rateLimit("checkout", 20, 3600000), asyncHandlerVoid(async (req, res) => {
    const { user } = (req as any).auth as Auth; const slug = req.params.plan as PlanSlug; const interval = req.params.interval as BillingInterval;
    if (!PLAN_CONFIG[slug] || slug === "free" || !["monthly", "yearly"].includes(interval)) return res.status(400).json({ error: "Invalid plan selection" });
    const priceEnv = PLAN_CONFIG[slug].priceEnv[interval]; const priceId = lookupPriceEnv((k) => env()[k] as string | undefined, priceEnv);
    const checkoutEnv = PLAN_CONFIG[slug].checkoutEnv[interval]; const checkoutUrl = String(env()[checkoutEnv] || "");
    if (!priceId || !env().PADDLE_API_KEY) return res.status(503).json({ error: "Checkout is not configured yet.", code: "BILLING_NOT_CONFIGURED", detail: `${priceEnv} and PADDLE_API_KEY must both be set` });
    const created = await paddleApi("/transactions", {
      method: "POST",
      body: {
        items: [{ price_id: priceId, quantity: 1 }],
        custom_data: { user_id: user.id, email: user.email, plan: slug, interval },
        ...(checkoutUrl ? { checkout: { url: checkoutUrl } } : {}),
      },
    });
    if (!created.ok) return res.status(502).json({ error: "Paddle could not open checkout.", code: "BILLING_PROVIDER_ERROR", detail: created.error });
    const url = paddleText(created.data?.checkout?.url);
    /* Paddle only returns a link when the transaction carries an approved
       checkout URL, so the missing piece is named rather than reported as a
       mystery: the variable holds a URL registered in Paddle → Account
       settings → Checkout settings. */
    if (!url) return res.status(503).json({ error: "Checkout is not configured yet.", code: "BILLING_NOT_CONFIGURED", detail: `${checkoutEnv} must hold an approved checkout URL` });
    if (!url.startsWith("https://") && isProduction()) return res.status(503).json({ error: "Checkout must use HTTPS." });
    res.setHeader("Cache-Control", "no-store");
    res.json({ url, provider: "paddle", environment: paddleEnvironment(), transactionId: paddleText(created.data?.id) });
  }));

  /**
   * Mints a temporary Paddle Customer Portal session for the signed-in user
   * (`POST /customers/{customer_id}/portal-sessions`) and returns only the
   * hosted portal overview URL.
   *
   * Security model:
   *   1. Authenticates the user first via `requireUser` before any DB query or
   *      Paddle API call.
   *   2. Resolves `customer_id` (`ctm_…`) and owned `subscription_ids` (`sub_…`)
   *      strictly server-side from the authenticated session (`subscriptions`
   *      and `billing_customers`) — any client-supplied customer ID in the
   *      body or query string is ignored.
   *   3. Returns only `{ url }` (`urls.general.overview`) with `no-store` so
   *      session metadata and deep-link tables are never leaked or cached.
   */
  const handleCustomerPortalSession = asyncHandlerVoid(async (req, res) => {
    const { user } = (req as any).auth as Auth;
    const resolved = await resolvePaddleCustomerForUser(user);
    if (!resolved) {
      return res.status(404).json({
        error: "No billing account found for this user. Subscribe to a plan first.",
        code: "NO_BILLING_CUSTOMER",
      });
    }
    if (!env().PADDLE_API_KEY) {
      return res.status(503).json({
        error: "Customer portal is not configured yet.",
        code: "BILLING_NOT_CONFIGURED",
        detail: "PADDLE_API_KEY must be set",
      });
    }
    const created = await paddleApi(`/customers/${encodeURIComponent(resolved.customerId)}/portal-sessions`, {
      method: "POST",
      body: { subscription_ids: resolved.subscriptionIds },
    });
    if (!created.ok) {
      return res.status(502).json({
        error: "Paddle could not open the customer portal.",
        code: "BILLING_PROVIDER_ERROR",
        detail: created.error,
      });
    }
    const url = paddleText(created.data?.urls?.general?.overview);
    if (!url || (!url.startsWith("https://") && isProduction())) {
      return res.status(502).json({
        error: "Paddle did not return a valid customer portal URL.",
        code: "BILLING_PROVIDER_ERROR",
      });
    }
    res.setHeader("Cache-Control", "no-store");
    res.json({ url });
  });
  app.post("/api/billing/portal", requireUser, rateLimit("billing-portal", 20, 3600000), handleCustomerPortalSession);
  app.get("/api/billing/portal", requireUser, rateLimit("billing-portal", 20, 3600000), handleCustomerPortalSession);

  /**
   * The visitor's country as the edge reports it — Cloudflare sets
   * CF-IPCountry on every request, Vercel sets x-vercel-ip-country.
   * Returns null when neither header is usable (absent, "UNKNOWN",
   * the Tor exit code "T1", …): the caller then omits the country
   * entirely and Paddle infers it from the IP address. The "OTHERS"
   * sentinel some integrations use is never passed to Paddle — it
   * is not a country code.
   */
  function visitorCountry(req: Request): string | null {
    const raw = (req.get("cf-ipcountry") || req.get("x-vercel-ip-country") || "").trim().toUpperCase();
    return /^[A-Z]{2}$/.test(raw) && raw !== "UNKNOWN" && raw !== "T1" ? raw : null;
  }

  /**
   * Everything the public pricing page needs to talk to Paddle
   * directly: the client-side token, the environment, the visitor's
   * country and the tier list with its Paddle price ids. None of it
   * is secret — a client-side token is public by design and price
   * ids are published in every checkout URL — but it all comes from
   * the server's environment rather than a build-time constant, so
   * rotating a token or a price id needs no redeploy.
   *
   * The environment is read, never guessed: PADDLE_CLIENT_TOKEN or
   * PADDLE_CLIENT_ENVIRONMENT missing is a 503 naming them, so a
   * misconfigured deployment fails loudly on the pricing page
   * instead of silently opening checkout against the wrong
   * Paddle account.
   */
  app.get("/api/billing/public-config", rateLimit("billing-public-config", 60, 60000), asyncHandlerVoid(async (_req, res) => {
    const clientToken = paddleText(env().PADDLE_CLIENT_TOKEN);
    const clientEnvironment = paddleText(env().PADDLE_CLIENT_ENVIRONMENT)?.toLowerCase();
    const expectedClientEnv = paddleEnvironment() === "live" ? "production" : "sandbox";
    const expectedPrefix = expectedClientEnv === "sandbox" ? "test_" : "live_";
    if (!clientToken || (clientEnvironment !== "sandbox" && clientEnvironment !== "production")) {
      return res.status(503).json({ error: "Checkout pricing is not configured yet.", code: "PADDLE_CLIENT_NOT_CONFIGURED", detail: "PADDLE_CLIENT_TOKEN and PADDLE_CLIENT_ENVIRONMENT (\"sandbox\" or \"production\") must both be set" });
    }
    if (clientEnvironment !== expectedClientEnv || !clientToken.startsWith(expectedPrefix)) {
      return res.status(503).json({ error: "Checkout pricing environment mismatch.", code: "PADDLE_ENVIRONMENT_MISMATCH", detail: `PADDLE_ENVIRONMENT=${paddleEnvironment()} requires PADDLE_CLIENT_ENVIRONMENT=${expectedClientEnv} and a ${expectedPrefix}-prefixed PADDLE_CLIENT_TOKEN` });
    }
    const resolvedPrices = await resolvePaddlePriceEnvMap();
    res.setHeader("Cache-Control", "no-store");
    res.json({
      environment: clientEnvironment,
      clientToken,
      country: visitorCountry(_req),
      tiers: buildPricingTiers((name) => resolvedPrices[name] || (env()[name] as string | undefined)),
    });
  }));

  app.get("/api/admin/overview", requireAdmin, rateLimit("admin-overview", 120, 3600000), asyncHandlerVoid(async (req, res) => {
    /* Bulk reads, not per-user queries. The first version of this endpoint
       awaited ~8 D1 round trips per user (plan, subscription, grant, usage,
       preferences, plus the sweeps) inside a Promise.all over every user:
       with more than a handful of accounts it exceeded the Workers free
       plan's 50-subrequests-per-invocation cap outright, and past six
       concurrent queries it stalled on the platform's six-connection limit.
       Everything below is fetched in a fixed handful of queries and the
       per-user values are computed in memory — identical output, bounded
       cost no matter how many accounts exist. */
    const users = await db.listUsers();
    await db.expireStaleComplimentaryGrants(); // once, not once per user
    const [memberships, subscriptions, grants, usageRows, prefs, codes, contacts, webhookEvents] = await Promise.all([
      db.listActiveMemberships(),
      db.listNonExpiredSubscriptions(),
      db.listActiveComplimentaryGrants(),
      db.listAllUsageSince(weekStart().toISOString()),
      db.listEmailPreferences(),
      db.listRecentComplimentaryCodes(100),
      db.listRecentContactSubmissions(200),
      db.listRecentWebhookEvents(25),
    ]);

    // "Latest row per user" — the bulk queries are ordered so the first
    // occurrence per user_id is what the per-user LIMIT 1 query returned.
    const latest = <T extends { userId: string }>(rows: T[]): Map<string, T> => {
      const map = new Map<string, T>();
      for (const row of rows) if (!map.has(row.userId)) map.set(row.userId, row);
      return map;
    };
    const membershipByUser: Map<string, Membership> = latest(memberships);
    const subscriptionByUser: Map<string, Subscription> = latest(subscriptions);
    const grantByUser: Map<string, ComplimentaryGrant> = latest(grants);
    const usageByUser = new Map<string, UsageRecord[]>();
    for (const row of usageRows) {
      const list = usageByUser.get(row.userId) || [];
      list.push(row);
      usageByUser.set(row.userId, list);
    }
    const prefsByUser = new Map<string, EmailPreference>(prefs.map((p) => [p.userId, p]));
    const planRank: Record<PlanSlug, number> = { free: 0, sceneflow: 1, sceneforge: 2 };
    // Subscription-expiry write-backs (the same backstop as
    // sweepUserSubscriptionExpiry). Collected while computing, awaited
    // before responding — on Workers a floating promise can be cancelled
    // the moment the response is sent.
    const sweepWrites: Promise<unknown>[] = [];

    const usersPayload = users.map((user) => {
      // Same plan resolution as getUserPlan(), minus the per-user sweeps.
      const membership = membershipByUser.get(user.id) || null;
      const grant = grantByUser.get(user.id) || null;
      let plan: PlanSlug;
      if (user.role === "admin") plan = "sceneforge";
      else {
        // Same expiry backstop as sweepUserSubscriptionExpiry(), applied
        // from the already-fetched subscription row; the (rare) expired
        // ones are written back below so the database stays truthful.
        const sub = subscriptionByUser.get(user.id) || null;
        if (sub && ((sub.status !== "active" && sub.status !== "on_trial") || sub.cancelAtPeriodEnd)) {
          const ends = Date.parse(String(sub.expiresAt || sub.currentPeriodEnd || ""));
          if (Number.isFinite(ends) && ends <= Date.now()) {
            if (sub.status !== "cancelled") sweepWrites.push(db.updateSubscription(sub.id, { status: "expired" }));
            subscriptionByUser.delete(user.id);
            if (membership && membership.plan !== "free") sweepWrites.push(db.updateMembership(membership.id, { plan: "free" }));
            if (membership) membershipByUser.set(user.id, { ...membership, plan: "free" });
          }
        }
        const paid: PlanSlug = membership?.plan || "free";
        const complimentary: PlanSlug = grant?.planId || "free";
        plan = planRank[complimentary] > planRank[paid] ? complimentary : paid;
      }

      const usageRowsForUser = usageByUser.get(user.id) || [];
      const usage = { finalExports: usageRowsForUser.length, finalExportMinutes: Number(usageRowsForUser.reduce((sum, r) => sum + r.durationMinutes, 0).toFixed(2)) };
      const effective = {
        ...(membership ? { id: membership.id, user_id: membership.userId, status: membership.status } : { id: "", user_id: user.id, status: "active" }),
        plan_id: plan,
        source: user.role === "admin" ? "owner_admin" : grant && grant.planId === plan ? "complimentary" : plan === "free" ? "free" : "verified_subscription",
        complimentary_ends_at: grant && grant.planId === plan ? grant.endsAt : null,
        complimentary_period: grant && grant.planId === plan ? grant.period : null,
      };
      return {
        ...safeUser(user),
        membership: effective,
        subscription: apiSubscription(subscriptionByUser.get(user.id) || null),
        complimentaryGrant: apiGrant(grant),
        usage,
        marketingConsent: prefsByUser.get(user.id)?.marketingConsent || false,
      };
    });
    await Promise.all(sweepWrites);
    res.setHeader("Cache-Control", "no-store");
    const e = env();
    // Summary counts for the dashboard header. Derived from `usersPayload`
    // (already loaded above to build the per-user list) rather than issuing
    // separate COUNT(*) queries — the data's already in memory, so a second
    // round trip to D1 would just be recomputing the same numbers slower.
    const stats = {
      userCount: usersPayload.length,
      activeMemberCount: usersPayload.filter((u) => u.membership?.status === "active").length,
      activeSubscriptionCount: usersPayload.filter((u) => u.subscription?.status === "active").length,
    };
    res.json({
      owner: "Henry John Vincent Horlick", organization: "Horlick Group", users: usersPayload, stats,
      complimentaryCodes: codes.map(({ codeHash: _hash, ...code }) => code),
      contacts, plans: PLAN_ORDER.map((slug) => PLAN_CONFIG[slug]),
      configuration: { emailProviderConfigured: Boolean(e.EMAIL_PROVIDER && e.EMAIL_PROVIDER !== "console"), paddleConfigured: Boolean(e.PADDLE_WEBHOOK_SECRET && e.PADDLE_API_KEY), publicAppUrlConfigured: Boolean(e.PUBLIC_APP_URL), production: isProduction() },

      billing: billingConfiguration(), webhookEvents: webhookEvents.reverse(),
      inbox: await inboxSummarySafe(),
    });
  }));

  app.post("/api/admin/complimentary-codes", requireAdmin, rateLimit("admin-code", 60, 3600000), asyncHandlerVoid(async (req, res) => {
    const { user: admin } = (req as any).auth as Auth; const planId = req.body?.planId as PlanSlug; const period = "year" as const;
    const validForDays = [7, 30, 90].includes(Number(req.body?.validForDays)) ? Number(req.body.validForDays) : 30;
    if (!["sceneflow", "sceneforge"].includes(planId)) return res.status(400).json({ error: "Choose a complimentary plan." });
    const raw = `SCN-${randomBytes(12).toString("hex").toUpperCase()}`;
    const expires = new Date(Date.now() + validForDays * 86400000);
    const record = await db.createComplimentaryCode({ codeHash: hashToken(raw), codePrefix: `${raw.slice(0, 8)}…${raw.slice(-4)}`, planId: planId as Exclude<PlanSlug, "free">, period, expiresAt: expires.toISOString(), createdBy: admin.id });
    res.status(201).json({ code: raw, codeId: record.id, planId: record.planId, period: record.period, expiresAt: record.expiresAt, redeemUrl: `/register?code=${encodeURIComponent(raw)}` });
  }));
  app.post("/api/admin/complimentary-codes/:id/revoke", requireAdmin, rateLimit("admin-code-revoke", 60, 3600000), asyncHandlerVoid(async (req, res) => {
    const revoked = await db.revokeComplimentaryCode(String(req.params.id));
    return revoked ? res.json({ revoked: true }) : res.status(404).json({ error: "Active access code not found." });
  }));
  app.post("/api/complimentary-codes/redeem", requireUser, rateLimit("code-redeem", 20, 3600000), asyncHandlerVoid(async (req, res) => {
    const { user } = (req as any).auth as Auth; const raw = String(req.body?.code || "").trim().toUpperCase();
    if (!raw || raw.length > 100 || user.role === "admin") return res.status(400).json({ error: "This access code is not valid." });
    await db.expireStaleComplimentaryCodes();
    const code = await db.findActiveComplimentaryCodeByHash(hashToken(raw));
    if (!code) {
      // Not a one-time code: perhaps a gift code from the Email Centre,
      // which many people can use (server/gift-codes.ts has the rules).
      const gift = await claimGiftCode(user, raw);
      if (gift.status === "refused") return res.status(400).json({ error: gift.error });
      if (gift.status === "not_found") return res.status(400).json({ error: "This access code is invalid, expired, revoked, or already used." });
      await db.recordBillingEvent({ userId: user.id, subscriptionId: null, eventName: "gift_code_claimed", fromProvider: false, extra: { code_id: gift.code.id, plan_id: gift.code.planId, period: gift.code.period, ends_at: gift.grant.endsAt } });
      const giftPlan = await getUserPlan(user);
      return res.json({ redeemed: true, grant: { ...gift.grant, ...apiGrant(gift.grant) }, membership: await effectiveMembership(user, giftPlan) });
    }
    // Claimed only while still unused: two requests racing with the same
    // one-time code cannot both get the membership.
    if (!(await db.redeemComplimentaryCode(code.id, user.id))) return res.status(400).json({ error: "This access code is invalid, expired, revoked, or already used." });
    await db.revokeActiveComplimentaryGrantsForUser(user.id);
    const start = new Date(); const end = new Date(start); if (code.period === "month") end.setUTCMonth(end.getUTCMonth() + 1); else end.setUTCFullYear(end.getUTCFullYear() + 1);
    const grant = await db.createComplimentaryGrant({ userId: user.id, planId: code.planId, period: code.period, startsAt: start.toISOString(), endsAt: end.toISOString(), grantedBy: code.createdBy, reason: "Complimentary access code", accessCodeId: code.id, status: "active" });
    await db.recordBillingEvent({ userId: user.id, subscriptionId: null, eventName: "complimentary_code_redeemed", fromProvider: false, extra: { code_id: code.id, plan_id: code.planId, period: code.period, ends_at: grant.endsAt } });
    const plan = await getUserPlan(user);
    return res.json({ redeemed: true, grant: { ...grant, ...apiGrant(grant) }, membership: await effectiveMembership(user, plan) });
  }));
  app.post("/api/admin/complimentary-memberships", requireAdmin, rateLimit("admin-grant", 60, 3600000), asyncHandlerVoid(async (req, res) => {
    const { user: admin } = (req as any).auth as Auth; const requestedUserId = String(req.body?.userId || ""); const requestedEmail = String(req.body?.email || "").trim().toLowerCase();
    // A gift lasts one of the lengths in src/lib/gift-lengths.ts ("month" and "year" as always, plus a week, three or six months).
    const planId = req.body?.planId as PlanSlug; const period = isGiftLength(req.body?.period) ? req.body.period : null;
    const reason = String(req.body?.reason || "").trim().slice(0, 500);
    if ((!requestedUserId && !requestedEmail) || !period || !["sceneflow", "sceneforge"].includes(planId)) return res.status(400).json({ error: "Choose a customer, plan, and complimentary period." });
    const recipient = requestedUserId ? await db.findUserById(requestedUserId) : await db.findUserByEmail(requestedEmail);
    if (!recipient || !recipient.isVerified || recipient.role === "admin") return res.status(404).json({ error: "Eligible customer account not found." });
    await db.revokeActiveComplimentaryGrantsForUser(recipient.id);
    const start = new Date(); const end = giftEndsAt(start, period);
    const grant = await db.createComplimentaryGrant({ userId: recipient.id, planId: planId as Exclude<PlanSlug, "free">, period, startsAt: start.toISOString(), endsAt: end.toISOString(), grantedBy: admin.id, reason: reason || null, accessCodeId: null });
    await db.recordBillingEvent({ userId: recipient.id, subscriptionId: null, eventName: "complimentary_membership_granted", fromProvider: false, extra: { granted_by: admin.id, plan_id: planId, period, ends_at: grant.endsAt, reason } });
    const plan = await getUserPlan(recipient);
    res.status(201).json({ grant: { ...grant, ...apiGrant(grant) }, recipient: safeUser(recipient), membership: await effectiveMembership(recipient, plan) });
  }));
  app.post("/api/admin/complimentary-memberships/:id/revoke", requireAdmin, rateLimit("admin-grant-revoke", 60, 3600000), asyncHandlerVoid(async (req, res) => {
    const { user: admin } = (req as any).auth as Auth; const grant = await db.findComplimentaryGrantById(String(req.params.id));
    if (!grant) return res.status(404).json({ error: "Complimentary membership not found." });
    if (grant.status === "active") {
      await db.revokeComplimentaryGrant(grant.id);
      await db.recordBillingEvent({ userId: grant.userId, subscriptionId: null, eventName: "complimentary_membership_revoked", fromProvider: false, extra: { granted_by: admin.id, grant_id: grant.id } });
    }
    res.json({ revoked: true, grant: apiGrant(grant) });
  }));
  app.put("/api/admin/contacts/:id", requireAdmin, rateLimit("admin-contact", 120, 3600000), asyncHandlerVoid(async (req, res) => {
    const allowed = new Set(["new", "open", "resolved", "closed"]); const status = String(req.body?.status || "");
    if (!allowed.has(status)) return res.status(400).json({ error: "Invalid contact status" });
    const updated = await db.updateContactStatus(String(req.params.id), status);
    return updated ? res.json(updated) : res.status(404).json({ error: "Contact message not found" });
  }));

  /* The configured social profiles. Public on purpose: the marketing footer
     and the studio chrome both render these icons for signed-out visitors. */
  app.get("/api/social-links", asyncHandlerVoid(async (_req, res) => { res.setHeader("Cache-Control", "no-store"); res.json({ links: await publicSocialLinks(), platforms: SOCIAL_LINK_PLATFORMS.map(({ id, label }) => ({ id, label })) }); }));
  app.put("/api/admin/social-links", requireAdmin, rateLimit("admin-social-links", 60, 3600000), asyncHandlerVoid(async (req, res) => {
    const { user: admin } = (req as any).auth as Auth;
    const result = sanitizeSocialLinks(req.body);
    if ("error" in result) return res.status(400).json({ error: result.error });
    await db.setSetting(SOCIAL_LINKS_SETTING_KEY, JSON.stringify({ ...result.links, updated_at: now(), updated_by: admin.id }));
    res.json({ links: await publicSocialLinks() });
  }));

  /* /api/email-preferences (GET/PUT) and /api/email/unsubscribe are
     registered by the Email Centre (server/email-centre.ts): they accept
     BOTH a signed-in session and the signed token that marketing emails
     carry, so a recipient can manage preferences without signing in while
     the account-settings path keeps working exactly as before. */

  app.post("/api/contact", rateLimit("contact", 5, 3600000), asyncHandlerVoid(async (req, res) => {
    const { name, email, subject, message, category, website } = req.body || {};
    if (website) return res.status(201).json({ message: "Thanks — your message has been received." });
    const categories = ["General", "Technical", "Billing", "Account", "Feature Request", "Business", "Other"];
    if (String(name).trim().length < 2 || String(name).trim().length > 100 || String(email).length > 254 || !/^\S+@\S+\.\S+$/.test(String(email)) || String(subject).trim().length < 3 || String(subject).trim().length > 200 || String(message).trim().length < 10 || String(message).trim().length > 10000 || !categories.includes(category)) return res.status(400).json({ error: "Please complete every field with valid information." });
    const contact = await db.createContactSubmission({ name: String(name).trim(), email: String(email).trim(), subject: String(subject).trim(), message: String(message).trim(), category });
    // The submission above is the record of truth. Opening the inbox
    // conversation (and alerting the owner) must never fail the visitor's
    // request: if it does, the next inbox load imports the stored row.
    try {
      await recordContactFormMessage(contact);
    } catch (error) {
      console.error("[inbox] contact message stored but not yet in the inbox:", (error as Error)?.message || error);
    }
    res.status(201).json({ message: "Thanks — your message has been received. We’ll reply by email." });
  }));
}

function baseUrl(req: Request) { return (env().PUBLIC_APP_URL as string) || `${req.protocol}://${req.get("host")}`; }
export { baseUrl as publicBaseUrl };

/**
 * Tamper-proof tokens for the email preference links that ride inside
 * marketing mail ({{unsubscribe_url}}, {{preferences_url}}). Recipients
 * click them signed-out, so they cannot be session-scoped: the token is
 * `userId.expiry.hmac`, signed with the same server secret as sessions and
 * expiring after 30 days — long enough for any campaign, short enough that
 * a forwarded link does not live forever. Only the preference it names can
 * be changed with it; it grants no other access.
 */
const EMAIL_PREFERENCE_TOKEN_TTL_MS = 30 * 24 * 3600000;
export function signEmailPreferenceToken(userId: string, atMs = Date.now()): string {
  const expiry = atMs + EMAIL_PREFERENCE_TOKEN_TTL_MS;
  const payload = `${userId}.${expiry}`;
  const mac = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}
export function verifyEmailPreferenceToken(token: string): string | null {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [userId, expiryRaw, mac] = parts;
  const expiry = Number(expiryRaw);
  if (!userId || !mac || !Number.isFinite(expiry) || expiry <= Date.now()) return null;
  const expected = createHmac("sha256", sessionSecret()).update(`${userId}.${expiryRaw}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? userId : null;
}
