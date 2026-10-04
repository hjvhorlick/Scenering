import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PLAN_CONFIG, PLAN_ORDER, canPlanUseFeature, getPlanConfig, validateExportCreativeManifest, type BillingInterval, type ExportCreativeManifest, type FeatureKey, type PlanSlug } from "../src/config/plans.ts";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email.ts";

type User = { id: string; email: string; password_hash: string; display_name: string; email_verified: boolean; role?: "user" | "admin"; created_at: string; updated_at: string };
type Membership = { id: string; user_id: string; plan_id: PlanSlug; status: "active" | "inactive"; created_at: string; updated_at: string };
type Subscription = { id: string; user_id: string; provider: string; provider_customer_id?: string; provider_subscription_id?: string; provider_product_id?: string; provider_variant_id?: string; plan_id: PlanSlug; billing_interval: BillingInterval; status: string; current_period_start?: string; current_period_end?: string; cancel_at_period_end: boolean; cancelled_at?: string; expires_at?: string; /** Lemon Squeezy hosted pages, so a customer can cancel or change a card without emailing us. */ customer_portal_url?: string; update_payment_url?: string; card_brand?: string; card_last_four?: string; renewal_price?: string; created_at: string; updated_at: string };
type UsageRecord = { id: string; user_id: string; kind: "final_export"; duration_minutes: number; format?: "short" | "long"; project_id?: string; reservation_id?: string; created_at: string };
type ExportReservation = { id: string; user_id: string; project_id: string; duration_minutes: number; format: "short" | "long"; creative_manifest?: ExportCreativeManifest; status: "reserved" | "completed" | "cancelled"; expires_at: string; created_at: string; completed_at?: string };
type ComplimentaryGrant = { id: string; user_id: string; plan_id: Exclude<PlanSlug, "free">; period: "month" | "year"; status: "active" | "revoked" | "expired"; starts_at: string; ends_at: string; granted_by: string; reason?: string; access_code_id?: string; created_at: string; revoked_at?: string };
type ComplimentaryCode = { id: string; code_hash: string; code_prefix: string; plan_id: Exclude<PlanSlug, "free">; period: "month" | "year"; status: "active" | "redeemed" | "revoked" | "expired"; expires_at: string; created_by: string; created_at: string; redeemed_by?: string; redeemed_at?: string };
type Token = { id: string; user_id: string; purpose: "verify" | "reset" | "session"; token_hash: string; expires_at: string; created_at: string };
type Contact = { id: string; name: string; email: string; subject: string; message: string; category: string; status: string; created_at: string };
type EmailPreference = { user_id: string; marketing_consent: boolean; consent_timestamp: string; consent_source: string; consent_version: string; training_step: number; updated_at: string };
type SocialLinks = { youtube: string; facebook: string; linkedin: string; x: string; updated_at?: string; updated_by?: string };
type PlatformSettings = { social_links?: SocialLinks };
type PlatformDb = { users: User[]; memberships: Membership[]; subscriptions: Subscription[]; usage_records: UsageRecord[]; export_reservations: ExportReservation[]; complimentary_grants: ComplimentaryGrant[]; complimentary_codes: ComplimentaryCode[]; tokens: Token[]; webhook_events: any[]; billing_events: any[]; contact_submissions: Contact[]; email_preferences: EmailPreference[]; settings: PlatformSettings };

const DB_DIR = path.join(process.cwd(), ".data");
const DB_PATH = path.join(DB_DIR, "platform.json");
const EMPTY_DB: PlatformDb = { users: [], memberships: [], subscriptions: [], usage_records: [], export_reservations: [], complimentary_grants: [], complimentary_codes: [], tokens: [], webhook_events: [], billing_events: [], contact_submissions: [], email_preferences: [], settings: {} };

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

/**
 * Validates and normalizes the four social-link fields. An empty string
 * clears a link. A link pasted without a scheme ("www.youtube.com/@x") is
 * treated as https, because that is how addresses are copied from a browser
 * bar or a profile page. Returns the clean record, or a human-readable error
 * naming the first field that is wrong.
 */
export function sanitizeSocialLinks(input: unknown): { links: Record<SocialPlatformId, string> } | { error: string } {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const links = { youtube: "", facebook: "", linkedin: "", x: "" } as Record<SocialPlatformId, string>;
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
function publicSocialLinks(db: PlatformDb): Record<SocialPlatformId, string> {
  const stored = db.settings?.social_links;
  return { youtube: stored?.youtube || "", facebook: stored?.facebook || "", linkedin: stored?.linkedin || "", x: stored?.x || "" };
}
const id = (prefix: string) => `${prefix}_${randomBytes(12).toString("hex")}`;
const now = () => new Date().toISOString();
const DEVELOPMENT_SESSION_SECRET = "scenering-local-development-secret";
function sessionSecret() {
  const secret = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : DEVELOPMENT_SESSION_SECRET);
  if (!secret || (process.env.NODE_ENV === "production" && secret.length < 32)) throw new Error("SESSION_SECRET must be a unique production secret of at least 32 characters");
  return secret;
}
const hashToken = (token: string) => createHmac("sha256", sessionSecret()).update(token).digest("hex");

export function assertSecurePlatformConfiguration() {
  sessionSecret();
  if (process.env.NODE_ENV === "production" && !process.env.PUBLIC_APP_URL) throw new Error("PUBLIC_APP_URL is required in production");
  if (process.env.PUBLIC_APP_URL) { const url = new URL(process.env.PUBLIC_APP_URL); if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("PUBLIC_APP_URL must use HTTPS in production"); }
}

