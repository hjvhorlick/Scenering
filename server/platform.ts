import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PLAN_CONFIG, PLAN_ORDER, canPlanUseFeature, getPlanConfig, validateExportCreativeManifest, type BillingInterval, type ExportCreativeManifest, type FeatureKey, type PlanSlug } from "../src/config/plans.ts";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email.ts";
import { env } from "../src/env.ts";
import { db, type ComplimentaryGrant, type EmailPreference, type Membership, type Subscription, type UsageRecord, type User } from "../src/db.ts";
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
] as const;
export type SocialPlatformId = (typeof SOCIAL_LINK_PLATFORMS)[number]["id"];
type SocialLinks = Record<SocialPlatformId, string>;
const SOCIAL_LINKS_SETTING_KEY = "social_links";

/**
 * Validates and normalizes the four social-link fields. An empty string
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
  return { youtube: stored.youtube || "", facebook: stored.facebook || "", linkedin: stored.linkedin || "", x: stored.x || "" };
}

const now = () => new Date().toISOString();
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
 *  the period that was paid for runs out. Lemon Squeezy sends an expiry
 *  event then, but a webhook that is never delivered must not leave a paid
 *  plan switched on forever, so the stored end date is the backstop. Scoped
 *  to one user (not a full-table sweep) so it is cheap enough to run on the
 *  authenticated request path. */
async function sweepUserSubscriptionExpiry(userId: string): Promise<void> {
  const sub = await db.findActiveSubscriptionByUserId(userId);
  if (!sub) return;
  if (sub.status === "active" || sub.status === "on_trial") return;
  const ends = Date.parse(String(sub.expiresAt || sub.currentPeriodEnd || ""));
  if (!Number.isFinite(ends) || ends > Date.now()) return;
  await db.updateSubscription(sub.id, { status: "expired" });
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

/** The subscription worth showing. A cancelled one is still shown while the
 *  paid period runs, so the customer can see the end date and reopen the
 *  Lemon Squeezy portal to resume. */
async function subscriptionForUser(userId: string) {
  const sub = await db.findActiveSubscriptionByUserId(userId);
  return sub;
}

/** The API's wire format for subscriptions: snake_case, exactly the shape
 *  the account modal's TypeScript interface declares and the billing suite
 *  pins (billing_interval, customer_portal_url, …). The db layer's row
 *  mappers return camelCase; this converts on the way out. */
function apiSubscription(sub: import("../src/db.ts").Subscription | null) {
  if (!sub) return null;
  return {
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

async function findSession(req: Request): Promise<Auth | null> {
  const raw = cookies(req).scenering_session;
  if (raw) {
    const session = await db.findSessionByToken(hashToken(raw));
    const user = session && (await db.findUserById(session.userId));
    if (user) { const resolved = await ensureOwnerPrivileges(user); return { user: resolved, plan: await getUserPlan(resolved) }; }
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
    if (owner && owner.role === "admin") return { user: owner, plan: "sceneforge" };
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
  const [usage, remaining, subscription, membership] = await Promise.all([
    weeklyUsage(user.id), remainingUsage(user.id, plan), subscriptionForUser(user.id), effectiveMembership(user, plan),
  ]);
  // `subscription` goes out in the API's snake_case wire format
  // (apiSubscription) — the same shape the membership object uses and the
  // account modal's TypeScript interface declares.
  return { user: safeUser(user), membership, subscription: apiSubscription(subscription), plan: getPlanConfig(plan), usage, remaining };
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
 * The Lemon Squeezy events this server acts on. Everything else the store
 * sends (orders, licence keys, refunds) is recorded and ignored rather than
 * being guessed at: an order event carries an order id where this code
 * expects a subscription id, and treating one as the other would create a
 * subscription row that no later event could ever update.
 */
export const LEMON_SQUEEZY_SUBSCRIPTION_EVENTS = [
  "subscription_created", "subscription_updated", "subscription_cancelled", "subscription_resumed",
  "subscription_expired", "subscription_paused", "subscription_unpaused",
  "subscription_payment_failed", "subscription_payment_success", "subscription_payment_recovered",
] as const;
export const LEMON_SQUEEZY_WEBHOOK_PATH = "/api/webhooks/lemonsqueezy";

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
      variantEnv: PLAN_CONFIG[slug].variantEnv[interval],
      variantIdSet: Boolean(e[PLAN_CONFIG[slug].variantEnv[interval]]),
    })),
  }));
  const webhookSecretSet = Boolean(e.LEMON_SQUEEZY_WEBHOOK_SECRET);
  const everyLinkSet = plans.every((plan) => plan.intervals.every((i) => i.checkoutUrlSet && i.variantIdSet));
  return {
    provider: "lemonsqueezy",
    webhookSecretSet,
    apiKeySet: Boolean(e.LEMON_SQUEEZY_API_KEY),
    storeIdSet: Boolean(e.LEMON_SQUEEZY_STORE_ID),
    publicAppUrlSet: Boolean(e.PUBLIC_APP_URL),
    webhookPath: LEMON_SQUEEZY_WEBHOOK_PATH,
    webhookUrl: e.PUBLIC_APP_URL ? `${String(e.PUBLIC_APP_URL).replace(/\/$/, "")}${LEMON_SQUEEZY_WEBHOOK_PATH}` : null,
    requiredEvents: [...LEMON_SQUEEZY_SUBSCRIPTION_EVENTS],
    plans,
    /** True when a real customer could buy a plan and have access granted. */
    ready: webhookSecretSet && everyLinkSet && Boolean(e.PUBLIC_APP_URL),
  };
}

