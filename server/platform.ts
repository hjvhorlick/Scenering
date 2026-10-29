import type { Express, Request, Response, NextFunction } from "express";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { PLAN_CONFIG, PLAN_ORDER, canPlanUseFeature, getPlanConfig, validateExportCreativeManifest, type BillingInterval, type ExportCreativeManifest, type FeatureKey, type PlanSlug } from "../src/config/plans.ts";
import { buildPricingTiers } from "../src/config/pricing-tiers.ts";
import { paypalIsSandbox, paypalAppUrl, paypalPlanGaps, paypalPlanId, paypalPlanLabel, paypalPublicConfig, paypalApi, PAYPAL_PLAN_SLOTS, createPayPalSubscription, getPayPalSubscription, cancelPayPalSubscription, verifyPayPalWebhook, PayPalApiError } from "./paypal-api.ts";

import { DEFAULT_STORE_NOTICE, STORE_NOTICE_SETTING_KEY, parseStoredStoreNotice, sanitizeStoreNotice, type StoreNotice } from "../src/config/store-notice.ts";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email.ts";
import { env } from "../src/env.ts";
import { db, type ComplimentaryGrant, type EmailPreference, type Membership, type Subscription, type UsageRecord, type User } from "../src/db.ts";
import { inboxSummarySafe, recordContactFormMessage } from "./inbox-core.ts";
import { claimGiftCode } from "./gift-codes.ts";
import { giftEndsAt, isGiftLength } from "../src/lib/gift-lengths.ts";
import { rateLimit as kvRateLimit } from "../src/rate-limiter.ts";
import { isDevelopmentRuntime, isProductionRuntime, runtimeMode } from "../src/runtime-mode.ts";

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

export { DEFAULT_STORE_NOTICE, sanitizeStoreNotice, type StoreNotice };

/** The store notice as the front pages read it — defaults to the launch notice until edited. */
async function publicStoreNotice(): Promise<StoreNotice> {
  const raw = await db.getSetting(STORE_NOTICE_SETTING_KEY);
  return parseStoredStoreNotice(raw);
}

const now = () => new Date().toISOString();
/** Verification links are intentionally long-lived enough for users who only
 * check email once a day, while still limiting the lifetime of a bearer
 * token. Keep this value shared by registration and resend so the email copy
 * and the database check cannot drift apart. */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const DEVELOPMENT_SESSION_SECRET = "scenering-local-development-secret";
/**
 * Production is the default; `NODE_ENV=development`/`test` must be explicit.
 * See src/runtime-mode.ts — a missing variable used to make a deployed server
 * behave like a development box, which is how password-reset links could be
 * handed back in an API response.
 */
function isProduction() { return isProductionRuntime(env()); }
function sessionSecret() {
  /* SESSION_SECRET is the name the deployment scripts set. The legacy
     SCENERING_AUTH_SECRET alias is still honoured so an older local
     .dev.vars keeps working, but it is never a substitute for the real
     secret in production. */
  const configured = env().SESSION_SECRET || env().SCENERING_AUTH_SECRET;
  const secret = configured || (!isProduction() ? DEVELOPMENT_SESSION_SECRET : "");
  if (!secret || (isProduction() && secret.length < 32)) throw new Error("SESSION_SECRET must be a unique production secret of at least 32 characters");
  return secret;
}
const hashToken = (token: string) => createHmac("sha256", sessionSecret()).update(token).digest("hex");

const REQUIRED_SESSION_COLUMNS = ["device_id", "device_label", "platform", "last_seen_at"] as const;
const REQUIRED_WORKSPACE_COLUMNS: ReadonlyArray<{ name: string; definition: string }> = [
  { name: "user_id", definition: "TEXT NOT NULL" },
  { name: "doc_key", definition: "TEXT NOT NULL" },
  { name: "body", definition: "TEXT NOT NULL DEFAULT ''" },
  { name: "revision", definition: "INTEGER NOT NULL DEFAULT 1" },
  { name: "updated_at", definition: "TEXT NOT NULL" },
  { name: "deleted", definition: "INTEGER NOT NULL DEFAULT 0" },
  { name: "device_id", definition: "TEXT" },
];
/* The exact DDL from migrations/0007_devices_workspace.sql, statement for
   statement: D1's prepared statements take one statement at a time, so the
   table and its index are kept apart here. */
const WORKSPACE_TABLE_DDL =
  "CREATE TABLE IF NOT EXISTS workspace_documents (user_id TEXT NOT NULL, doc_key TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, device_id TEXT, PRIMARY KEY (user_id, doc_key), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)";
const WORKSPACE_INDEX_DDL = "CREATE INDEX IF NOT EXISTS idx_workspace_documents_user ON workspace_documents(user_id)";
const SESSION_DEVICE_INDEX_DDL = "CREATE INDEX IF NOT EXISTS idx_sessions_user_device ON sessions(user_id, device_id)";
const MIGRATION_0007_NAME = "0007_devices_workspace.sql";

// Healing is attempted once per isolate per database binding, and only after
// it has fully succeeded — a failure must never be cached, so a transient D1
// error (or an operator applying the migration) recovers on the next request
// without waiting for a Worker redeploy.
let schemaHealed = false;
let healedForDb: object | null = null;
let healInFlight: Promise<void> | null = null;

/** Clears the per-isolate schema cache when a test swaps or mutates the database. */
export function resetDatabaseSchemaCheck(): void {
  schemaHealed = false;
  healedForDb = null;
  healInFlight = null;
}