function loadDb(): PlatformDb {
  try { return { ...EMPTY_DB, ...JSON.parse(readFileSync(DB_PATH, "utf8")) }; } catch { return structuredClone(EMPTY_DB); }
}
function saveDb(db: PlatformDb) {
  mkdirSync(DB_DIR, { recursive: true });
  const temp = `${DB_PATH}.tmp`;
  writeFileSync(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
  renameSync(temp, DB_PATH);
}
function mutate<T>(fn: (db: PlatformDb) => T): T { const db = loadDb(); const result = fn(db); saveDb(db); return result; }
function clean(db: PlatformDb) { db.tokens = db.tokens.filter((t) => Date.parse(t.expires_at) > Date.now()); for (const reservation of db.export_reservations || []) if (reservation.status === "reserved" && Date.parse(reservation.expires_at) <= Date.now()) reservation.status = "cancelled"; for (const grant of db.complimentary_grants || []) if (grant.status === "active" && Date.parse(grant.ends_at) <= Date.now()) grant.status = "expired"; for (const code of db.complimentary_codes || []) if (code.status === "active" && Date.parse(code.expires_at) <= Date.now()) code.status = "expired";
  /* A subscription that was cancelled or is in dunning keeps its plan until
     the period that was paid for runs out. Lemon Squeezy sends an expiry
     event then, but a webhook that is never delivered must not leave a paid
     plan switched on forever, so the stored end date is the backstop. */
  for (const sub of db.subscriptions || []) {
    if (sub.status === "expired" || ["active", "on_trial"].includes(sub.status)) continue;
    const ends = Date.parse(String(sub.expires_at || sub.current_period_end || ""));
    if (!Number.isFinite(ends) || ends > Date.now()) continue;
    sub.status = "expired"; sub.updated_at = now();
    const member = db.memberships.find((m) => m.user_id === sub.user_id && m.status === "active");
    if (member && member.plan_id !== "free") { member.plan_id = "free"; member.updated_at = now(); }
  }
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
function issueToken(db: PlatformDb, userId: string, purpose: Token["purpose"], hours: number) {
  const raw = randomBytes(32).toString("base64url");
  db.tokens.push({ id: id("tok"), user_id: userId, purpose, token_hash: hashToken(raw), expires_at: new Date(Date.now() + hours * 3600000).toISOString(), created_at: now() });
  return raw;
}
function safeUser(user: User) { return { id: user.id, email: user.email, displayName: user.display_name, emailVerified: user.email_verified, role: user.role || "user", createdAt: user.created_at }; }
function membershipFor(db: PlatformDb, userId: string) { return db.memberships.find((m) => m.user_id === userId && m.status === "active") || null; }
/** The subscription worth showing. A cancelled one is still shown while the
 *  paid period runs, so the customer can see the end date and reopen the
 *  Lemon Squeezy portal to resume. */
function subscriptionFor(db: PlatformDb, userId: string) { return db.subscriptions.find((s) => s.user_id === userId && s.status !== "expired") || null; }
function createComplimentaryGrant(db: PlatformDb, userId: string, planId: Exclude<PlanSlug, "free">, period: "month" | "year", grantedBy: string, reason?: string, accessCodeId?: string) {
  for (const grant of db.complimentary_grants) if (grant.user_id === userId && grant.status === "active") { grant.status = "revoked"; grant.revoked_at = now(); }
  const start = new Date(); const end = new Date(start); if (period === "month") end.setUTCMonth(end.getUTCMonth() + 1); else end.setUTCFullYear(end.getUTCFullYear() + 1);
  const grant: ComplimentaryGrant = { id: id("grant"), user_id: userId, plan_id: planId, period, status: "active", starts_at: start.toISOString(), ends_at: end.toISOString(), granted_by: grantedBy, reason, access_code_id: accessCodeId, created_at: now() };
  db.complimentary_grants.push(grant); return grant;
}
function activeComplimentaryGrant(db: PlatformDb, userId: string) { clean(db); return (db.complimentary_grants || []).filter((grant) => grant.user_id === userId && grant.status === "active" && Date.parse(grant.ends_at) > Date.now()).sort((a, b) => Date.parse(b.ends_at) - Date.parse(a.ends_at))[0] || null; }
function getUserPlan(db: PlatformDb, userId: string): PlanSlug { const user = db.users.find((entry) => entry.id === userId); if (user?.role === "admin") return "sceneforge"; const paid = membershipFor(db, userId)?.plan_id || "free"; const complimentary = activeComplimentaryGrant(db, userId)?.plan_id || "free"; const rank: Record<PlanSlug, number> = { free: 0, sceneflow: 1, sceneforge: 2 }; return rank[complimentary] > rank[paid] ? complimentary : paid; }
function effectiveMembership(db: PlatformDb, userId: string) { const stored = membershipFor(db, userId); const grant = activeComplimentaryGrant(db, userId); const plan = getUserPlan(db, userId); const user = db.users.find((entry) => entry.id === userId); return { ...(stored || { id: "", user_id: userId, status: "active" }), plan_id: plan, source: user?.role === "admin" ? "owner_admin" : grant && grant.plan_id === plan ? "complimentary" : plan === "free" ? "free" : "verified_subscription", complimentary_ends_at: grant && grant.plan_id === plan ? grant.ends_at : null, complimentary_period: grant && grant.plan_id === plan ? grant.period : null }; }
function configuredOwnerEmail() { return String(process.env.SCENERING_OWNER_EMAIL || "").trim().toLowerCase(); }
/** Session cookie attributes. The real policy is HttpOnly; SameSite=Lax
 *  (plus Secure in production). Embedded development previews — the app
 *  shown inside an HTTPS iframe, as sandbox preview panes do — are the one
 *  exception: browsers refuse to send Lax cookies inside a cross-site
 *  frame, which makes sign-in appear to work and then fail with 401 on the
 *  next request. DEV_EMBEDDED_PREVIEW=1 (never set in production; ignored
 *  there) switches to SameSite=None; Secure so the preview behaves like the
 *  deployed site. */
function sessionCookieAttributes() {
  if (process.env.NODE_ENV !== "production" && process.env.DEV_EMBEDDED_PREVIEW === "1") return "Path=/; HttpOnly; SameSite=None; Secure";
  return `Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
function setSessionCookie(res: Response, token: string) { res.setHeader("Set-Cookie", `scenering_session=${encodeURIComponent(token)}; ${sessionCookieAttributes()}; Max-Age=2592000; Priority=High`); }
function clearSessionCookie(res: Response) { res.setHeader("Set-Cookie", `scenering_session=; ${sessionCookieAttributes()}; Max-Age=0; Priority=High`); }
function findSession(req: Request): { db: PlatformDb; user: User } | null {
  const raw = cookies(req).scenering_session;
  if (raw) {
    const db = loadDb(); clean(db); const token = db.tokens.find((t) => t.purpose === "session" && t.token_hash === hashToken(raw));
    const user = token && db.users.find((u) => u.id === token.user_id); if (user) return { db, user };
  }
  /* DEV_AUTO_OWNER=1 — development previews only. Some browsers refuse to
     store any cookie for an embedded or proxied preview, which makes
     cookie-based sign-in impossible there no matter what the server sends.
     With this flag the preview treats every request as the configured owner
     administrator, so the product can be reviewed end to end. Double-gated:
     ignored in production, and never set in any deployment configuration. */
  if (process.env.NODE_ENV !== "production" && process.env.DEV_AUTO_OWNER === "1") {
    const db = loadDb(); clean(db);
    const owner = db.users.find((u) => u.role === "admin" && u.email === configuredOwnerEmail()) || db.users.find((u) => u.role === "admin");
    if (owner) return { db, user: owner };
  }
  return null;
}
export function requirePlatformUser(req: Request, res: Response, next: NextFunction) { const auth = findSession(req); if (!auth) return res.status(401).json({ error: "Sign in required" }); (req as any).auth = auth; next(); }
const requireUser = requirePlatformUser;
function requireAdmin(req: Request, res: Response, next: NextFunction) { const auth = findSession(req); if (!auth) return res.status(401).json({ error: "Sign in required" }); if (auth.user.role !== "admin") return res.status(403).json({ error: "Owner administrator access required" }); (req as any).auth = auth; next(); }
export function platformFeatureAllowed(req: Request, feature: FeatureKey) { const auth = (req as any).auth as { db: PlatformDb; user: User } | undefined; return Boolean(auth && canPlanUseFeature(getUserPlan(auth.db, auth.user.id), feature)); }
export function requirePlatformFeature(feature: FeatureKey) { return (req: Request, res: Response, next: NextFunction) => { const auth = findSession(req); if (!auth) return res.status(401).json({ error: "Sign in required" }); const plan = getUserPlan(auth.db, auth.user.id); if (!canPlanUseFeature(plan, feature)) return res.status(403).json({ error: "This capability is not included in your membership.", code: "ENTITLEMENT_REQUIRED", feature, plan }); (req as any).auth = auth; next(); }; }
function accountPayload(db: PlatformDb, user: User) {
  const plan = getUserPlan(db, user.id); const usage = weeklyUsage(db, user.id);
  return { user: safeUser(user), membership: effectiveMembership(db, user.id), subscription: subscriptionFor(db, user.id), plan: getPlanConfig(plan), usage, remaining: remainingUsage(db, user.id) };
}
function weekStart() { const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); d.setUTCHours(0, 0, 0, 0); return d; }
function weeklyUsage(db: PlatformDb, userId: string) { const rows = db.usage_records.filter((r) => r.user_id === userId && Date.parse(r.created_at) >= weekStart().getTime()); return { finalExports: rows.length, finalExportMinutes: Number(rows.reduce((sum, r) => sum + r.duration_minutes, 0).toFixed(2)) }; }
function remainingUsage(db: PlatformDb, userId: string) { const plan = getPlanConfig(getUserPlan(db, userId)); const usage = weeklyUsage(db, userId); const rows = db.usage_records.filter((r) => r.user_id === userId && Date.parse(r.created_at) >= weekStart().getTime()); const shortCount = rows.filter((r) => r.format === "short" || (!r.format && r.duration_minutes <= 1)).length; const longCount = rows.length - shortCount; return { finalExports: plan.limits.finalExportsPerWeek == null ? null : Math.max(0, plan.limits.finalExportsPerWeek - usage.finalExports), shortExports: plan.limits.shortExportsPerWeek == null ? null : Math.max(0, plan.limits.shortExportsPerWeek - shortCount), longExports: plan.limits.longExportsPerWeek == null ? null : Math.max(0, plan.limits.longExportsPerWeek - longCount) }; }
function canExport(db: PlatformDb, userId: string, duration: number, format: "short" | "long") {
  clean(db);
  const config = getPlanConfig(getUserPlan(db, userId)); const usage = weeklyUsage(db, userId);
  const reserved = (db.export_reservations || []).filter((r) => r.user_id === userId && r.status === "reserved" && Date.parse(r.created_at) >= weekStart().getTime());
  if (config.id === "free") {
    const rows = db.usage_records.filter((r) => r.user_id === userId && Date.parse(r.created_at) >= weekStart().getTime());
    const shortCount = rows.filter((r) => r.format === "short" || (!r.format && r.duration_minutes <= 1)).length + reserved.filter((r) => r.format === "short").length;
    const longCount = rows.length - rows.filter((r) => r.format === "short" || (!r.format && r.duration_minutes <= 1)).length + reserved.filter((r) => r.format === "long").length;
    if (format === "short") return duration <= (config.limits.maxShortMinutes || 0) && shortCount < (config.limits.shortExportsPerWeek || 0);
    return duration <= (config.limits.maxLongMinutes || 0) && longCount < (config.limits.longExportsPerWeek || 0);
  }
  return config.limits.finalExportsPerWeek == null || usage.finalExports + reserved.length < config.limits.finalExportsPerWeek;
}
function parseCreativeManifest(value: unknown): ExportCreativeManifest | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const list = (key: string) => Array.isArray(input[key]) && (input[key] as unknown[]).length <= 100 && (input[key] as unknown[]).every((item) => typeof item === "string") ? input[key] as string[] : null;
  const features = list("features"), backgroundMusic = list("backgroundMusic"), audioVisualisers = list("audioVisualisers"), callsToAction = list("callsToAction");
  if (!features || !backgroundMusic || !audioVisualisers || !callsToAction || typeof input.voice !== "string" || typeof input.captionStyle !== "string") return null;
  return { features: features as FeatureKey[], voice: input.voice.slice(0, 100), captionStyle: input.captionStyle.slice(0, 100), backgroundMusic, audioVisualisers, callsToAction };
}
const rateBuckets = new Map<string, number[]>();
export function platformRateLimit(name: string, max: number, windowMs: number) { return (req: Request, res: Response, next: NextFunction) => { const key = `${name}:${(req as any).auth?.user?.id || req.ip}`; const cutoff = Date.now() - windowMs; if (rateBuckets.size > 10000) { for (const [bucket, timestamps] of rateBuckets) { const active = timestamps.filter((time) => time > cutoff); if (active.length) rateBuckets.set(bucket, active); else rateBuckets.delete(bucket); } } const hits = (rateBuckets.get(key) || []).filter((t) => t > cutoff); if (hits.length >= max) { res.setHeader("Retry-After", String(Math.ceil(windowMs / 1000))); return res.status(429).json({ error: "Too many requests. Please try again later." }); } hits.push(Date.now()); rateBuckets.set(key, hits); next(); }; }
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
  const plans = PLAN_ORDER.slice(1).map((slug) => ({
    plan: slug,
    name: PLAN_CONFIG[slug].name,
    intervals: (["monthly", "yearly"] as const).map((interval) => ({
      interval,
      checkoutEnv: PLAN_CONFIG[slug].checkoutEnv[interval],
      checkoutUrlSet: Boolean(process.env[PLAN_CONFIG[slug].checkoutEnv[interval]]),
      variantEnv: PLAN_CONFIG[slug].variantEnv[interval],
      variantIdSet: Boolean(process.env[PLAN_CONFIG[slug].variantEnv[interval]]),
    })),
  }));
  const webhookSecretSet = Boolean(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET);
  const everyLinkSet = plans.every((plan) => plan.intervals.every((i) => i.checkoutUrlSet && i.variantIdSet));
  return {
    provider: "lemonsqueezy",
    webhookSecretSet,
    apiKeySet: Boolean(process.env.LEMON_SQUEEZY_API_KEY),
    storeIdSet: Boolean(process.env.LEMON_SQUEEZY_STORE_ID),
    publicAppUrlSet: Boolean(process.env.PUBLIC_APP_URL),
    webhookPath: LEMON_SQUEEZY_WEBHOOK_PATH,
    webhookUrl: process.env.PUBLIC_APP_URL ? `${process.env.PUBLIC_APP_URL.replace(/\/$/, "")}${LEMON_SQUEEZY_WEBHOOK_PATH}` : null,
    requiredEvents: [...LEMON_SQUEEZY_SUBSCRIPTION_EVENTS],
    plans,
    /** True when a real customer could buy a plan and have access granted. */
    ready: webhookSecretSet && everyLinkSet && Boolean(process.env.PUBLIC_APP_URL),
  };
}

export function registerLemonSqueezyWebhook(app: Express) {
  app.post("/api/webhooks/lemonsqueezy", express.raw({ type: "application/json", limit: "2mb" }), (req, res) => {
    const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET; if (!secret) return res.status(503).json({ error: "Billing webhook is not configured" });
    const signature = String(req.headers["x-signature"] || ""); const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
    const expected = createHmac("sha256", secret).update(body).digest("hex");
    if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return res.status(401).json({ error: "Invalid signature" });
    let event: any; try { event = JSON.parse(body.toString("utf8")); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
    const eventId = String(event.meta?.event_id || event.data?.id || ""); const eventName = String(event.meta?.event_name || ""); if (!eventId || !eventName) return res.status(400).json({ error: "Invalid event" });
    const result = mutate((db) => {
      if (db.webhook_events.some((e) => e.provider_event_id === eventId)) return "duplicate";
      const record = (status: string) => { db.webhook_events.push({ id: id("wh"), provider_event_id: eventId, event_name: eventName, status, payload: { data_id: event.data?.id, variant_id: event.data?.attributes?.variant_id, status: event.data?.attributes?.status }, created_at: now() }); return status; };
      if (!(LEMON_SQUEEZY_SUBSCRIPTION_EVENTS as readonly string[]).includes(eventName)) return record("ignored");
      const attrs = event.data?.attributes || {}; const custom = event.meta?.custom_data || {}; const email = String(attrs.user_email || custom.email || "").toLowerCase();
      const userById = custom.user_id ? db.users.find((u) => u.id === custom.user_id) : undefined; const user = userById && (!email || userById.email === email) ? userById : (!custom.user_id ? db.users.find((u) => u.email === email) : undefined); if (!user) return record("unmatched");
      const variant = String(attrs.variant_id || ""); let mapped: { plan: PlanSlug; interval: BillingInterval } | null = null;
      for (const slug of PLAN_ORDER.slice(1)) for (const interval of ["monthly", "yearly"] as const) if (process.env[PLAN_CONFIG[slug].variantEnv[interval]] === variant) mapped = { plan: slug, interval };
      if (!mapped) return record("unknown_variant");
      const statusMap: Record<string, string> = { subscription_created: "active", subscription_updated: attrs.status || "active", subscription_cancelled: "cancelled", subscription_resumed: "active", subscription_expired: "expired", subscription_paused: "paused", subscription_unpaused: "active", subscription_payment_failed: "past_due", subscription_payment_success: "active", subscription_payment_recovered: "active" };
      const status = statusMap[eventName] || attrs.status || "pending"; let sub = db.subscriptions.find((s) => s.provider_subscription_id === String(event.data.id));
      if (!sub) { sub = { id: id("sub"), user_id: user.id, provider: "lemonsqueezy", plan_id: mapped.plan, billing_interval: mapped.interval, status, cancel_at_period_end: false, created_at: now(), updated_at: now() }; db.subscriptions.push(sub); }
      const urls = (attrs.urls || {}) as Record<string, string>; const portal = typeof urls.customer_portal === "string" && urls.customer_portal.startsWith("https://") ? urls.customer_portal : undefined; const updatePayment = typeof urls.update_payment_method === "string" && urls.update_payment_method.startsWith("https://") ? urls.update_payment_method : undefined;
      Object.assign(sub, { provider_customer_id: String(attrs.customer_id || ""), provider_subscription_id: String(event.data.id), provider_product_id: String(attrs.product_id || ""), provider_variant_id: variant, plan_id: mapped.plan, billing_interval: mapped.interval, status, current_period_start: attrs.created_at, current_period_end: attrs.renews_at, expires_at: attrs.ends_at, cancel_at_period_end: Boolean(attrs.cancelled), cancelled_at: status === "cancelled" ? now() : undefined, customer_portal_url: portal, update_payment_url: updatePayment, card_brand: attrs.card_brand ? String(attrs.card_brand).slice(0, 40) : undefined, card_last_four: attrs.card_last_four ? String(attrs.card_last_four).slice(0, 4) : undefined, renewal_price: attrs.renewal_price ? String(attrs.renewal_price) : undefined, updated_at: now() });
      const periodEnd = Date.parse(String(attrs.ends_at || attrs.renews_at || "")); const paidThrough = Number.isFinite(periodEnd) && periodEnd > Date.now();
      /* "cancelled" at Lemon Squeezy means "will not renew", not "stop now",
         and a failed payment opens a retry window rather than ending the
         subscription. Both keep the plan until the period that was paid for
         actually ends; clean() drops it on the day, in case the expiry
         webhook never arrives. */
      const paid = ["active", "on_trial"].includes(status) || (["cancelled", "past_due"].includes(status) && paidThrough); const member = membershipFor(db, user.id) || db.memberships.find((m) => m.user_id === user.id)!; member.plan_id = paid ? mapped.plan : "free"; member.status = "active"; member.updated_at = now();
      record("processed"); db.billing_events.push({ id: id("bill"), user_id: user.id, subscription_id: sub.id, event_name: eventName, from_provider: true, created_at: now() }); return "processed";
    });
    return res.status(result === "unmatched" || result === "unknown_variant" ? 202 : 200).json({ received: true, status: result });
  });
}

export function registerPlatformRoutes(app: Express) {
  const ownerEmail = configuredOwnerEmail();
  if (ownerEmail) mutate((db) => { const owner = db.users.find((user) => user.email === ownerEmail); if (!owner) return; owner.role = "admin"; const membership = membershipFor(db, owner.id) || db.memberships.find((entry) => entry.user_id === owner.id); if (membership) { membership.plan_id = "sceneforge"; membership.status = "active"; membership.updated_at = now(); } });
  app.get("/robots.txt", (req, res) => res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /login\nDisallow: /register\nSitemap: ${baseUrl(req)}/sitemap.xml\n`));
  app.get("/sitemap.xml", (req, res) => { const root = baseUrl(req); const pages = ["", "/features", "/how-it-works", "/pricing", "/about", "/manual", "/faq", "/contact", "/privacy", "/terms", "/cookies"]; res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((page) => `<url><loc>${root}${page || "/"}</loc></url>`).join("")}</urlset>`); });
  app.get("/api/plans", (_req, res) => res.json({ plans: PLAN_ORDER.map((slug) => PLAN_CONFIG[slug]) }));
  app.post("/api/auth/register", rateLimit("register", 5, 3600000), async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase(); const displayName = String(req.body?.displayName || "").trim(); const password = String(req.body?.password || "");
    if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email) || displayName.length < 2 || displayName.length > 100 || password.length < 10 || password.length > 256) return res.status(400).json({ error: "Use a valid email, a display name of 2–100 characters, and a password of 10–256 characters." });
    let raw = ""; let user!: User; try { mutate((db) => { if (db.users.some((u) => u.email === email)) throw new Error("exists"); const stamp = now(); const isOwner = Boolean(configuredOwnerEmail() && email === configuredOwnerEmail()); user = { id: id("usr"), email, password_hash: passwordHash(password), display_name: displayName, email_verified: false, role: isOwner ? "admin" : "user", created_at: stamp, updated_at: stamp }; db.users.push(user); db.memberships.push({ id: id("mem"), user_id: user.id, plan_id: isOwner ? "sceneforge" : "free", status: "active", created_at: stamp, updated_at: stamp }); db.email_preferences.push({ user_id: user.id, marketing_consent: Boolean(req.body?.marketingConsent), consent_timestamp: stamp, consent_source: "registration", consent_version: "2026-10", training_step: 0, updated_at: stamp }); raw = issueToken(db, user.id, "verify", 24); }); } catch { return res.status(409).json({ error: "An account with that email already exists." }); }
    await sendVerificationEmail(user.email, user.display_name, `${baseUrl(req)}/verify-email?token=${encodeURIComponent(raw)}`); return res.status(201).json({ message: "Account created. Check your email to verify it.", requiresVerification: true, ...(process.env.NODE_ENV !== "production" ? { developmentVerificationUrl: `/verify-email?token=${encodeURIComponent(raw)}` } : {}) });
  });
  app.post("/api/auth/login", rateLimit("login", 12, 900000), (req, res) => { const email = String(req.body?.email || "").trim().toLowerCase(); const password = String(req.body?.password || ""); const db = loadDb(); const user = db.users.find((u) => u.email === email); if (!user || !passwordMatches(password, user.password_hash)) return res.status(401).json({ error: "Email or password is incorrect." }); if (!user.email_verified) return res.status(403).json({ error: "Verify your email before signing in.", code: "EMAIL_UNVERIFIED" }); const token = mutate((next) => { clean(next); return issueToken(next, user.id, "session", 24 * 30); }); setSessionCookie(res, token); return res.json(accountPayload(db, user)); });
  app.post("/api/auth/logout", (req, res) => { const raw = cookies(req).scenering_session; if (raw) mutate((db) => { db.tokens = db.tokens.filter((t) => t.token_hash !== hashToken(raw)); }); clearSessionCookie(res); res.json({ ok: true }); });
  app.get("/api/auth/session", (req, res) => { const auth = findSession(req); return auth ? res.json(accountPayload(auth.db, auth.user)) : res.status(401).json({ error: "No active session" }); });
  app.post("/api/auth/verify-email", rateLimit("verify", 10, 3600000), (req, res) => { const hash = hashToken(String(req.body?.token || "")); const result = mutate((db) => { clean(db); const token = db.tokens.find((t) => t.purpose === "verify" && t.token_hash === hash); const user = token && db.users.find((u) => u.id === token.user_id); if (!token || !user) return null; user.email_verified = true; user.updated_at = now(); db.tokens = db.tokens.filter((t) => t.id !== token.id); return user; }); return result ? res.json({ message: "Email verified. You can now sign in." }) : res.status(400).json({ error: "This verification link is invalid or expired." }); });
  app.post("/api/auth/resend-verification", rateLimit("resend", 3, 3600000), async (req, res) => { const email = String(req.body?.email || "").trim().toLowerCase(); const db = loadDb(); const user = db.users.find((u) => u.email === email && !u.email_verified); if (user) { const token = mutate((next) => issueToken(next, user.id, "verify", 24)); await sendVerificationEmail(user.email, user.display_name, `${baseUrl(req)}/verify-email?token=${encodeURIComponent(token)}`); } res.json({ message: "If the account exists, a verification message has been sent." }); });
  app.post("/api/auth/forgot-password", rateLimit("forgot", 3, 3600000), async (req, res) => { const email = String(req.body?.email || "").trim().toLowerCase(); const db = loadDb(); const user = db.users.find((u) => u.email === email); let developmentResetUrl = ""; if (user) { const token = mutate((next) => issueToken(next, user.id, "reset", 1)); developmentResetUrl = `/reset-password?token=${encodeURIComponent(token)}`; await sendPasswordResetEmail(user.email, user.display_name, `${baseUrl(req)}${developmentResetUrl}`); } res.json({ message: "If the account exists, a password-reset message has been sent.", ...(process.env.NODE_ENV !== "production" && developmentResetUrl ? { developmentResetUrl } : {}) }); });
  app.post("/api/auth/reset-password", rateLimit("reset", 5, 3600000), (req, res) => { const password = String(req.body?.password || ""); if (password.length < 10 || password.length > 256) return res.status(400).json({ error: "Use between 10 and 256 characters." }); const hash = hashToken(String(req.body?.token || "")); const ok = mutate((db) => { clean(db); const token = db.tokens.find((t) => t.purpose === "reset" && t.token_hash === hash); const user = token && db.users.find((u) => u.id === token.user_id); if (!token || !user) return false; user.password_hash = passwordHash(password); user.updated_at = now(); db.tokens = db.tokens.filter((t) => t.user_id !== user.id); return true; }); return ok ? res.json({ message: "Password updated. Sign in with your new password." }) : res.status(400).json({ error: "This reset link is invalid or expired." }); });
  app.get("/api/account", requireUser, (req, res) => { const { db, user } = (req as any).auth; res.json(accountPayload(db, user)); });
  app.get("/api/entitlements", requireUser, (req, res) => { const { db, user } = (req as any).auth; const plan = getUserPlan(db, user.id); res.json({ plan, entitlements: getPlanConfig(plan), usage: weeklyUsage(db, user.id), remaining: remainingUsage(db, user.id) }); });
  app.get("/api/entitlements/:feature", requireUser, (req, res) => { const { db, user } = (req as any).auth; const feature = req.params.feature as FeatureKey; if (!(feature in PLAN_CONFIG.free.features)) return res.status(404).json({ error: "Unknown feature" }); res.json({ allowed: canPlanUseFeature(getUserPlan(db, user.id), feature), plan: getUserPlan(db, user.id) }); });
  app.post("/api/usage/final-export/check", requireUser, rateLimit("export-check", 120, 3600000), (req, res) => { const { db, user } = (req as any).auth; const duration = Number(req.body?.durationMinutes); const format = req.body?.format === "short" ? "short" : "long"; if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) return res.status(400).json({ error: "Valid duration required" }); res.json({ allowed: canExport(db, user.id, duration, format), remaining: remainingUsage(db, user.id) }); });
  app.post("/api/usage/final-export/reserve", requireUser, rateLimit("export-reserve", 30, 3600000), (req, res) => { const { user } = (req as any).auth; const duration = Number(req.body?.durationMinutes); const format = req.body?.format === "short" ? "short" : req.body?.format === "long" ? "long" : null; const projectId = String(req.body?.projectId || "").slice(0, 200); const creativeManifest = parseCreativeManifest(req.body?.creativeManifest); if (!Number.isFinite(duration) || duration <= 0 || duration > 1440 || !format || !projectId || !creativeManifest) return res.status(400).json({ error: "Valid export details and creative manifest required" }); const policyError = validateExportCreativeManifest(getUserPlan((req as any).auth.db, user.id), creativeManifest); if (policyError) return res.status(403).json({ error: `${policyError}. You can still preview it or change membership.` }); const reservation = mutate((db) => { if (!canExport(db, user.id, duration, format)) return null; const row: ExportReservation = { id: id("export"), user_id: user.id, project_id: projectId, duration_minutes: duration, format, creative_manifest: creativeManifest, status: "reserved", expires_at: new Date(Date.now() + 2 * 3600000).toISOString(), created_at: now() }; db.export_reservations.push(row); return row; }); return reservation ? res.status(201).json({ reservationId: reservation.id, expiresAt: reservation.expires_at }) : res.status(403).json({ error: "Your final-export allowance has been reached. Previews remain unlimited." }); });
  app.post("/api/usage/final-export/complete", requireUser, rateLimit("export-complete", 60, 3600000), (req, res) => { const { user } = (req as any).auth; const reservationId = String(req.body?.reservationId || ""); const outcome = mutate((db) => { clean(db); const row = db.export_reservations.find((r) => r.id === reservationId && r.user_id === user.id); if (!row) return "missing"; if (row.status === "completed") return "completed"; if (row.status !== "reserved") return "invalid"; row.status = "completed"; row.completed_at = now(); db.usage_records.push({ id: id("use"), user_id: user.id, kind: "final_export", duration_minutes: row.duration_minutes, format: row.format, project_id: row.project_id, reservation_id: row.id, created_at: now() }); return "completed"; }); if (outcome === "missing") return res.status(404).json({ error: "Export reservation not found" }); if (outcome === "invalid") return res.status(409).json({ error: "Export reservation is no longer valid" }); return res.json({ recorded: true }); });
  app.post("/api/usage/final-export/cancel", requireUser, rateLimit("export-cancel", 60, 3600000), (req, res) => { const { user } = (req as any).auth; const reservationId = String(req.body?.reservationId || ""); mutate((db) => { const row = db.export_reservations.find((r) => r.id === reservationId && r.user_id === user.id && r.status === "reserved"); if (row) row.status = "cancelled"; }); res.json({ cancelled: true }); });
  app.post("/api/usage/final-export", requireUser, (req, res) => { const { user } = (req as any).auth; const duration = Number(req.body?.durationMinutes); const format = req.body?.format === "short" ? "short" : "long"; if (!(duration > 0)) return res.status(400).json({ error: "Valid duration required" }); const recorded = mutate((db) => { if (!canExport(db, user.id, duration, format)) return false; db.usage_records.push({ id: id("use"), user_id: user.id, kind: "final_export", duration_minutes: duration, format, project_id: String(req.body?.projectId || ""), created_at: now() }); return true; }); return recorded ? res.status(201).json({ recorded: true }) : res.status(403).json({ error: "Your final-export allowance has been reached. Previews remain unlimited." }); });
  app.get("/api/billing/checkout/:plan/:interval", requireUser, rateLimit("checkout", 20, 3600000), (req, res) => { const { user } = (req as any).auth as { user: User }; const slug = req.params.plan as PlanSlug; const interval = req.params.interval as BillingInterval; if (!PLAN_CONFIG[slug] || slug === "free" || !["monthly", "yearly"].includes(interval)) return res.status(400).json({ error: "Invalid plan selection" }); const env = PLAN_CONFIG[slug].checkoutEnv[interval]; const configured = process.env[env]; if (!configured) return res.status(503).json({ error: "Checkout is not configured yet.", code: "BILLING_NOT_CONFIGURED" }); let checkout: URL; try { checkout = new URL(configured); } catch { return res.status(503).json({ error: "Checkout configuration is invalid." }); } if (checkout.protocol !== "https:" && process.env.NODE_ENV === "production") return res.status(503).json({ error: "Checkout must use HTTPS." }); checkout.searchParams.set("checkout[custom][user_id]", user.id); checkout.searchParams.set("checkout[email]", user.email); res.setHeader("Cache-Control", "no-store"); res.json({ url: checkout.toString() }); });
  app.get("/api/admin/overview", requireAdmin, rateLimit("admin-overview", 120, 3600000), (req, res) => { const { db } = (req as any).auth as { db: PlatformDb }; res.setHeader("Cache-Control", "no-store"); res.json({ owner: "Henry John Vincent Horlick", organization: "Horlick Group", users: db.users.map((user) => ({ ...safeUser(user), membership: effectiveMembership(db, user.id), subscription: subscriptionFor(db, user.id), complimentaryGrant: activeComplimentaryGrant(db, user.id), usage: weeklyUsage(db, user.id), marketingConsent: db.email_preferences.find((pref) => pref.user_id === user.id)?.marketing_consent || false })), complimentaryCodes: [...(db.complimentary_codes || [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100).map(({ code_hash: _hash, ...code }) => code), contacts: [...db.contact_submissions].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200), plans: PLAN_ORDER.map((slug) => PLAN_CONFIG[slug]), configuration: { emailProviderConfigured: Boolean(process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER !== "console"), lemonSqueezyConfigured: Boolean(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET), publicAppUrlConfigured: Boolean(process.env.PUBLIC_APP_URL), production: process.env.NODE_ENV === "production" }, billing: billingConfiguration(), webhookEvents: [...db.webhook_events].slice(-25).reverse() }); });
  app.post("/api/admin/complimentary-codes", requireAdmin, rateLimit("admin-code", 60, 3600000), (req, res) => { const { user: admin } = (req as any).auth as { user: User }; const planId = req.body?.planId as PlanSlug; const period = "year" as const; const validForDays = [7, 30, 90].includes(Number(req.body?.validForDays)) ? Number(req.body.validForDays) : 30; if (!["sceneflow", "sceneforge"].includes(planId)) return res.status(400).json({ error: "Choose a complimentary plan." }); const raw = `SCN-${randomBytes(12).toString("hex").toUpperCase()}`; const record = mutate((db) => { const created = new Date(); const expires = new Date(created.getTime() + validForDays * 86400000); const code: ComplimentaryCode = { id: id("code"), code_hash: hashToken(raw), code_prefix: `${raw.slice(0, 8)}…${raw.slice(-4)}`, plan_id: planId as Exclude<PlanSlug, "free">, period, status: "active", expires_at: expires.toISOString(), created_by: admin.id, created_at: created.toISOString() }; db.complimentary_codes.push(code); return code; }); res.status(201).json({ code: raw, codeId: record.id, planId: record.plan_id, period: record.period, expiresAt: record.expires_at, redeemUrl: `/register?code=${encodeURIComponent(raw)}` }); });
  app.post("/api/admin/complimentary-codes/:id/revoke", requireAdmin, rateLimit("admin-code-revoke", 60, 3600000), (req, res) => { const revoked = mutate((db) => { const code = db.complimentary_codes.find((entry) => entry.id === req.params.id && entry.status === "active"); if (!code) return false; code.status = "revoked"; return true; }); return revoked ? res.json({ revoked: true }) : res.status(404).json({ error: "Active access code not found." }); });
  app.post("/api/complimentary-codes/redeem", requireUser, rateLimit("code-redeem", 20, 3600000), (req, res) => { const { user } = (req as any).auth as { user: User }; const raw = String(req.body?.code || "").trim().toUpperCase(); if (!raw || raw.length > 100 || user.role === "admin") return res.status(400).json({ error: "This access code is not valid." }); const result = mutate((db) => { clean(db); const code = db.complimentary_codes.find((entry) => entry.code_hash === hashToken(raw) && entry.status === "active" && Date.parse(entry.expires_at) > Date.now()); if (!code) return null; code.status = "redeemed"; code.redeemed_by = user.id; code.redeemed_at = now(); const grant = createComplimentaryGrant(db, user.id, code.plan_id, code.period, code.created_by, "Complimentary access code", code.id); db.billing_events.push({ id: id("bill"), user_id: user.id, event_name: "complimentary_code_redeemed", from_provider: false, code_id: code.id, plan_id: code.plan_id, period: code.period, ends_at: grant.ends_at, created_at: now() }); return { grant, membership: effectiveMembership(db, user.id) }; }); return result ? res.json({ redeemed: true, ...result }) : res.status(400).json({ error: "This access code is invalid, expired, revoked, or already used." }); });
  app.post("/api/admin/complimentary-memberships", requireAdmin, rateLimit("admin-grant", 60, 3600000), (req, res) => { const { user: admin } = (req as any).auth as { user: User }; const requestedUserId = String(req.body?.userId || ""); const requestedEmail = String(req.body?.email || "").trim().toLowerCase(); const planId = req.body?.planId as PlanSlug; const period = req.body?.period === "year" ? "year" : req.body?.period === "month" ? "month" : null; const reason = String(req.body?.reason || "").trim().slice(0, 500); if ((!requestedUserId && !requestedEmail) || !period || !["sceneflow", "sceneforge"].includes(planId)) return res.status(400).json({ error: "Choose a customer, plan, and complimentary period." }); const result = mutate((db) => { clean(db); const recipient = db.users.find((entry) => requestedUserId ? entry.id === requestedUserId : entry.email === requestedEmail); const userId = recipient?.id || ""; if (!recipient || !recipient.email_verified || recipient.role === "admin") return null; const grant = createComplimentaryGrant(db, userId, planId as Exclude<PlanSlug, "free">, period, admin.id, reason || undefined); db.billing_events.push({ id: id("bill"), user_id: userId, event_name: "complimentary_membership_granted", from_provider: false, granted_by: admin.id, plan_id: planId, period, ends_at: grant.ends_at, reason, created_at: now() }); return { grant, recipient: safeUser(recipient), membership: effectiveMembership(db, userId) }; }); return result ? res.status(201).json(result) : res.status(404).json({ error: "Eligible customer account not found." }); });
  app.post("/api/admin/complimentary-memberships/:id/revoke", requireAdmin, rateLimit("admin-grant-revoke", 60, 3600000), (req, res) => { const { user: admin } = (req as any).auth as { user: User }; const result = mutate((db) => { const grant = db.complimentary_grants.find((entry) => entry.id === req.params.id); if (!grant) return null; if (grant.status === "active") { grant.status = "revoked"; grant.revoked_at = now(); db.billing_events.push({ id: id("bill"), user_id: grant.user_id, event_name: "complimentary_membership_revoked", from_provider: false, granted_by: admin.id, grant_id: grant.id, created_at: now() }); } return grant; }); return result ? res.json({ revoked: true, grant: result }) : res.status(404).json({ error: "Complimentary membership not found." }); });
  app.put("/api/admin/contacts/:id", requireAdmin, rateLimit("admin-contact", 120, 3600000), (req, res) => { const allowed = new Set(["new", "open", "resolved", "closed"]); const status = String(req.body?.status || ""); if (!allowed.has(status)) return res.status(400).json({ error: "Invalid contact status" }); const updated = mutate((db) => { const contact = db.contact_submissions.find((entry) => entry.id === req.params.id); if (!contact) return null; contact.status = status; return contact; }); return updated ? res.json(updated) : res.status(404).json({ error: "Contact message not found" }); });
  /* The configured social profiles. Public on purpose: the marketing footer
     and the studio chrome both render these icons for signed-out visitors. */
  app.get("/api/social-links", (_req, res) => { const db = loadDb(); res.setHeader("Cache-Control", "no-store"); res.json({ links: publicSocialLinks(db), platforms: SOCIAL_LINK_PLATFORMS.map(({ id, label }) => ({ id, label })) }); });
  app.put("/api/admin/social-links", requireAdmin, rateLimit("admin-social-links", 60, 3600000), (req, res) => {
    const { user: admin } = (req as any).auth as { user: User };
    const result = sanitizeSocialLinks(req.body);
    if ("error" in result) return res.status(400).json({ error: result.error });
    const saved = mutate((db) => { db.settings = db.settings || {}; db.settings.social_links = { ...result.links, updated_at: now(), updated_by: admin.id }; return publicSocialLinks(db); });
    res.json({ links: saved });
  });
  app.get("/api/email-preferences", requireUser,  (req, res) => { const { db, user } = (req as any).auth; res.json(db.email_preferences.find((p) => p.user_id === user.id)); });
  app.put("/api/email-preferences", requireUser, (req, res) => { const { user } = (req as any).auth; const pref = mutate((db) => { let p = db.email_preferences.find((x) => x.user_id === user.id)!; p.marketing_consent = Boolean(req.body?.marketingConsent); p.consent_timestamp = now(); p.consent_source = "account_settings"; p.consent_version = "2026-10"; p.updated_at = now(); return p; }); res.json(pref); });
  app.post("/api/contact", rateLimit("contact", 5, 3600000), (req, res) => { const { name, email, subject, message, category, website } = req.body || {}; if (website) return res.status(201).json({ message: "Thanks — your message has been received." }); const categories = ["General", "Technical", "Billing", "Account", "Feature Request", "Business", "Other"]; if (String(name).trim().length < 2 || String(name).trim().length > 100 || String(email).length > 254 || !/^\S+@\S+\.\S+$/.test(String(email)) || String(subject).trim().length < 3 || String(subject).trim().length > 200 || String(message).trim().length < 10 || String(message).trim().length > 10000 || !categories.includes(category)) return res.status(400).json({ error: "Please complete every field with valid information." }); mutate((db) => db.contact_submissions.push({ id: id("contact"), name: String(name).trim(), email: String(email).trim(), subject: String(subject).trim(), message: String(message).trim(), category, status: "new", created_at: now() })); res.status(201).json({ message: "Thanks — your message has been received. We’ll reply by email." }); });
}
function baseUrl(req: Request) { return process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`; }