export function registerLemonSqueezyWebhook(app: Express) {
  app.post("/api/webhooks/lemonsqueezy", express.raw({ type: "application/json", limit: "2mb" }), asyncHandlerVoid(async (req, res) => {
    const secret = env().LEMON_SQUEEZY_WEBHOOK_SECRET as string | undefined;
    if (!secret) return res.status(503).json({ error: "Billing webhook is not configured" });
    const signature = String(req.headers["x-signature"] || ""); const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return res.status(401).json({ error: "Invalid signature" });
    let event: any; try { event = JSON.parse(body.toString("utf8")); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
    const eventId = String(event.meta?.event_id || event.data?.id || ""); const eventName = String(event.meta?.event_name || "");
    if (!eventId || !eventName) return res.status(400).json({ error: "Invalid event" });

    const result = await (async () => {
      if (await db.webhookEventExists(eventId)) return "duplicate";
      const record = async (status: string) => {
        await db.recordWebhookEvent({ providerEventId: eventId, eventName, status, payload: { data_id: event.data?.id, variant_id: event.data?.attributes?.variant_id, status: event.data?.attributes?.status } });
        return status;
      };
      if (!(LEMON_SQUEEZY_SUBSCRIPTION_EVENTS as readonly string[]).includes(eventName)) return record("ignored");
      const attrs = event.data?.attributes || {}; const custom = event.meta?.custom_data || {}; const email = String(attrs.user_email || custom.email || "").toLowerCase();
      const userById = custom.user_id ? await db.findUserById(custom.user_id) : null;
      const user = userById && (!email || userById.email === email) ? userById : (!custom.user_id ? await db.findUserByEmail(email) : null);
      if (!user) return record("unmatched");
      const variant = String(attrs.variant_id || ""); let mapped: { plan: PlanSlug; interval: BillingInterval } | null = null;
      const e = env();
      for (const slug of PLAN_ORDER.slice(1)) for (const interval of ["monthly", "yearly"] as const) if (e[PLAN_CONFIG[slug].variantEnv[interval]] === variant) mapped = { plan: slug, interval };
      if (!mapped) return record("unknown_variant");
      const statusMap: Record<string, string> = { subscription_created: "active", subscription_updated: attrs.status || "active", subscription_cancelled: "cancelled", subscription_resumed: "active", subscription_expired: "expired", subscription_paused: "paused", subscription_unpaused: "active", subscription_payment_failed: "past_due", subscription_payment_success: "active", subscription_payment_recovered: "active" };
      const status = statusMap[eventName] || attrs.status || "pending";
      let sub = await db.findSubscriptionByProviderId(String(event.data.id));
      const urls = (attrs.urls || {}) as Record<string, string>;
      const portal = typeof urls.customer_portal === "string" && urls.customer_portal.startsWith("https://") ? urls.customer_portal : null;
      const updatePayment = typeof urls.update_payment_method === "string" && urls.update_payment_method.startsWith("https://") ? urls.update_payment_method : null;
      const fields = {
        providerCustomerId: String(attrs.customer_id || "") || null, providerSubscriptionId: String(event.data.id),
        providerProductId: String(attrs.product_id || "") || null, providerVariantId: variant, planId: mapped.plan, billingInterval: mapped.interval,
        status, currentPeriodStart: attrs.created_at || null, currentPeriodEnd: attrs.renews_at || null, expiresAt: attrs.ends_at || null,
        cancelAtPeriodEnd: Boolean(attrs.cancelled), cancelledAt: status === "cancelled" ? now() : null,
        customerPortalUrl: portal, updatePaymentUrl: updatePayment,
        cardBrand: attrs.card_brand ? String(attrs.card_brand).slice(0, 40) : null, cardLastFour: attrs.card_last_four ? String(attrs.card_last_four).slice(0, 4) : null,
        renewalPrice: attrs.renewal_price ? String(attrs.renewal_price) : null,
      };
      if (!sub) {
        sub = await db.createSubscription({
          id: db.newId("sub"), userId: user.id, provider: "lemonsqueezy", planId: mapped.plan, billingInterval: mapped.interval, status,
          providerCustomerId: null, providerSubscriptionId: null, providerProductId: null, providerVariantId: null,
          currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelledAt: null, expiresAt: null,
          customerPortalUrl: null, updatePaymentUrl: null, cardBrand: null, cardLastFour: null, renewalPrice: null,
        });
      }
      await db.updateSubscription(sub.id, fields);
      const periodEnd = Date.parse(String(attrs.ends_at || attrs.renews_at || "")); const paidThrough = Number.isFinite(periodEnd) && periodEnd > Date.now();
      /* "cancelled" at Lemon Squeezy means "will not renew", not "stop now",
         and a failed payment opens a retry window rather than ending the
         subscription. Both keep the plan until the period that was paid for
         actually ends; the per-user expiry sweep drops it on the day, in
         case the expiry webhook never arrives. */
      const paid = ["active", "on_trial"].includes(status) || (["cancelled", "past_due"].includes(status) && paidThrough);
      const membership = await db.findMembershipByUserId(user.id);
      if (membership) await db.updateMembership(membership.id, { plan: paid ? mapped.plan : "free", status: "active" });
      else await db.createMembership(user.id, paid ? mapped.plan : "free");
      await record("processed");
      await db.recordBillingEvent({ userId: user.id, subscriptionId: sub.id, eventName, fromProvider: true, extra: null });
      return "processed";
    })();
    return res.status(result === "unmatched" || result === "unknown_variant" ? 202 : 200).json({ received: true, status: result });
  }));
}

function asyncHandlerVoid(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
}

export function registerPlatformRoutes(app: Express) {
  app.get("/robots.txt", (req, res) => res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /login\nDisallow: /register\nSitemap: ${baseUrl(req)}/sitemap.xml\n`));
  app.get("/sitemap.xml", (req, res) => { const root = baseUrl(req); const pages = ["", "/features", "/how-it-works", "/pricing", "/about", "/manual", "/faq", "/contact", "/privacy", "/terms", "/cookies"]; res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((page) => `<url><loc>${root}${page || "/"}</loc></url>`).join("")}</urlset>`); });
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
    await db.createVerificationToken(user.id, hashToken(raw), "verify", new Date(Date.now() + 24 * 3600000).toISOString());
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
      await db.createVerificationToken(user.id, hashToken(raw), "verify", new Date(Date.now() + 24 * 3600000).toISOString());
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
      await db.createVerificationToken(user.id, hashToken(raw), "reset", new Date(Date.now() + 3600000).toISOString());
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

  app.get("/api/billing/checkout/:plan/:interval", requireUser, rateLimit("checkout", 20, 3600000), (req, res) => {
    const { user } = (req as any).auth as Auth; const slug = req.params.plan as PlanSlug; const interval = req.params.interval as BillingInterval;
    if (!PLAN_CONFIG[slug] || slug === "free" || !["monthly", "yearly"].includes(interval)) return res.status(400).json({ error: "Invalid plan selection" });
    const envKey = PLAN_CONFIG[slug].checkoutEnv[interval]; const configured = env()[envKey] as string | undefined;
    if (!configured) return res.status(503).json({ error: "Checkout is not configured yet.", code: "BILLING_NOT_CONFIGURED" });
    let checkout: URL; try { checkout = new URL(configured); } catch { return res.status(503).json({ error: "Checkout configuration is invalid." }); }
    if (checkout.protocol !== "https:" && isProduction()) return res.status(503).json({ error: "Checkout must use HTTPS." });
    checkout.searchParams.set("checkout[custom][user_id]", user.id); checkout.searchParams.set("checkout[email]", user.email);
    res.setHeader("Cache-Control", "no-store"); res.json({ url: checkout.toString() });
  });

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
        if (sub && sub.status !== "active" && sub.status !== "on_trial") {
          const ends = Date.parse(String(sub.expiresAt || sub.currentPeriodEnd || ""));
          if (Number.isFinite(ends) && ends <= Date.now()) {
            sweepWrites.push(db.updateSubscription(sub.id, { status: "expired" }));
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
      configuration: { emailProviderConfigured: Boolean(e.EMAIL_PROVIDER && e.EMAIL_PROVIDER !== "console"), lemonSqueezyConfigured: Boolean(e.LEMON_SQUEEZY_WEBHOOK_SECRET), publicAppUrlConfigured: Boolean(e.PUBLIC_APP_URL), production: isProduction() },

      billing: billingConfiguration(), webhookEvents: webhookEvents.reverse(),
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
    if (!code) return res.status(400).json({ error: "This access code is invalid, expired, revoked, or already used." });
    await db.redeemComplimentaryCode(code.id, user.id);
    await db.revokeActiveComplimentaryGrantsForUser(user.id);
    const start = new Date(); const end = new Date(start); if (code.period === "month") end.setUTCMonth(end.getUTCMonth() + 1); else end.setUTCFullYear(end.getUTCFullYear() + 1);
    const grant = await db.createComplimentaryGrant({ userId: user.id, planId: code.planId, period: code.period, startsAt: start.toISOString(), endsAt: end.toISOString(), grantedBy: code.createdBy, reason: "Complimentary access code", accessCodeId: code.id, status: "active" });
    await db.recordBillingEvent({ userId: user.id, subscriptionId: null, eventName: "complimentary_code_redeemed", fromProvider: false, extra: { code_id: code.id, plan_id: code.planId, period: code.period, ends_at: grant.endsAt } });
    const plan = await getUserPlan(user);
    return res.json({ redeemed: true, grant, membership: await effectiveMembership(user, plan) });
  }));
  app.post("/api/admin/complimentary-memberships", requireAdmin, rateLimit("admin-grant", 60, 3600000), asyncHandlerVoid(async (req, res) => {
    const { user: admin } = (req as any).auth as Auth; const requestedUserId = String(req.body?.userId || ""); const requestedEmail = String(req.body?.email || "").trim().toLowerCase();
    const planId = req.body?.planId as PlanSlug; const period = req.body?.period === "year" ? "year" : req.body?.period === "month" ? "month" : null;
    const reason = String(req.body?.reason || "").trim().slice(0, 500);
    if ((!requestedUserId && !requestedEmail) || !period || !["sceneflow", "sceneforge"].includes(planId)) return res.status(400).json({ error: "Choose a customer, plan, and complimentary period." });
    const recipient = requestedUserId ? await db.findUserById(requestedUserId) : await db.findUserByEmail(requestedEmail);
    if (!recipient || !recipient.isVerified || recipient.role === "admin") return res.status(404).json({ error: "Eligible customer account not found." });
    await db.revokeActiveComplimentaryGrantsForUser(recipient.id);
    const start = new Date(); const end = new Date(start); if (period === "month") end.setUTCMonth(end.getUTCMonth() + 1); else end.setUTCFullYear(end.getUTCFullYear() + 1);
    const grant = await db.createComplimentaryGrant({ userId: recipient.id, planId: planId as Exclude<PlanSlug, "free">, period, startsAt: start.toISOString(), endsAt: end.toISOString(), grantedBy: admin.id, reason: reason || null, accessCodeId: null });
    await db.recordBillingEvent({ userId: recipient.id, subscriptionId: null, eventName: "complimentary_membership_granted", fromProvider: false, extra: { granted_by: admin.id, plan_id: planId, period, ends_at: grant.endsAt, reason } });
    const plan = await getUserPlan(recipient);
    res.status(201).json({ grant, recipient: safeUser(recipient), membership: await effectiveMembership(recipient, plan) });
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

  app.get("/api/email-preferences", requireUser, asyncHandlerVoid(async (req, res) => { const { user } = (req as any).auth as Auth; res.json(await db.findEmailPreference(user.id)); }));
  app.put("/api/email-preferences", requireUser, asyncHandlerVoid(async (req, res) => {
    const { user } = (req as any).auth as Auth;
    const pref = await db.upsertEmailPreference({ userId: user.id, marketingConsent: Boolean(req.body?.marketingConsent), consentTimestamp: now(), consentSource: "account_settings", consentVersion: "2026-10", trainingStep: (await db.findEmailPreference(user.id))?.trainingStep || 0, updatedAt: now() });
    res.json(pref);
  }));

  app.post("/api/contact", rateLimit("contact", 5, 3600000), asyncHandlerVoid(async (req, res) => {
    const { name, email, subject, message, category, website } = req.body || {};
    if (website) return res.status(201).json({ message: "Thanks — your message has been received." });
    const categories = ["General", "Technical", "Billing", "Account", "Feature Request", "Business", "Other"];
    if (String(name).trim().length < 2 || String(name).trim().length > 100 || String(email).length > 254 || !/^\S+@\S+\.\S+$/.test(String(email)) || String(subject).trim().length < 3 || String(subject).trim().length > 200 || String(message).trim().length < 10 || String(message).trim().length > 10000 || !categories.includes(category)) return res.status(400).json({ error: "Please complete every field with valid information." });
    await db.createContactSubmission({ name: String(name).trim(), email: String(email).trim(), subject: String(subject).trim(), message: String(message).trim(), category });
    res.status(201).json({ message: "Thanks — your message has been received. We’ll reply by email." });
  }));
}

function baseUrl(req: Request) { return (env().PUBLIC_APP_URL as string) || `${req.protocol}://${req.get("host")}`; }