/** Splits a comma-separated SQL list at top-level commas (ignoring parens and quotes). */
function splitTopLevelSql(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) { parts.push(body.slice(start, i)); start = i + 1; }
  }
  parts.push(body.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * The column names in a CREATE TABLE statement as SQLite stores it in
 * `sqlite_master.sql`. SQLite rewrites that text when a column is added with
 * ALTER TABLE, so it is the honest record of the live table — and unlike
 * `PRAGMA table_info`, reading it through a D1 Worker binding is always
 * permitted.
 */
function tableColumnsFromDdl(ddl: string): Set<string> {
  const columns = new Set<string>();
  const open = ddl.indexOf("(");
  const close = ddl.lastIndexOf(")");
  if (open < 0 || close <= open) return columns;
  for (const item of splitTopLevelSql(ddl.slice(open + 1, close))) {
    const token = item.match(/^["`\[]?([A-Za-z_][A-Za-z0-9_]*)["`\]]?/);
    if (!token) continue;
    const name = token[1].toLowerCase();
    if (["primary", "foreign", "unique", "check", "constraint"].includes(name)) continue;
    columns.add(name);
  }
  return columns;
}

/** Reads the stored DDL of the tables this module cares about, in one query. */
async function readTableDefinitions(
  d1: D1Database,
  tables: readonly string[],
): Promise<Map<string, string>> {
  const definitions = new Map<string, string>();
  const placeholders = tables.map(() => "?").join(", ");
  const result = await d1
    .prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
    .bind(...tables)
    .all();
  for (const row of (result?.results || []) as Array<Record<string, unknown>>) {
    const name = String(row.name || "").toLowerCase();
    if (!name) continue;
    definitions.set(name, String(row.sql || ""));
  }
  return definitions;
}

function isDuplicateColumnError(err: unknown): boolean {
  return /duplicate column name/i.test(String((err as any)?.message || err));
}

/**
 * Makes `0007_devices_workspace.sql` self-healing at runtime.
 *
 * Workers Builds deploys with `wrangler deploy` and never runs
 * `wrangler d1 migrations apply --remote`, so production can legitimately be
 * serving code that expects 0007 while D1 has not applied it. Refusing to sign
 * anyone in until an operator intervenes — which is what the old PRAGMA-based
 * 503 gate did — locks the owner out of their own product. Instead the four
 * `sessions` device columns, the `workspace_documents` table and its index are
 * brought into existence here, idempotently, and the `d1_migrations` ledger is
 * aligned at the end so it never drifts behind the live schema.
 *
 * Never throws: a database that cannot be healed must still let
 * `/api/auth/*` answer (the session fallbacks in src/db.ts take over).
 */
export async function ensureDevicesAndWorkspaceSchema(): Promise<void> {
  let d1: (D1Database & { sqlite?: unknown }) | undefined;
  try {
    d1 = env().DB as (D1Database & { sqlite?: unknown }) | undefined;
  } catch {
    return;
  }
  if (!d1 || typeof d1.prepare !== "function") return;

  const isTestShim = "sqlite" in (d1 as object);
  if (schemaHealed && (!isTestShim || healedForDb === d1)) return;
  if (healInFlight) return healInFlight;

  healInFlight = (async () => {
    try {
      const definitions = await readTableDefinitions(d1!, ["sessions", "workspace_documents"]);

      const sessionsDdl = definitions.get("sessions");
      const workspaceDdl = definitions.get("workspace_documents");

      let sessionsComplete = false;
      if (sessionsDdl !== undefined) {
        const columns = tableColumnsFromDdl(sessionsDdl);
        const missing = REQUIRED_SESSION_COLUMNS.filter((column) => !columns.has(column));
        let complete = true;
        for (const column of missing) {
          try {
            await d1!.prepare(`ALTER TABLE sessions ADD COLUMN ${column} TEXT`).run();
          } catch (err: any) {
            // A duplicate-column race means another isolate got there first,
            // which is exactly the state we wanted.
            if (!isDuplicateColumnError(err)) {
              complete = false;
              console.error(`[schema] sessions.${column} could not be added:`, err?.message || err);
            }
          }
        }
        try {
          await d1!.prepare(SESSION_DEVICE_INDEX_DDL).run();
        } catch (err: any) {
          console.error("[schema] idx_sessions_user_device could not be created:", err?.message || err);
        }
        sessionsComplete = complete;
      }

      let workspaceComplete = false;
      if (workspaceDdl === undefined) {
        try {
          await d1!.prepare(WORKSPACE_TABLE_DDL).run();
          await d1!.prepare(WORKSPACE_INDEX_DDL).run();
          workspaceComplete = true;
        } catch (err: any) {
          console.error("[schema] workspace_documents could not be created:", err?.message || err);
        }
      } else {
        const columns = tableColumnsFromDdl(workspaceDdl);
        let complete = true;
        for (const column of REQUIRED_WORKSPACE_COLUMNS) {
          if (columns.has(column.name)) continue;
          try {
            await d1!.prepare(`ALTER TABLE workspace_documents ADD COLUMN ${column.name} ${column.definition}`).run();
          } catch (err: any) {
            if (!isDuplicateColumnError(err)) {
              complete = false;
              console.error(`[schema] workspace_documents.${column.name} could not be added:`, err?.message || err);
            }
          }
        }
        workspaceComplete = complete;
      }

      if (sessionsComplete && workspaceComplete) {
        // The live schema now equals what 0007 describes, so the ledger says so
        // too. Absent in unit-test shims (and in a database that has never run
        // a migration) — that is not a reason to fail an authentication.
        try {
          await d1!.prepare("INSERT OR IGNORE INTO d1_migrations (name) VALUES (?)")
            .bind(MIGRATION_0007_NAME)
            .run();
        } catch {
          /* d1_migrations absent — nothing to align. */
        }
        schemaHealed = true;
        healedForDb = isTestShim ? (d1 as object) : null;
      }
    } catch (err: any) {
      // Never fatal: the caller is an authentication or workspace request.
      console.error("[schema] 0007 schema check failed:", err?.message || err);
    } finally {
      healInFlight = null;
    }
  })();

  return healInFlight;
}

export function assertSecurePlatformConfiguration() {
  sessionSecret();
  const publicAppUrl = env().PUBLIC_APP_URL;
  if (isProduction() && !publicAppUrl) throw new Error("PUBLIC_APP_URL is required in production");
  if (publicAppUrl) { const url = new URL(publicAppUrl); if (isProduction() && url.protocol !== "https:") throw new Error("PUBLIC_APP_URL must use HTTPS in production"); }
  if (isProduction()) {
    const ownerEmail = configuredOwnerEmail();
    if (!/^\S+@\S+\.\S+$/.test(ownerEmail) || ownerEmail.length > 254) {
      throw new Error("SCENERING_OWNER_EMAIL must be a valid owner-administrator email in production");
    }
    const emailProvider = String(env().EMAIL_PROVIDER || "").trim().toLowerCase();
    if (emailProvider !== "resend" || !String(env().RESEND_API_KEY || "").trim()) {
      throw new Error("EMAIL_PROVIDER=resend and RESEND_API_KEY are required in production for account verification and recovery");
    }
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
/** The real client IP as Cloudflare reports it. Under the Workers↔Express
 *  bridge (`cloudflare:node`'s httpServerHandler) there is no real TCP
 *  socket, so `req.ip`/`req.socket.remoteAddress` cannot be trusted the way
 *  they could on a bare Node host — the header Cloudflare itself attaches to
 *  every request reaching the Worker is the reliable source. */
function clientIp(req: Request): string { return String(req.headers["cf-connecting-ip"] || req.ip || "unknown"); }

function safeUser(user: User) { return { id: user.id, email: user.email, displayName: user.displayName, emailVerified: user.isVerified, role: user.role, createdAt: user.createdAt }; }

/**
 * Owner administration is deliberately configured rather than inferred from
 * a source-code default. A public default email would let somebody register
 * that address first on a fresh database and claim the owner role.
 */
function configuredOwnerEmail() { return String(env().SCENERING_OWNER_EMAIL || "").trim().toLowerCase(); }
function isConfiguredOwner(user: Pick<User, "email">) {
  const ownerEmail = configuredOwnerEmail();
  return Boolean(ownerEmail && user.email === ownerEmail);
}

/**
 * Keep the single configured owner's role in sync with the deployment.
 * Crucially, an email address in configuration is not proof that the browser
 * owns that mailbox: only a verified account can receive administrator access.
 * If the configured owner changes, a previous owner loses the administrator
 * role on their next authenticated request.
 */
async function ensureOwnerPrivileges(user: User): Promise<User> {
  if (!isConfiguredOwner(user)) {
    if (user.role === "admin") {
      await db.updateUser(user.id, { role: "user" });
      user = { ...user, role: "user" };
    }
    return user;
  }
  if (!user.isVerified) return user;
  if (user.role !== "admin") {
    await db.updateUser(user.id, { role: "admin" });
    user = { ...user, role: "admin" };
  }
  return user;
}

/** A subscription that was cancelled or is in dunning keeps its plan until
 *  the period that was paid for runs out. The provider marks the subscription
 *  ended then, but a webhook that is never delivered must not leave a paid plan
 *  switched on forever, so the stored end date is the
 *  backstop. Scoped to one user (not a full-table sweep) so it is cheap enough
 *  to run on the authenticated request path. */
async function sweepUserSubscriptionExpiry(userId: string, prefetched?: Subscription | null): Promise<{ activeSub: Subscription | null; downgraded: boolean }> {
  const sub = prefetched !== undefined ? prefetched : await db.findActiveSubscriptionByUserId(userId);
  if (!sub) return { activeSub: null, downgraded: false };
  if ((sub.status === "active" || sub.status === "on_trial") && !sub.cancelAtPeriodEnd) return { activeSub: sub, downgraded: false };
  const ends = Date.parse(String(sub.expiresAt || sub.currentPeriodEnd || ""));
  if (!Number.isFinite(ends) || ends > Date.now()) return { activeSub: sub, downgraded: false };
  if (sub.status !== "cancelled") {
    await db.updateSubscription(sub.id, { status: "expired" });
  }
  const membership = await db.findMembershipByUserId(userId);
  if (membership && membership.plan !== "free") await db.updateMembership(membership.id, { plan: "free" });
  return { activeSub: sub.status === "cancelled" ? sub : null, downgraded: true };
}

async function activeComplimentaryGrant(userId: string) {
  return db.findAndSweepActiveComplimentaryGrant(userId);
}

interface ResolvedEntitlements {
  plan: PlanSlug;
  storedMembership: Membership | null;
  grant: ComplimentaryGrant | null;
  subscription: Subscription | null;
}

function visibleSubscription(sub: Subscription | null): Subscription | null {
  if (!sub) return null;
  if (sub.status === "cancelled") {
    const ends = Date.parse(String(sub.expiresAt || sub.currentPeriodEnd || ""));
    if (!Number.isFinite(ends) || ends <= Date.now()) return null;
  }
  return sub;
}

function buildEffectiveMembership(user: User, plan: PlanSlug, stored: Membership | null, grant: ComplimentaryGrant | null) {
  return {
    ...(stored ? { id: stored.id, user_id: stored.userId, status: stored.status } : { id: "", user_id: user.id, status: "active" }),
    plan_id: plan,
    source: user.role === "admin" && isConfiguredOwner(user) ? "owner_admin" : grant && grant.planId === plan ? "complimentary" : plan === "free" ? "free" : "verified_subscription",
    complimentary_ends_at: grant && grant.planId === plan ? grant.endsAt : null,
    complimentary_period: grant && grant.planId === plan ? grant.period : null,
  };
}

/** Logs a secondary-table failure without letting it reach the caller: a
 *  missing migration on `subscriptions`, `complimentary_grants` or
 *  `usage_records` must degrade the plan answer, never break sign-in. */
function isolatedRead<T>(label: string, fallback: T, promise: Promise<T>): Promise<T> {
  return promise.catch((err: any) => {
    console.error(`[auth] ${label} failed:`, err?.message || err);
    return fallback;
  });
}

/** Resolves subscription expiry, stored membership and complimentary grant in
 *  parallel so session checks and account payloads avoid serial D1 waterfalls.
 *
 *  Each read is isolated: these are auxiliary entitlement tables, and a schema
 *  or transport error in one of them used to reject the whole Promise.all and
 *  take POST /api/auth/login and GET /api/auth/session down with a 500. The
 *  owner administrator still resolves to SceneForge; everyone else falls back
 *  to their stored membership, which defaults to Free. */
async function resolveUserEntitlements(user: User): Promise<ResolvedEntitlements> {
  const isOwnerAdmin = user.role === "admin" && isConfiguredOwner(user);
  const [rawSub, initialMembership, grant] = await Promise.all([
    isolatedRead<Subscription | null>("findActiveSubscriptionByUserId", null, db.findActiveSubscriptionByUserId(user.id)),
    isolatedRead<Membership | null>("findMembershipByUserId", null, db.findMembershipByUserId(user.id)),
    isolatedRead<ComplimentaryGrant | null>("findAndSweepActiveComplimentaryGrant", null, activeComplimentaryGrant(user.id)),
  ]);
  const swept = isOwnerAdmin
    ? { activeSub: rawSub, downgraded: false }
    : await isolatedRead("sweepUserSubscriptionExpiry", { activeSub: rawSub, downgraded: false }, sweepUserSubscriptionExpiry(user.id, rawSub));
  const storedMembership = swept.downgraded && initialMembership ? { ...initialMembership, plan: "free" as PlanSlug } : initialMembership;
  if (isOwnerAdmin) {
    return { plan: "sceneforge", storedMembership, grant, subscription: visibleSubscription(swept.activeSub) };
  }
  const paid: PlanSlug = storedMembership?.plan || "free";
  const complimentary: PlanSlug = grant?.planId || "free";
  const rank: Record<PlanSlug, number> = { free: 0, sceneflow: 1, sceneforge: 2 };
  const plan = rank[complimentary] > rank[paid] ? complimentary : paid;
  return { plan, storedMembership, grant, subscription: visibleSubscription(swept.activeSub) };
}

async function getUserPlan(user: User): Promise<PlanSlug> {
  if (user.role === "admin" && isConfiguredOwner(user)) return "sceneforge";
  return (await resolveUserEntitlements(user)).plan;
}

async function effectiveMembership(user: User, plan: PlanSlug) {
  const [stored, grant] = await Promise.all([
    db.findMembershipByUserId(user.id),
    activeComplimentaryGrant(user.id),
  ]);
  return buildEffectiveMembership(user, plan, stored, grant);
}

/**
 * What the Email Centre inbox shows about a member next to their messages:
 * plan (with where it comes from), gift end date, sign-up date and email
 * consent. Uses the same plan resolution as everything else above.
 */
export async function adminMemberSummary(userId: string) {
  const user = await db.findUserById(userId);
  if (!user) return null;
  const [entitlements, preference] = await Promise.all([
    resolveUserEntitlements(user),
    db.findEmailPreference(user.id),
  ]);
  const membership = buildEffectiveMembership(user, entitlements.plan, entitlements.storedMembership, entitlements.grant);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    verified: user.isVerified,
    createdAt: user.createdAt,
    plan: entitlements.plan,
    source: membership.source,
    complimentaryEndsAt: membership.complimentary_ends_at,
    complimentaryPeriod: membership.complimentary_period,
    marketingConsent: Boolean(preference?.marketingConsent),
  };
}

/** The subscription worth showing. A cancelled one is still shown while the
 *  paid period runs, so the customer can see the end date and manage the
 *  subscription. Once its end date has passed, it is no longer current. */
async function subscriptionForUser(userId: string) {
  return visibleSubscription(await db.findActiveSubscriptionByUserId(userId));
}

/** The API's wire format for subscriptions: snake_case, exactly the shape
 *  the account modal's TypeScript interface declares and the billing suite
 *  pins (billing_interval, customer_portal_url, …). The db layer's row
 *  mappers return camelCase; this converts on the way out. */
function apiSubscription(sub: import("../src/db.ts").Subscription | null) {
  if (!sub) return null;
  return {
    provider: sub.provider,
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
/**
 * Which device is asking, and how many devices this membership may have open.
 *
 * A plan's device benefit is a real limit, so it is enforced here rather than
 * in the browser: the studio sends a random id it keeps for itself (see
 * src/lib/device.ts), and a session that arrives without one is pinned to a
 * fingerprint of its user agent and language so two copies of the same
 * browser on different machines still count as two devices rather than one.
 * A phone is not exempt — it is a device.
 */
type DeviceIdentity = { id: string; label: string; platform: "mobile" | "tablet" | "desktop" };

function devicePlatformFromAgent(userAgent: string): DeviceIdentity["platform"] {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(ua)) return "tablet";
  if (/iphone|ipod|android|blackberry|iemobile|opera mini|mobile/.test(ua)) return "mobile";
  return "desktop";
}

function requestDevice(req: Request): DeviceIdentity {
  const body: any = (req as any).body || {};
  const header = (name: string) => String(req.headers[name] || "").trim().slice(0, 120);
  const agent = String(req.headers["user-agent"] || "");
  const supplied = String(body.deviceId || header("x-scenering-device") || "").trim();
  const id = /^[A-Za-z0-9_-]{8,80}$/.test(supplied)
    ? supplied
    : `ua-${hashToken(`${agent}|${String(req.headers["accept-language"] || "")}`).slice(0, 40)}`;
  const label = String(body.deviceLabel || header("x-scenering-device-label") || "").trim().slice(0, 80);
  const requestedPlatform = String(body.platform || header("x-scenering-platform") || "").trim();
  const platform = requestedPlatform === "mobile" || requestedPlatform === "tablet" || requestedPlatform === "desktop"
    ? requestedPlatform as DeviceIdentity["platform"]
    : devicePlatformFromAgent(agent);
  return { id, label: label || `A ${platform} browser`, platform };
}

/**
 * Hold this membership to its plan's device count: keep the sessions used most
 * recently (always including the caller's own) and sign the rest out.
 * Returns how many other devices were signed out, so the sign-in screen can
 * say so instead of a machine simply stopping mid-session with no explanation.
 */
async function claimDeviceSeat(userId: string, plan: PlanSlug, sessionId?: string): Promise<{ evicted: number; limit: number }> {
  const limit = getPlanConfig(plan).limits.maxConcurrentDevices;
  if (!Number.isFinite(limit) || limit <= 0) return { evicted: 0, limit };
  const sessions = await db.listActiveSessionsForUser(userId).catch((err): Awaited<ReturnType<typeof db.listActiveSessionsForUser>> => {
    console.error("[auth] listActiveSessionsForUser failed:", err?.message || err);
    return [];
  });
  /* A device may hold more than one session — signing in again on the same
     browser, or a second tab — and that is still one device. Sessions are
     ordered most recently used first, so the first one seen for a device is
     the one that counts and the rest of that device's sessions are kept. */
  const devices: Array<{ deviceId: string; sessions: typeof sessions }> = [];
  for (const session of sessions) {
    const key = session.deviceId || session.id;
    const existing = devices.find((entry) => entry.deviceId === key);
    if (existing) existing.sessions.push(session);
    else devices.push({ deviceId: key, sessions: [session] });
  }
  if (devices.length <= limit) return { evicted: 0, limit };
  const keep = devices.slice(0, limit);
  if (sessionId && !keep.some((entry) => entry.sessions.some((session) => session.id === sessionId))) {
    const current = devices.find((entry) => entry.sessions.some((session) => session.id === sessionId));
    if (current) keep[keep.length - 1] = current;
  }
  const keepIds = new Set(keep.flatMap((entry) => entry.sessions.map((session) => session.id)));
  let evicted = 0;
  for (const session of sessions) {
    if (keepIds.has(session.id)) continue;
    // Eviction is housekeeping: failing to sign an idle machine out must not
    // fail the sign-in that triggered it.
    try {
      await db.deleteSessionById(session.id);
      evicted += 1;
    } catch (err: any) {
      console.error("[auth] deleteSessionById failed:", err?.message || err);
    }
  }
  return { evicted, limit };
}

function sessionCookieAttributes() {
  if (!isProduction() && env().DEV_EMBEDDED_PREVIEW === "1") return "Path=/; HttpOnly; SameSite=None; Secure";
  return `Path=/; HttpOnly; SameSite=Lax${isProduction() ? "; Secure" : ""}`;
}
function setSessionCookie(res: Response, token: string) { res.setHeader("Set-Cookie", `scenering_session=${encodeURIComponent(token)}; ${sessionCookieAttributes()}; Max-Age=2592000; Priority=High`); }
function clearSessionCookie(res: Response) { res.setHeader("Set-Cookie", `scenering_session=; ${sessionCookieAttributes()}; Max-Age=0; Priority=High`); }

function embeddedPreviewSessionBridgeEnabled() {
  // A bearer token in browser-readable storage is never acceptable on the
  // customer-facing service. This narrow development-only escape hatch keeps
  // sandbox iframes usable when their browser blocks cookies altogether.
  return !isProduction() && env().DEV_EMBEDDED_PREVIEW === "1";
}
function sessionTokenFromRequest(req: Request): string {
  const cookieToken = cookies(req).scenering_session;
  if (cookieToken) return cookieToken;
  if (!embeddedPreviewSessionBridgeEnabled()) return "";
  const headerToken = String(req.headers["x-scenering-session"] || "").trim();
  if (headerToken && headerToken !== "signed-out") return headerToken;
  return "";
}

type Auth = { user: User; plan: PlanSlug; sessionId?: string; deviceId?: string | null; entitlements?: ResolvedEntitlements };

/** Resolves the signed-in user (and plan) for a request, or null. Exported
 *  for the Email Centre's preference endpoints, which accept EITHER a
 *  session OR the signed token a marketing email carries — so they cannot
 *  simply mount requireUser. */
export async function findSession(req: Request): Promise<Auth | null> {
  // Every authenticated request may read the device columns (this session's
  // last-seen stamp, the device list in the account panel), so the 0007 repair
  // runs here too — cached per isolate once it has succeeded.
  await ensureDevicesAndWorkspaceSchema();
  const raw = sessionTokenFromRequest(req);
  if (raw) {
    const session = await db.findSessionByToken(hashToken(raw));
    const user = session && (await db.findUserById(session.userId));
    // A session may have been issued before verification enforcement was
    // deployed, or a user may have been unverified by an administrative data
    // repair. Never let an existing cookie bypass the verification gate.
    if (user) {
      const resolved = await ensureOwnerPrivileges(user);
      if (resolved.isVerified) {
        // Remember when this device was last used, so a plan's device limit
        // signs out the machine that has been idle longest rather than the
        // one the person happened to open a week ago. Written at most every
        // ten minutes: a busy studio must not cost a row per request.
        if (session) {
          const lastSeen = session.lastSeenAt ? Date.parse(session.lastSeenAt) : 0;
          if (!lastSeen || Date.now() - lastSeen > 10 * 60_000) {
            void db.touchSession(session.id).catch((err) => {
              console.error("[auth] touchSession failed:", err?.message || err);
            });
          }
        }
        const entitlements = await resolveUserEntitlements(resolved);
        return { user: resolved, plan: entitlements.plan, sessionId: session?.id, deviceId: session?.deviceId ?? null, entitlements };
      }
      // Revoke any legacy session that belongs to an unverified account. This
      // prevents it becoming usable if verification state changes later.
      if (session) await db.deleteSessionByToken(session.token);
    }
  }
  const explicitSignOut = String(req.headers["x-scenering-session"] || "").trim() === "signed-out";
  /* DEV_AUTO_OWNER=1 — development previews only. Some browsers refuse to
     store any cookie for an embedded or proxied preview, which makes
     cookie-based sign-in impossible there no matter what the server sends.
     With this flag the preview treats every request as the configured owner
     administrator, so the product can be reviewed end to end. Double-gated:
     ignored in production, and never set in any deployment configuration. */
  if (!explicitSignOut && !isProduction() && env().DEV_AUTO_OWNER === "1") {
    const ownerEmail = configuredOwnerEmail();
    const owner = ownerEmail && (await db.findUserByEmail(ownerEmail));
    if (owner) {
      const resolved = await ensureOwnerPrivileges(owner);
      if (resolved.role === "admin" && resolved.isVerified) return { user: resolved, plan: "sceneforge" };
    }
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
    // Role is retained as a database record for auditing, but the configured
    // owner address is the authority. This denies a role left behind after an
    // owner-email change even before that stale session is normalized.
    if (auth.user.role !== "admin" || !isConfiguredOwner(auth.user)) return res.status(403).json({ error: "Owner administrator access required" });
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
function weeklyUsageFromRows(rows: UsageRecord[]) {
  return { finalExports: rows.length, finalExportMinutes: Number(rows.reduce((sum, r) => sum + r.durationMinutes, 0).toFixed(2)) };
}
function remainingUsageFromRows(rows: UsageRecord[], plan: PlanSlug) {
  const config = getPlanConfig(plan);
  const shortCount = rows.filter((r) => r.format === "short" || (!r.format && r.durationMinutes <= 1)).length;
  const longCount = rows.length - shortCount;
  return {
    finalExports: config.limits.finalExportsPerWeek == null ? null : Math.max(0, config.limits.finalExportsPerWeek - rows.length),
    shortExports: config.limits.shortExportsPerWeek == null ? null : Math.max(0, config.limits.shortExportsPerWeek - shortCount),
    longExports: config.limits.longExportsPerWeek == null ? null : Math.max(0, config.limits.longExportsPerWeek - longCount),
  };
}
async function weeklyUsage(userId: string) {
  return weeklyUsageFromRows(await db.listUsageSince(userId, weekStart().toISOString()));
}
async function remainingUsage(userId: string, plan: PlanSlug) {
  return remainingUsageFromRows(await db.listUsageSince(userId, weekStart().toISOString()), plan);
}
async function usageAndRemaining(userId: string, plan: PlanSlug) {
  const rows = await db.listUsageSince(userId, weekStart().toISOString());
  return { usage: weeklyUsageFromRows(rows), remaining: remainingUsageFromRows(rows, plan) };
}
async function canExport(
  userId: string,
  plan: PlanSlug,
  duration: number,
  format: "short" | "long",
  options: { excludeReservationId?: string } = {},
) {
  await db.expireStaleReservations();
  const config = getPlanConfig(plan);
  const rows = await db.listUsageSince(userId, weekStart().toISOString());
  // The reservation being completed is itself "reserved" until the moment it
  // completes, so it must not be counted against its own allowance.
  const reserved = (await db.listReservedSince(userId, weekStart().toISOString()))
    .filter((reservation) => reservation.id !== options.excludeReservationId);
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

async function accountPayload(
  user: User,
  current: { sessionId?: string; deviceId?: string; entitlements?: ResolvedEntitlements } = {}
) {
  const [entitlements, usageRows, sessions] = await Promise.all([
    current.entitlements ? Promise.resolve(current.entitlements) : resolveUserEntitlements(user),
    isolatedRead<UsageRecord[]>("listUsageSince", [], db.listUsageSince(user.id, weekStart().toISOString())),
    isolatedRead("listActiveSessionsForUser", [], db.listActiveSessionsForUser(user.id)),
  ]);
  const { plan, subscription } = entitlements;
  const membership = buildEffectiveMembership(user, plan, entitlements.storedMembership, entitlements.grant);
  const usage = weeklyUsageFromRows(usageRows);
  const remaining = remainingUsageFromRows(usageRows, plan);
  const deviceLimit = getPlanConfig(plan).limits.maxConcurrentDevices;
  // Where this membership is signed in — the panel a member checks when they
  // are about to be signed out on an old laptop they no longer use.
  const devices = sessions.map((session) => ({
    label: session.deviceLabel || "Browser",
    platform: session.platform || "desktop",
    lastSeenAt: session.lastSeenAt || session.createdAt,
    current: Boolean(current.sessionId && session.id === current.sessionId) || (!current.sessionId && Boolean(current.deviceId && session.deviceId === current.deviceId)),
  }));
  // `subscription` goes out in the API's snake_case wire format
  // (apiSubscription) — the same shape the membership object uses and the
  // account modal's TypeScript interface declares.
  return {
    user: safeUser(user), membership, subscription: apiSubscription(subscription),
    has_billing_customer: Boolean(subscription?.provider === "paypal"), plan: getPlanConfig(plan), usage, remaining,
    devices: { limit: deviceLimit, active: devices.length, list: devices },
  };
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

/**
 * Decides whether a subscription currently grants paid access.
 *
 * Treats `active`, `trialing` (stored as `on_trial`), and `past_due` (dunning
 * retry window) as access-granting. A scheduled cancellation at period end
 * keeps the subscription active until its deactivation date, so access is NOT
 * revoked until the paid period actually ends.
 */
export function subscriptionGrantsPaidAccess(
  input: string | { status?: string | null; subscription_status?: string | null; scheduledChangeAction?: string | null; cancelAtPeriodEnd?: boolean | null } | null | undefined,
): boolean {
  if (!input) return false;
  const raw = typeof input === "string" ? input : String(input.status ?? input.subscription_status ?? "");
  const status = raw.trim().toLowerCase() === "trialing" ? "on_trial" : raw.trim().toLowerCase();
  return ["active", "on_trial", "past_due"].includes(status);
}

function asyncHandlerVoid(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => { handler(req, res).catch(next); };
}

/* ------------------------------------------------------------------ *
 * PayPal Subscriptions — Sandbox only until an explicit live cutover. *
 * ------------------------------------------------------------------ */
export const PAYPAL_WEBHOOK_PATH = "/api/webhooks/paypal";

const PAYPAL_LIFECYCLE_EVENTS = new Set([
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.DENIED",
]);

function paypalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The origin this request arrived on. Only the trusted single reverse proxy
 * may say it was something else (server.ts's origin guard applies exactly the
 * same rule), so a preview or tunnel host is trusted and a spoofed header on
 * a direct connection is not.
 */
function requestOrigin(req: Request): string {
  const trusted = env().TRUST_PROXY === "1";
  const host = (trusted ? String(req.get("x-forwarded-host") || "").split(",")[0].trim() : "") || String(req.get("host") || "").trim();
  if (!host) return "";
  const proto = (trusted ? String(req.get("x-forwarded-proto") || "").split(",")[0].trim() : "") || req.protocol || "https";
  return `${proto}://${host}`;
}

function paypalConfiguration(requestOriginValue = "") {
  const e = env();
  const publicConfig = paypalPublicConfig(requestOriginValue);
  const webhookIdSet = Boolean(String(e.PAYPAL_WEBHOOK_ID || "").trim());
  const secretSet = Boolean(String(e.PAYPAL_CLIENT_SECRET || "").trim());
  const appUrlConfigured = Boolean(String(e.PUBLIC_APP_URL || "").trim());
  const planConfiguration = (["sceneflow", "sceneforge"] as const).flatMap((plan) => (["monthly", "yearly"] as const).map((interval) => ({
    plan,
    planName: PLAN_CONFIG[plan].name,
    interval,
    planId: paypalPlanId(plan, interval),
    configured: Boolean(paypalPlanId(plan, interval)),
  })));
  const appUrl = paypalAppUrl(requestOriginValue);
  const webhookUrl = appUrl ? `${appUrl}${PAYPAL_WEBHOOK_PATH}` : null;
  const plansReady = planConfiguration.filter((item) => item.configured).length;
  return {
    provider: "paypal" as const,
    environment: paypalIsSandbox() ? "sandbox" as const : "disabled" as const,
    active: paypalIsSandbox(),
    clientIdSet: Boolean(publicConfig.clientId),
    clientSecretSet: secretSet,
    webhookIdSet,
    publicAppUrlSet: Boolean(appUrl),
    /** PUBLIC_APP_URL itself is unset and the value came from this request's
     *  own host — usable for checkout, but not a stable address to register a
     *  webhook against. */
    publicAppUrlDerived: !appUrlConfigured && Boolean(appUrl),
    webhookPath: PAYPAL_WEBHOOK_PATH,
    webhookUrl,
    plans: planConfiguration,
    /** How many of the four plan ids exist. One is enough to test with. */
    plansReady,
    missing: publicConfig.missing,
    unconfiguredPlans: publicConfig.unconfiguredPlans,
    warnings: publicConfig.warnings,
    /* Credentials plus at least one Sandbox plan ready. Requiring all four
       meant a Sandbox with a single product could not sell that product
       either, which is the usual way a Sandbox is brought up.
       The webhook id is deliberately not required: approval is verified by
       reading the subscription back from PayPal, so the button can be tested
       before any webhook is registered. `webhookIdSet` is still reported, so
       the dashboard can say what is outstanding. */
    ready: paypalIsSandbox() && Boolean(publicConfig.clientId) && secretSet && Boolean(appUrl) && plansReady > 0,
  };
}

export const paypalBillingConfiguration = paypalConfiguration;
export const billingConfiguration = paypalConfiguration;
export function billingProvider(): "paypal" { return "paypal"; }

async function updatePaypalMembership(userId: string, plan: PlanSlug, status: string, expiresAt: string | null) {
  const membership = await db.findMembershipByUserId(userId);
  const paid = subscriptionGrantsPaidAccess(status) || (status === "cancelled" && Boolean(expiresAt && Date.parse(expiresAt) > Date.now()));
  const nextPlan = paid ? plan : "free";
  if (membership) await db.updateMembership(membership.id, { plan: nextPlan, status: "active" });
  else await db.createMembership(userId, nextPlan);
}

function paypalStatus(details: any, eventName = ""): string {
  if (eventName === "BILLING.SUBSCRIPTION.PAYMENT.FAILED" || eventName === "PAYMENT.SALE.DENIED") return "past_due";
  if (eventName === "PAYMENT.SALE.COMPLETED") return "active";
  if (eventName === "BILLING.SUBSCRIPTION.CANCELLED") return "cancelled";
  if (eventName === "BILLING.SUBSCRIPTION.SUSPENDED") return "suspended";
  if (eventName === "BILLING.SUBSCRIPTION.EXPIRED") return "expired";
  const state = String(details?.status || "").toUpperCase();
  if (state === "ACTIVE") return "active";
  if (state === "APPROVED" || state === "APPROVAL_PENDING") return "pending";
  if (state === "SUSPENDED") return "suspended";
  if (state === "CANCELLED") return "cancelled";
  if (state === "EXPIRED") return "expired";
  return "pending";
}

function paypalDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

async function applyVerifiedPayPalSubscription(details: any, intent: Awaited<ReturnType<typeof db.findPayPalCheckoutIntentByHash>>, eventName = "", occurredAt: string | null = null) {
  if (!intent || details?.id !== intent.paypalSubscriptionId || details?.plan_id !== intent.paypalPlanId) return null;
  if (paypalText(details?.custom_id) === null || hashToken(String(details.custom_id)) !== intent.intentHash) return null;

  const existing = await db.findSubscriptionByProviderId(String(details.id));
  if (existing && (existing.provider !== "paypal" || existing.userId !== intent.userId)) return null;
  const eventTimestamp = paypalDate(occurredAt) || paypalDate(details?.status_update_time);
  if (existing?.providerEventOccurredAt && eventTimestamp && Date.parse(eventTimestamp) < Date.parse(existing.providerEventOccurredAt)) return existing;
  const status = paypalStatus(details, eventName);
  const periodStart = paypalDate(details?.start_time);
  const periodEnd = paypalDate(details?.billing_info?.next_billing_time) || existing?.currentPeriodEnd || null;
  const cancelled = status === "cancelled" || status === "expired";
  const expiresAt = cancelled ? periodEnd || paypalDate(details?.status_update_time) : null;
  const customerId = paypalText(details?.subscriber?.payer_id);
  const fields = {
    provider: "paypal",
    providerCustomerId: customerId,
    providerSubscriptionId: String(details.id),
    providerProductId: intent.paypalPlanId,
    providerPriceId: intent.paypalPlanId,
    planId: intent.planId,
    billingInterval: intent.billingInterval,
    status,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: cancelled,
    cancelledAt: cancelled ? paypalDate(details?.status_update_time) || now() : null,
    expiresAt,
    customerPortalUrl: "https://www.sandbox.paypal.com/myaccount/autopay/",
    updatePaymentUrl: "https://www.sandbox.paypal.com/myaccount/autopay/",
    renewalPrice: `${PLAN_CONFIG[intent.planId].prices[intent.billingInterval]} USD`,
    providerEventOccurredAt: eventTimestamp || now(),
  } as const;

  let sub = existing;
  if (!sub) {
    sub = await db.createSubscription({
      id: db.newId("sub"), userId: intent.userId, provider: "paypal", providerCustomerId: customerId,
      providerSubscriptionId: String(details.id), providerProductId: intent.paypalPlanId, providerPriceId: intent.paypalPlanId,
      planId: intent.planId, billingInterval: intent.billingInterval, status, currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd, cancelAtPeriodEnd: cancelled, cancelledAt: fields.cancelledAt, expiresAt,
      customerPortalUrl: fields.customerPortalUrl, updatePaymentUrl: fields.updatePaymentUrl,
      cardBrand: null, cardLastFour: null, renewalPrice: fields.renewalPrice,
      providerEventOccurredAt: fields.providerEventOccurredAt,
    });
  } else {
    await db.updateSubscription(sub.id, fields);
  }
  await db.updatePayPalCheckoutIntent(intent.id, status === "active" || status === "past_due" ? "completed" : status === "cancelled" ? "cancelled" : status === "expired" ? "expired" : "approved");
  if (["active", "past_due", "cancelled", "expired", "suspended"].includes(status)) {
    await updatePaypalMembership(intent.userId, intent.planId, status, expiresAt);
  }
  await db.recordBillingEvent({
    userId: intent.userId,
    subscriptionId: sub.id,
    eventName: eventName || `paypal.subscription.${status}`,
    fromProvider: true,
    extra: { provider: "paypal", plan_id: intent.planId, billing_interval: intent.billingInterval, status },
  });
  return sub;
}

async function createPayPalCheckout(req: Request, res: Response) {
  const { user } = (req as any).auth as Auth;
  const planValue = String(req.body?.plan || "");
  const intervalValue = String(req.body?.interval || "");
  if (!(planValue === "sceneflow" || planValue === "sceneforge") || !(intervalValue === "monthly" || intervalValue === "yearly")) {
    return res.status(400).json({ error: "Choose one of the four available paid subscriptions." });
  }
  const plan: Exclude<PlanSlug, "free"> = planValue as Exclude<PlanSlug, "free">;
  const interval: BillingInterval = intervalValue as BillingInterval;
  const configuration = paypalConfiguration(requestOrigin(req));
  if (!configuration.ready) return res.status(503).json({ error: "PayPal Sandbox subscriptions are not fully configured.", code: "PAYPAL_NOT_CONFIGURED", missing: configuration.missing });

  const current = await db.findActiveSubscriptionByUserId(user.id);
  if (current && current.status !== "expired") {
    const expires = Date.parse(String(current.expiresAt || current.currentPeriodEnd || ""));
    if (current.status !== "cancelled" || !Number.isFinite(expires) || expires > Date.now()) {
      return res.status(409).json({ error: "An existing subscription is already active for this account. Manage or cancel it before starting another.", code: "SUBSCRIPTION_ALREADY_EXISTS" });
    }
  }

  const paypalPlan = paypalPlanId(plan, interval);
  /* Refuse only the plan that has no Sandbox id, before any D1 intent row is
     written. The credentials are shared, so one missing product must never
     take the products that do exist off sale. */
  if (!paypalPlan) {
    return res.status(503).json({
      error: `${paypalPlanLabel(plan, interval)} has no PayPal Sandbox plan yet. Set ${PLAN_CONFIG[plan].paypalPlanEnv[interval]} to sell this plan.`,
      code: "PAYPAL_PLAN_NOT_CONFIGURED",
      missing: paypalPlanGaps({ slug: plan, interval }),
    });
  }
  const intentToken = randomBytes(24).toString("base64url");
  await db.expirePayPalCheckoutIntents();
  let intent: Awaited<ReturnType<typeof db.createPayPalCheckoutIntent>>;
  try {
    intent = await db.createPayPalCheckoutIntent({
      id: db.newId("ppi"), userId: user.id, intentHash: hashToken(intentToken), planId: plan, billingInterval: interval,
      paypalPlanId: paypalPlan, paypalSubscriptionId: null, status: "created",
      expiresAt: new Date(Date.now() + 45 * 60_000).toISOString(),
    });
  } catch (error) {
    if (/unique|constraint/i.test(String((error as Error)?.message || error))) {
      return res.status(409).json({ error: "A PayPal checkout is already being prepared for this account. Please finish or retry it shortly.", code: "CHECKOUT_ALREADY_IN_PROGRESS" });
    }
    throw error;
  }

  const base = paypalAppUrl(requestOrigin(req));
  try {
    const created = await createPayPalSubscription({
      planId: paypalPlan, userId: user.id, email: user.email, intentToken,
      returnUrl: `${base}/welcome?payment=paypal`,
      cancelUrl: `${base}/pricing?checkout=cancelled`,
    });
    const subscriptionId = paypalText(created?.id);
    if (!subscriptionId || paypalText(created?.custom_id) !== intentToken) {
      await db.updatePayPalCheckoutIntent(intent.id, "expired");
      return res.status(502).json({ error: "PayPal did not return a verifiable subscription." });
    }
    await db.bindPayPalCheckoutIntent(intent.id, subscriptionId, "approved");
    const startedAt = paypalDate(created?.create_time);
    const row = await db.createSubscription({
      id: db.newId("sub"), userId: user.id, provider: "paypal", providerCustomerId: null,
      providerSubscriptionId: subscriptionId, providerProductId: paypalPlan, providerPriceId: paypalPlan,
      planId: plan, billingInterval: interval, status: "pending", currentPeriodStart: startedAt,
      currentPeriodEnd: null, cancelAtPeriodEnd: false, cancelledAt: null, expiresAt: null,
      customerPortalUrl: "https://www.sandbox.paypal.com/myaccount/autopay/", updatePaymentUrl: "https://www.sandbox.paypal.com/myaccount/autopay/",
      cardBrand: null, cardLastFour: null, renewalPrice: `${PLAN_CONFIG[plan].prices[interval]} USD`, providerEventOccurredAt: null,
    });
    const approveUrl = Array.isArray(created?.links) ? paypalText(created.links.find((link: any) => link?.rel === "approve")?.href) : null;
    return res.status(201).json({ subscriptionId, approveUrl, plan: row.planId, interval: row.billingInterval });
  } catch (error) {
    await db.updatePayPalCheckoutIntent(intent.id, "expired").catch(() => {});
    if (error instanceof PayPalApiError) return res.status(error.status).json({ error: error.message, code: error.code });
    throw error;
  }
}

async function confirmPayPalSubscription(req: Request, res: Response) {
  const { user } = (req as any).auth as Auth;
  const subscriptionId = String(req.body?.subscriptionId || "").trim();
  if (!/^[A-Z0-9-]{8,80}$/i.test(subscriptionId)) return res.status(400).json({ error: "A valid PayPal subscription is required." });
  const row = await db.findSubscriptionByProviderId(subscriptionId);
  if (!row || row.provider !== "paypal" || row.userId !== user.id) return res.status(404).json({ error: "This subscription is not linked to your Scenering account." });
  const intent = await db.findPayPalCheckoutIntentBySubscriptionId(subscriptionId);
  if (!intent || intent.userId !== user.id) return res.status(404).json({ error: "The secure checkout session could not be verified." });
  try {
    const details = await getPayPalSubscription(subscriptionId);
    const sub = await applyVerifiedPayPalSubscription(details, intent);
    if (!sub) return res.status(403).json({ error: "PayPal subscription details do not match this account and plan." });
    return res.json({ verified: true, status: sub.status, active: subscriptionGrantsPaidAccess(sub.status), membership: await effectiveMembership(user, await getUserPlan(user)) });
  } catch (error) {
    if (error instanceof PayPalApiError) return res.status(error.status).json({ error: error.message, code: error.code });
    throw error;
  }
}

async function cancelPayPalSubscriptionForUser(req: Request, res: Response) {
  const { user } = (req as any).auth as Auth;
  const requestedId = String(req.body?.subscriptionId || "").trim();
  const requested = requestedId ? await db.findSubscriptionByProviderId(requestedId) : null;
  if (requestedId && (!requested || requested.provider !== "paypal" || requested.userId !== user.id)) return res.status(404).json({ error: "This PayPal subscription is not linked to your Scenering account." });
  const sub = requested || await db.findActiveSubscriptionByUserId(user.id);
  if (!sub || sub.provider !== "paypal" || !sub.providerSubscriptionId) return res.status(404).json({ error: "No active PayPal subscription was found." });
  try {
    await cancelPayPalSubscription(sub.providerSubscriptionId, "Cancelled by the Scenering account holder.");
    const details = await getPayPalSubscription(sub.providerSubscriptionId);
    const intent = await db.findPayPalCheckoutIntentBySubscriptionId(sub.providerSubscriptionId);
    if (!intent || !await applyVerifiedPayPalSubscription(details, intent, "BILLING.SUBSCRIPTION.CANCELLED")) {
      return res.status(502).json({ error: "PayPal accepted the cancellation but the updated status could not yet be verified." });
    }
    return res.json({ cancelled: true, subscription: apiSubscription(await subscriptionForUser(user.id)) });
  } catch (error) {
    if (error instanceof PayPalApiError) return res.status(error.status).json({ error: error.message, code: error.code });
    throw error;
  }
}

function paypalSubscriptionIdFromEvent(event: any): string | null {
  const resource = event?.resource || {};
  const related = paypalText(resource.supplementary_data?.related_ids?.subscription_id)
    || paypalText(resource.supplementary_data?.related_ids?.billing_agreement_id)
    || paypalText(resource.billing_agreement_id);
  if (String(event?.event_type || "").startsWith("PAYMENT.SALE.")) return related;
  return paypalText(resource.id) || related;
}

async function handlePayPalWebhookEvent(event: any): Promise<string> {
  const eventId = paypalText(event?.id);
  const eventName = String(event?.event_type || "");
  if (!eventId || !eventName) return "ignored";
  const key = `paypal:${eventId}`;
  const initialPayload = { provider: "paypal", resource_id: paypalSubscriptionIdFromEvent(event) };
  const claimed = await db.claimWebhookEvent({ providerEventId: key, eventName, status: "processing", payload: initialPayload });
  if (!claimed) {
    const previous = await db.findWebhookEventByProviderId(key);
    const staleBefore = new Date(Date.now() - 2 * 60_000).toISOString();
    const retryClaimed = previous?.status === "retryable_error" && await db.claimRetryableWebhookEvent(key);
    const staleClaimed = previous?.status === "processing" && await db.reclaimStaleWebhookEvent(key, staleBefore);
    if (!retryClaimed && !staleClaimed) {
      await db.markWebhookEventDuplicate(key);
      return "duplicate";
    }
  }
  const record = async (status: string, extra: Record<string, unknown> = {}) => {
    await db.updateWebhookEventStatus(key, status, { ...initialPayload, ...extra });
    return status;
  };
  if (!PAYPAL_LIFECYCLE_EVENTS.has(eventName)) return record("ignored");
  const subscriptionId = paypalSubscriptionIdFromEvent(event);
  if (!subscriptionId) return record("ignored");
  let intent = await db.findPayPalCheckoutIntentBySubscriptionId(subscriptionId);
  if (!intent) {
    const customId = paypalText(event?.resource?.custom_id);
    if (customId) intent = await db.findPayPalCheckoutIntentByHash(hashToken(customId));
  }
  if (!intent) return record("unmatched");
  try {
    const details = await getPayPalSubscription(subscriptionId);
    if (details?.id !== subscriptionId || details?.plan_id !== intent.paypalPlanId || hashToken(String(details?.custom_id || "")) !== intent.intentHash) {
      return record("rejected");
    }
    const sub = await applyVerifiedPayPalSubscription(details, intent, eventName, paypalText(event?.create_time));
    return record(sub ? "processed" : "rejected", { user_id: intent.userId, status: sub?.status || "unmapped" });
  } catch (error) {
    if (error instanceof PayPalApiError) return record("retryable_error", { code: error.code });
    await db.updateWebhookEventStatus(key, "retryable_error", { ...initialPayload, error: "internal processing failure" });
    throw error;
  }
}

export function registerPayPalWebhook(app: Express) {
  app.post(PAYPAL_WEBHOOK_PATH, asyncHandlerVoid(async (req, res) => {
    /* Live mode stays refused everywhere, including production — that is a
     * separate approved cutover. Sandbox webhooks are accepted on any runtime
     * so that a Sandbox checkout running on the customer-facing host can still
     * be activated by BILLING.SUBSCRIPTION.ACTIVATED. */
    if (!paypalIsSandbox()) return res.status(503).json({ error: "PayPal webhooks are disabled unless PAYPAL_ENVIRONMENT is \"sandbox\"." });
    if (!String(env().PAYPAL_WEBHOOK_ID || "").trim()) return res.status(503).json({ error: "PayPal Sandbox webhook verification is not configured." });
    if (!await verifyPayPalWebhook(req.headers as Record<string, string | string[] | undefined>, req.body)) {
      return res.status(401).json({ error: "PayPal webhook signature could not be verified." });
    }
    const status = await handlePayPalWebhookEvent(req.body);
    res.status(status === "retryable_error" ? 503 : 200).json({ received: true, status });
  }));
}


export function registerPlatformRoutes(app: Express) {
  registerPayPalWebhook(app);
  /* No global schema gate. A missing D1 migration used to be answered with a
     503 for EVERY /api/* call — including sign-in — which turned a deploy
     ordering mistake into a total lockout. Schema repair is now idempotent and
     lives on the paths that need it (ensureDevicesAndWorkspaceSchema, called
     from the auth and workspace entry points), and a database that cannot be
     repaired still answers /api/auth/* from the session fallbacks in db.ts. */

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
    const sandboxAutoProvision = !isProduction() && env().DEV_SANDBOX_AUTO_PROVISION === "1";
    const existing = await db.findUserByEmail(email);
    if (existing && !sandboxAutoProvision) return res.status(409).json({ error: "An account with that email already exists." });
    let user: User;
    if (existing) {
      // This branch exists only for an explicitly enabled development sandbox.
      // It must not make a configured email an administrator before ownership
      // of the mailbox has been verified.
      await db.updateUser(existing.id, { passwordHash: passwordHash(password), displayName, isVerified: true });
      user = (await db.findUserById(existing.id)) || existing;
      user = await ensureOwnerPrivileges(user);
    } else {
      // A configured owner email is an identifier, not an authentication
      // factor. Start every new account as a normal, unverified member and
      // promote the configured account only after its email token is redeemed.
      user = await db.createUser({ id: db.newId("usr"), email, passwordHash: passwordHash(password), displayName, role: "user", isVerified: false });
      await db.createMembership(user.id, "free");
      await db.upsertEmailPreference({ userId: user.id, marketingConsent: Boolean(req.body?.marketingConsent), consentTimestamp: now(), consentSource: "registration", consentVersion: "2026-10", trainingStep: 0, updatedAt: now() });
    }
    const raw = randomBytes(32).toString("base64url");
    await db.deleteVerificationTokensForUser(user.id, "verify");
    await db.createVerificationToken(user.id, hashToken(raw), "verify", new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString());
    try {
      await sendVerificationEmail(user.email, user.displayName, `${baseUrl(req)}/verify-email?token=${encodeURIComponent(raw)}`);
    } catch (err: any) {
      console.warn("[auth] verification email could not be sent:", err?.message || err);
    }
    /* The link belongs in the email and nowhere else. It used to be returned
       to the caller unconditionally, which let anyone create an account and
       verify it without ever reading the mailbox — one throwaway address per
       Free allowance. Development keeps the shortcut; production does not. */
    return res.status(201).json({
      message: "Account created. Check your email to verify it.",
      requiresVerification: true,
      ...(isDevelopmentRuntime(env()) ? { developmentVerificationUrl: `/verify-email?token=${encodeURIComponent(raw)}` } : {}),
    });
  }));

  app.post("/api/auth/login", rateLimit("login", 12, 900000), asyncHandlerVoid(async (req, res) => {
    // Sign-in writes a session row that carries the device columns from 0007.
    // Repair them first (idempotent, cached per isolate) so a deploy that
    // outran its migration still issues a session instead of failing.
    await ensureDevicesAndWorkspaceSchema();
    const email = String(req.body?.email || "").trim().toLowerCase(); const password = String(req.body?.password || "");
    let user = await db.findUserByEmail(email);
    const sandboxAutoProvision = !isProduction() && env().DEV_SANDBOX_AUTO_PROVISION === "1";
    if (!user && sandboxAutoProvision && email && /^\S+@\S+\.\S+$/.test(email) && password.length >= 1) {
      const isOwner = isConfiguredOwner({ email });
      const rawName = isOwner ? "Site Owner" : email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80) || "Test Account";
      user = await db.createUser({
        id: db.newId("usr"),
        email,
        passwordHash: passwordHash(password),
        displayName: rawName.length >= 2 ? rawName : "Test User",
        role: "user",
        isVerified: true,
      });
      await db.createMembership(user.id, "free");
      await db.upsertEmailPreference({ userId: user.id, marketingConsent: false, consentTimestamp: now(), consentSource: "registration", consentVersion: "2026-10", trainingStep: 0, updatedAt: now() });
    } else if (user && sandboxAutoProvision && password.length >= 1 && !passwordMatches(password, user.passwordHash)) {
      await db.updateUser(user.id, { passwordHash: passwordHash(password), isVerified: true });
      user = (await db.findUserById(user.id)) || user;
    }
    if (!user || !passwordMatches(password, user.passwordHash)) return res.status(401).json({ error: "Email or password is incorrect." });
    user = await ensureOwnerPrivileges(user);
    if (!user.isVerified && sandboxAutoProvision) {
      await db.updateUser(user.id, { isVerified: true });
      user = { ...user, isVerified: true };
    }
    if (!user.isVerified) {
      const rawVerify = randomBytes(32).toString("base64url");
      await db.deleteVerificationTokensForUser(user.id, "verify");
      await db.createVerificationToken(user.id, hashToken(rawVerify), "verify", new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString());
      try {
        await sendVerificationEmail(user.email, user.displayName, `${baseUrl(req)}/verify-email?token=${encodeURIComponent(rawVerify)}`);
      } catch {
        // Email delivery must not block the inline verification flow.
      }
      return res.status(403).json({
        error: "Verify your email before signing in.",
        code: "EMAIL_UNVERIFIED",
        ...(isDevelopmentRuntime(env()) ? { developmentVerificationUrl: `/verify-email?token=${encodeURIComponent(rawVerify)}` } : {}),
      });
    }
    const device = requestDevice(req);
    const raw = randomBytes(32).toString("base64url");
    const session = await db.createSession(user.id, hashToken(raw), new Date(Date.now() + 24 * 30 * 3600000).toISOString(), device);
    setSessionCookie(res, raw);
    // One membership, but not unlimited machines: the plan decides how many
    // devices may be open at once, and the device that has been idle longest
    // gives up its place. Signing in again on the same browser replaces its
    // own session, so one person on one device never loses their seat.
    const entitlements = await resolveUserEntitlements(user);
    const { evicted, limit } = await claimDeviceSeat(user.id, entitlements.plan, session.id);
    const payload = await accountPayload(user, { sessionId: session.id, deviceId: device.id, entitlements });
    // Production authentication is cookie-only. Only an explicitly configured
    // embedded development preview receives a short-lived bridge token for
    // browsers that categorically block iframe cookies.
    const previewSession = embeddedPreviewSessionBridgeEnabled() ? { sessionToken: raw } : {};
    return res.json({ ...payload, ...previewSession, deviceLimit: limit, devicesSignedOut: evicted });
  }));

  app.post("/api/auth/logout", asyncHandlerVoid(async (req, res) => {
    await ensureDevicesAndWorkspaceSchema();
    const raw = sessionTokenFromRequest(req);
    if (raw) await db.deleteSessionByToken(hashToken(raw));
    clearSessionCookie(res); res.json({ ok: true });
  }));

  app.get("/api/auth/session", asyncHandlerVoid(async (req, res) => {
    const auth = await findSession(req);
    if (!auth) return res.status(401).json({ error: "No active session" });
    /* Opening the studio is the moment a device asks for its place. Enforcing
       the plan's device count here as well as at sign-in means a membership
       that lapses from SceneFlow to Free cannot keep two machines open just
       because they were signed in while it was paid. */
    if (auth.sessionId) await claimDeviceSeat(auth.user.id, auth.plan, auth.sessionId);
    return res.json(await accountPayload(auth.user, { sessionId: auth.sessionId, deviceId: auth.deviceId ?? undefined, entitlements: auth.entitlements }));
  }));

  app.post("/api/auth/verify-email", rateLimit("verify", 10, 3600000), asyncHandlerVoid(async (req, res) => {
    const hash = hashToken(String(req.body?.token || ""));
    const token = await db.findVerificationToken(hash, "verify");
    const user = token && (await db.findUserById(token.userId));
    if (!token || !user) return res.status(400).json({ error: "This verification link is invalid or expired." });
    await db.updateUser(user.id, { isVerified: true });
    await ensureOwnerPrivileges({ ...user, isVerified: true });
    await db.deleteVerificationToken(token.id);
    return res.json({ message: "Email verified. You can now sign in." });
  }));

  app.post("/api/auth/resend-verification", rateLimit("resend", 3, 3600000), asyncHandlerVoid(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = await db.findUserByEmail(email);
    let developmentVerificationUrl = "";
    let emailDelivered = true;
    if (user && !user.isVerified) {
      const raw = randomBytes(32).toString("base64url");
      await db.deleteVerificationTokensForUser(user.id, "verify");
      await db.createVerificationToken(user.id, hashToken(raw), "verify", new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString());
      developmentVerificationUrl = `/verify-email?token=${encodeURIComponent(raw)}`;
      try {
        await sendVerificationEmail(user.email, user.displayName, `${baseUrl(req)}${developmentVerificationUrl}`);
      } catch (err: any) {
        emailDelivered = false;
        console.warn("[auth] resend verification email could not be sent:", err?.message || err);
      }
    }
    /* Never in production — including when the mail provider fails, and
       including a test storefront. Returning the token when delivery failed
       would hand a password-reset link to whoever asked for it. */
    const includeDevUrl = !isProduction() && Boolean(developmentVerificationUrl);
    res.json({ message: "If the account exists, a verification message has been sent.", ...(includeDevUrl ? { developmentVerificationUrl } : {}) });
  }));

  app.post("/api/auth/forgot-password", rateLimit("forgot", 3, 3600000), asyncHandlerVoid(async (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = await db.findUserByEmail(email);
    let developmentResetUrl = "";
    let emailDelivered = true;
    if (user) {
      const raw = randomBytes(32).toString("base64url");
      await db.deleteVerificationTokensForUser(user.id, "reset");
      await db.createVerificationToken(user.id, hashToken(raw), "reset", new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString());
      developmentResetUrl = `/reset-password?token=${encodeURIComponent(raw)}`;
      try {
        await sendPasswordResetEmail(user.email, user.displayName, `${baseUrl(req)}${developmentResetUrl}`);
      } catch (err: any) {
        emailDelivered = false;
        console.warn("[auth] password reset email could not be sent:", err?.message || err);
      }
    }
    const includeDevUrl = !isProduction() && Boolean(developmentResetUrl);
    res.json({ message: "If the account exists, a password-reset message has been sent.", ...(includeDevUrl ? { developmentResetUrl } : {}) });
  }));

  app.post("/api/auth/reset-password", rateLimit("reset", 5, 3600000), asyncHandlerVoid(async (req, res) => {
    const password = String(req.body?.password || "");
    if (password.length < 10 || password.length > 256) return res.status(400).json({ error: "Use between 10 and 256 characters." });
    const hash = hashToken(String(req.body?.token || ""));
    const token = await db.findVerificationToken(hash, "reset");
    const user = token && (await db.findUserById(token.userId));
    if (!token || !user) return res.status(400).json({ error: "This reset link is invalid or expired." });
    await db.updateUser(user.id, { passwordHash: passwordHash(password), isVerified: true });
    await ensureOwnerPrivileges({ ...user, isVerified: true });
    await db.deleteVerificationTokensForUser(user.id, "reset");
    await db.deleteSessionsForUser(user.id);
    return res.json({ message: "Password updated. Sign in with your new password." });
  }));

  app.get("/api/account", requireUser, asyncHandlerVoid(async (req, res) => {
    const { user, sessionId, deviceId, entitlements } = (req as any).auth as Auth;
    res.json(await accountPayload(user, { sessionId, deviceId: deviceId ?? undefined, entitlements }));
  }));
  app.get("/api/entitlements", requireUser, asyncHandlerVoid(async (req, res) => { const { user, plan } = (req as any).auth as Auth; const { usage, remaining } = await usageAndRemaining(user.id, plan); res.json({ plan, entitlements: getPlanConfig(plan), usage, remaining }); }));
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
    const { user, plan } = (req as any).auth as Auth; const reservationId = String(req.body?.reservationId || "");
    const row = await db.findExportReservation(reservationId, user.id);
    if (!row) return res.status(404).json({ error: "Export reservation not found" });
    if (row.status === "completed") return res.json({ recorded: true });
    if (row.status !== "reserved") return res.status(409).json({ error: "Export reservation is no longer valid" });
    if (Date.parse(row.expiresAt) <= Date.now()) {
      await db.cancelExportReservation(row.id);
      return res.status(409).json({ error: "This export reservation has expired. Start the export again.", code: "RESERVATION_EXPIRED" });
    }
    /* Reserve, then complete, is two steps with a render in between, so the
       plan's remaining allowance is checked again here against the week the
       usage row will actually land in. Without this, several reservations
       could be opened while one export was left, and all of them completed. */
    if (!(await canExport(user.id, plan, row.durationMinutes, row.format, { excludeReservationId: row.id }))) {
      await db.cancelExportReservation(row.id);
      return res.status(403).json({ error: "Your final-export allowance has been reached. Previews remain unlimited." });
    }
    if (!(await db.completeExportReservation(row.id))) {
      return res.status(409).json({ error: "This export reservation was already used or has expired.", code: "RESERVATION_NOT_COMPLETABLE" });
    }
    await db.createUsageRecord({ userId: user.id, kind: "final_export", durationMinutes: row.durationMinutes, format: row.format, projectId: row.projectId, reservationId: row.id });
    return res.json({ recorded: true });
  }));
  app.post("/api/usage/final-export/cancel", requireUser, rateLimit("export-cancel", 60, 3600000), asyncHandlerVoid(async (req, res) => {
    const { user } = (req as any).auth as Auth; const reservationId = String(req.body?.reservationId || "");
    const row = await db.findExportReservation(reservationId, user.id);
    if (row && row.status === "reserved") await db.cancelExportReservation(row.id);
    res.json({ cancelled: true });
  }));
  /* REMOVED deliberately (2026-10): this legacy endpoint recorded an export
     from nothing but a client-supplied duration and format. It never called
     validateExportCreativeManifest, never reserved anything, and never
     checked the plan's length ceilings or the Free Shorts/long split — so an
     older client, or a script, could record exports without the plan's
     creative policy being applied at all. Nothing in this repository calls
     it: the studio reserves (which validates), renders, then completes, and
     every download goes through /api/usage/download. A 410 makes the reason
     explicit instead of pretending the route exists. */
  app.post("/api/usage/final-export", (_req, res) => {
    res.status(410).json({ error: "This endpoint has been retired. Use /api/usage/final-export/reserve, then /api/usage/final-export/complete.", code: "ENDPOINT_RETIRED" });
  });

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
    /* A download that can name the export reservation it came from is counted
       from the server's own record of that render — the duration and format
       it authorised — instead of a number retyped later. The studio sends the
       reservation id with every Vault download; a render made before this
       existed still falls back to the reported duration. */
    const reservationId = String(req.body?.reservationId || "").slice(0, 80);
    let duration = Number(req.body?.durationMinutes);
    let reservationFormat: "short" | "long" | null = null;
    if (reservationId) {
      const reservation = await db.findExportReservation(reservationId, user.id);
      if (reservation && reservation.status === "completed") {
        duration = reservation.durationMinutes;
        reservationFormat = reservation.format;
      }
    }
    if (!Number.isFinite(duration) || duration <= 0 || duration > 1440) return res.status(400).json({ error: "Valid duration required" });
    // Derived here, never taken from the browser: one minute or less is a Short.
    const format: "short" | "long" = reservationFormat ?? (duration <= 1 ? "short" : "long");
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
   * What the browser needs before it can offer a Sandbox checkout — and, when
   * it cannot, exactly which variable is missing.
   *
   * `checkoutEnabled` is the server's own answer, not a build-time guess. The
   * bundle served to a development machine, a preview and production is the
   * same production build, so `import.meta.env.DEV` is false everywhere the
   * app actually runs and can never be the gate: it disabled paid checkout on
   * every Sandbox host while the server was perfectly willing to run it. The
   * runtime knows whether it is production; ask it.
   */
  app.get("/api/billing/public-config", rateLimit("billing-public-config", 60, 60000), asyncHandlerVoid(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const config = paypalPublicConfig(requestOrigin(req));
    const enabled = config.configured && paypalIsSandbox();
    res.json({
      ...config,
      configured: enabled,
      checkoutEnabled: enabled,
      sandbox: paypalIsSandbox(),
      production: isProduction(),
      appUrl: paypalAppUrl(requestOrigin(req)),
    });
  }));
  app.post("/api/billing/paypal/create-subscription", requireUser, rateLimit("paypal-checkout", 20, 3600000), asyncHandlerVoid(createPayPalCheckout));
  app.post("/api/billing/paypal/confirm-subscription", requireUser, rateLimit("paypal-confirm", 30, 3600000), asyncHandlerVoid(confirmPayPalSubscription));
  app.post("/api/billing/paypal/cancel-subscription", requireUser, rateLimit("paypal-cancel", 20, 3600000), asyncHandlerVoid(cancelPayPalSubscriptionForUser));

  /* One click — or one address-bar visit — that asks PayPal itself whether
   * the integration is sound. This exists because the failure it separates is
   * invisible from either side alone: a member's browser can report "email or
   * password is incorrect" from inside PayPal's own login window, and nothing
   * in Scenering can see why. Calling PayPal's API from the server splits the
   * question in two.
   *
   * If the credentials authenticate and every configured plan id comes back
   * from PayPal's own plan list, the integration is finished and whatever is
   * failing is PayPal's sandbox login — which is PayPal's to fix, not ours.
   * If authentication fails, the Client ID and Secret are wrong and we
   * replace them. Neither answer is guessable from the browser.
   *
   * Only variable names and plan statuses are reported. The Client Secret is
   * never echoed, in any branch, including the error paths. */
  app.get("/api/admin/paypal/self-test", requireAdmin, rateLimit("admin-paypal-self-test", 30, 3600000), asyncHandlerVoid(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const e = env();
    const slots = PAYPAL_PLAN_SLOTS.map(({ slug, interval }) => ({
      plan: paypalPlanLabel(slug, interval),
      variable: PLAN_CONFIG[slug].paypalPlanEnv[interval],
      planId: paypalPlanId(slug, interval),
    }));
    const report: Record<string, unknown> = {
      environment: paypalIsSandbox() ? "sandbox" : "disabled",
      production: isProduction(),
      clientIdSet: Boolean(String(e.PAYPAL_CLIENT_ID || "").trim()),
      clientSecretSet: Boolean(String(e.PAYPAL_CLIENT_SECRET || "").trim()),
      appUrl: paypalAppUrl(requestOrigin(req)),
      plans: slots.map((slot) => ({ ...slot, foundInPayPal: false, status: null as string | null })),
    };
    try {
      const listing = await paypalApi<{ plans?: Array<{ id: string; status: string }> }>("/v1/billing/plans?page_size=20&total_required=true");
      const remote = new Map((listing.plans || []).map((plan) => [plan.id, String(plan.status || "")]));
      report.paypalAcceptedCredentials = true;
      report.plansListedByPayPal = (listing.plans || []).length;
      report.plans = slots.map((slot) => ({
        ...slot,
        foundInPayPal: Boolean(slot.planId) && remote.has(slot.planId),
        status: slot.planId ? (remote.get(slot.planId) ?? null) : null,
      }));
      const missingInPayPal = (report.plans as Array<{ plan: string; planId: string; foundInPayPal: boolean }>)
        .filter((slot) => slot.planId && !slot.foundInPayPal)
        .map((slot) => slot.plan);
      report.verdict = missingInPayPal.length
        ? `Credentials work, but PayPal does not list the plan(s): ${missingInPayPal.join(", ")}. The plan ids belong to a different PayPal account than the Client ID.`
        : "PayPal accepted the credentials and every configured plan id is listed. The integration is sound — a failure now can only be inside PayPal's own sandbox login.";
    } catch (error) {
      const apiError = error instanceof PayPalApiError ? error : null;
      report.paypalAcceptedCredentials = false;
      report.error = apiError?.code || "PAYPAL_UNREACHABLE";
      report.httpStatus = apiError?.status ?? 502;
      report.verdict = apiError?.code === "PAYPAL_AUTH_FAILED"
        ? "PayPal rejected the Client ID and Client Secret. Replace them in Cloudflare with the ones from the same PayPal app."
        : "PayPal Sandbox could not be reached from this server, or refused the request. See the error code above.";
    }
    res.json(report);
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
      if (user.role === "admin" && isConfiguredOwner(user)) plan = "sceneforge";
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
        source: user.role === "admin" && isConfiguredOwner(user) ? "owner_admin" : grant && grant.planId === plan ? "complimentary" : plan === "free" ? "free" : "verified_subscription",
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
      configuration: { emailProviderConfigured: Boolean(e.EMAIL_PROVIDER && e.EMAIL_PROVIDER !== "console"), paypalConfigured: paypalBillingConfiguration().ready, publicAppUrlConfigured: Boolean(e.PUBLIC_APP_URL), production: isProduction() },

      /* The request origin is passed through so the dashboard's webhook
         candidate and readiness reflect the host the owner is actually
         looking at, not only the configured variable. */
      billing: billingConfiguration(requestOrigin(req)), paypal: paypalBillingConfiguration(requestOrigin(req)), webhookEvents: webhookEvents.reverse(),
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

  /* Site-wide store notice shown on the front pages. Public for reading; only
     the owner administrator may update or toggle it. */
  app.get("/api/store-notice", asyncHandlerVoid(async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ notice: await publicStoreNotice() });
  }));
  app.put("/api/admin/store-notice", requireAdmin, rateLimit("admin-store-notice", 60, 3600000), asyncHandlerVoid(async (req, res) => {
    const { user: admin } = (req as any).auth as Auth;
    const result = sanitizeStoreNotice(req.body);
    if ("error" in result) return res.status(400).json({ error: result.error });
    await db.setSetting(STORE_NOTICE_SETTING_KEY, JSON.stringify({ ...result.notice, updated_at: now(), updated_by: admin.id }));
    res.json({ notice: await publicStoreNotice() });
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
