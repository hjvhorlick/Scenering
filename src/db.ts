import { env } from "./env";
import type { BillingInterval, ExportCreativeManifest, PlanSlug } from "./config/plans.ts";

export type UserRole = "user" | "admin";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

export type VerificationTokenType = "verify" | "reset";
export interface VerificationToken {
  id: string;
  userId: string;
  token: string;
  type: VerificationTokenType;
  expiresAt: string;
  createdAt: string;
}

export type MembershipStatus = "active" | "inactive";
export interface Membership {
  id: string;
  userId: string;
  plan: PlanSlug;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  provider: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  providerProductId: string | null;
  providerVariantId: string | null;
  planId: PlanSlug;
  billingInterval: BillingInterval;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  expiresAt: string | null;
  customerPortalUrl: string | null;
  updatePaymentUrl: string | null;
  cardBrand: string | null;
  cardLastFour: string | null;
  renewalPrice: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UsageRecord {
  id: string;
  userId: string;
  kind: "final_export";
  durationMinutes: number;
  format: "short" | "long" | null;
  projectId: string | null;
  reservationId: string | null;
  createdAt: string;
}

export type ExportReservationStatus = "reserved" | "completed" | "cancelled";
export interface ExportReservation {
  id: string;
  userId: string;
  projectId: string;
  durationMinutes: number;
  format: "short" | "long";
  creativeManifest: ExportCreativeManifest | null;
  status: ExportReservationStatus;
  expiresAt: string;
  createdAt: string;
  completedAt: string | null;
}

export type ComplimentaryGrantStatus = "active" | "revoked" | "expired";
export interface ComplimentaryGrant {
  id: string;
  userId: string;
  planId: Exclude<PlanSlug, "free">;
  period: "month" | "year";
  status: ComplimentaryGrantStatus;
  startsAt: string;
  endsAt: string;
  grantedBy: string;
  reason: string | null;
  accessCodeId: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export type ComplimentaryCodeStatus = "active" | "redeemed" | "revoked" | "expired";
export interface ComplimentaryCode {
  id: string;
  codeHash: string;
  codePrefix: string;
  planId: Exclude<PlanSlug, "free">;
  period: "month" | "year";
  status: ComplimentaryCodeStatus;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
  redeemedBy: string | null;
  redeemedAt: string | null;
}

export interface WebhookEvent {
  id: string;
  providerEventId: string;
  eventName: string;
  status: string;
  payload: unknown;
  createdAt: string;
}

export interface BillingEvent {
  id: string;
  userId: string | null;
  subscriptionId: string | null;
  eventName: string;
  fromProvider: boolean;
  extra: Record<string, unknown> | null;
  createdAt: string;
}

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  createdAt: string;
}

export interface EmailPreference {
  userId: string;
  marketingConsent: boolean;
  consentTimestamp: string;
  consentSource: string;
  consentVersion: string;
  trainingStep: number;
  updatedAt: string;
}

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;

/**
 * "Now" as a bound parameter, for every timestamp comparison in this file.
 *
 * Why not SQLite's `datetime('now')`: that function formats time as
 * `YYYY-MM-DD HH:MM:SS`, while every timestamp this app writes is a full
 * ISO-8601 string from `toISOString()` (`YYYY-MM-DDTHH:MM:SS.sssZ`). Text
 * comparison between the two formats is only correct while the dates differ —
 * on the same UTC day the ISO string's `T` (0x54) sorts after the space
 * (0x20), so e.g. a one-hour password-reset token created at 10:00 still
 * compared as "not expired" at 23:59. Comparing like with like — an ISO
 * string bound from UTC "now" against the stored ISO strings — is
 * chronologically exact, and is also one less function call inside SQLite.
 */
const nowSql = () => nowIso();

function jsonOrNull(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}
function parseJson<T>(value: unknown): T | null {
  if (typeof value !== "string" || !value) return null;
  try { return JSON.parse(value) as T; } catch { return null; }
}

function rowToUser(row: any): User {
  return {
    id: row.id, email: row.email, passwordHash: row.password_hash, displayName: row.display_name,
    role: row.role, isVerified: row.is_verified === 1, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function rowToSession(row: any): Session {
  return { id: row.id, userId: row.user_id, token: row.token, expiresAt: row.expires_at, createdAt: row.created_at };
}
function rowToVerificationToken(row: any): VerificationToken {
  return { id: row.id, userId: row.user_id, token: row.token, type: row.type, expiresAt: row.expires_at, createdAt: row.created_at };
}
function rowToMembership(row: any): Membership {
  return { id: row.id, userId: row.user_id, plan: row.plan, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}
function rowToSubscription(row: any): Subscription {
  return {
    id: row.id, userId: row.user_id, provider: row.provider, providerCustomerId: row.provider_customer_id,
    providerSubscriptionId: row.provider_subscription_id, providerProductId: row.provider_product_id,
    providerVariantId: row.provider_variant_id, planId: row.plan_id, billingInterval: row.billing_interval,
    status: row.status, currentPeriodStart: row.current_period_start, currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end === 1, cancelledAt: row.cancelled_at, expiresAt: row.expires_at,
    customerPortalUrl: row.customer_portal_url, updatePaymentUrl: row.update_payment_url, cardBrand: row.card_brand,
    cardLastFour: row.card_last_four, renewalPrice: row.renewal_price, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function rowToUsage(row: any): UsageRecord {
  return {
    id: row.id, userId: row.user_id, kind: row.kind, durationMinutes: row.duration_minutes, format: row.format,
    projectId: row.project_id, reservationId: row.reservation_id, createdAt: row.created_at,
  };
}
function rowToExportReservation(row: any): ExportReservation {
  return {
    id: row.id, userId: row.user_id, projectId: row.project_id, durationMinutes: row.duration_minutes, format: row.format,
    creativeManifest: parseJson<ExportCreativeManifest>(row.creative_manifest), status: row.status, expiresAt: row.expires_at,
    createdAt: row.created_at, completedAt: row.completed_at,
  };
}
function rowToComplimentaryGrant(row: any): ComplimentaryGrant {
  return {
    id: row.id, userId: row.user_id, planId: row.plan_id, period: row.period, status: row.status, startsAt: row.starts_at,
    endsAt: row.ends_at, grantedBy: row.granted_by, reason: row.reason, accessCodeId: row.access_code_id,
    createdAt: row.created_at, revokedAt: row.revoked_at,
  };
}
function rowToComplimentaryCode(row: any): ComplimentaryCode {
  return {
    id: row.id, codeHash: row.code_hash, codePrefix: row.code_prefix, planId: row.plan_id, period: row.period,
    status: row.status, expiresAt: row.expires_at, createdBy: row.created_by, createdAt: row.created_at,
    redeemedBy: row.redeemed_by, redeemedAt: row.redeemed_at,
  };
}
function rowToWebhookEvent(row: any): WebhookEvent {
  return { id: row.id, providerEventId: row.provider_event_id, eventName: row.event_name, status: row.status, payload: parseJson(row.payload), createdAt: row.created_at };
}
function rowToBillingEvent(row: any): BillingEvent {
  return { id: row.id, userId: row.user_id, subscriptionId: row.subscription_id, eventName: row.event_name, fromProvider: row.from_provider === 1, extra: parseJson(row.extra), createdAt: row.created_at };
}
function rowToContact(row: any): ContactSubmission {
  return { id: row.id, name: row.name, email: row.email, subject: row.subject, message: row.message, category: row.category, status: row.status, createdAt: row.created_at };
}
function rowToEmailPreference(row: any): EmailPreference {
  return { userId: row.user_id, marketingConsent: row.marketing_consent === 1, consentTimestamp: row.consent_timestamp, consentSource: row.consent_source, consentVersion: row.consent_version, trainingStep: row.training_step, updatedAt: row.updated_at };
}

export const db = {
  newId,
  now: nowIso,

  // --- users ---
  async findUserByEmail(email: string): Promise<User | null> {
    const row = await env().DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    return row ? rowToUser(row) : null;
  },
  async findUserById(id: string): Promise<User | null> {
    const row = await env().DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
    return row ? rowToUser(row) : null;
  },
  async createUser(user: Omit<User, "createdAt" | "updatedAt"> & { createdAt?: string; updatedAt?: string }): Promise<User> {
    const stamp = nowIso();
    const row: User = { createdAt: stamp, updatedAt: stamp, ...user };
    await env().DB.prepare(
      "INSERT INTO users (id, email, password_hash, display_name, role, is_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(row.id, row.email, row.passwordHash, row.displayName, row.role, row.isVerified ? 1 : 0, row.createdAt, row.updatedAt).run();
    return row;
  },
  async updateUser(id: string, updates: Partial<Pick<User, "email" | "passwordHash" | "displayName" | "role" | "isVerified">>): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [];
    if (updates.email !== undefined) { setClauses.push("email = ?"); values.push(updates.email); }
    if (updates.passwordHash !== undefined) { setClauses.push("password_hash = ?"); values.push(updates.passwordHash); }
    if (updates.displayName !== undefined) { setClauses.push("display_name = ?"); values.push(updates.displayName); }
    if (updates.role !== undefined) { setClauses.push("role = ?"); values.push(updates.role); }
    if (updates.isVerified !== undefined) { setClauses.push("is_verified = ?"); values.push(updates.isVerified ? 1 : 0); }
    if (setClauses.length === 0) return;
    setClauses.push("updated_at = ?"); values.push(nowIso());
    values.push(id);
    await env().DB.prepare(`UPDATE users SET ${setClauses.join(", ")} WHERE id = ?`).bind(...values).run();
  },
  async listUsers(): Promise<User[]> {
    const result = await env().DB.prepare("SELECT * FROM users ORDER BY created_at ASC").all();
    return (result.results || []).map(rowToUser);
  },

  // --- sessions ---
  async findSessionByToken(tokenHash: string): Promise<Session | null> {
    const row = await env().DB.prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > ?").bind(tokenHash, nowSql()).first();
    return row ? rowToSession(row) : null;
  },
  async createSession(userId: string, tokenHash: string, expiresAt: string): Promise<Session> {
    const row: Session = { id: newId("sess"), userId, token: tokenHash, expiresAt, createdAt: nowIso() };
    await env().DB.prepare("INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(row.id, row.userId, row.token, row.expiresAt, row.createdAt).run();
    return row;
  },
  async deleteSessionByToken(tokenHash: string): Promise<void> {
    await env().DB.prepare("DELETE FROM sessions WHERE token = ?").bind(tokenHash).run();
  },
  async deleteSessionsForUser(userId: string): Promise<void> {
    await env().DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
  },
  async deleteExpiredSessions(): Promise<void> {
    await env().DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(nowSql()).run();
  },

  // --- verification / reset tokens ---
  async createVerificationToken(userId: string, tokenHash: string, type: VerificationTokenType, expiresAt: string): Promise<VerificationToken> {
    const row: VerificationToken = { id: newId("vtok"), userId, token: tokenHash, type, expiresAt, createdAt: nowIso() };
    await env().DB.prepare("INSERT INTO verification_tokens (id, user_id, token, type, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(row.id, row.userId, row.token, row.type, row.expiresAt, row.createdAt).run();
    return row;
  },
  async findVerificationToken(tokenHash: string, type: VerificationTokenType): Promise<VerificationToken | null> {
    const row = await env().DB.prepare("SELECT * FROM verification_tokens WHERE token = ? AND type = ? AND expires_at > ?").bind(tokenHash, type, nowSql()).first();
    return row ? rowToVerificationToken(row) : null;
  },
  async deleteVerificationToken(id: string): Promise<void> {
    await env().DB.prepare("DELETE FROM verification_tokens WHERE id = ?").bind(id).run();
  },
  async deleteVerificationTokensForUser(userId: string, type?: VerificationTokenType): Promise<void> {
    if (type) await env().DB.prepare("DELETE FROM verification_tokens WHERE user_id = ? AND type = ?").bind(userId, type).run();
    else await env().DB.prepare("DELETE FROM verification_tokens WHERE user_id = ?").bind(userId).run();
  },

  // --- memberships ---
  async findMembershipByUserId(userId: string): Promise<Membership | null> {
    const row = await env().DB.prepare("SELECT * FROM memberships WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1").bind(userId).first();
    return row ? rowToMembership(row) : null;
  },
  /** Every active membership, newest first — the bulk-read counterpart of
   *  findMembershipByUserId for endpoints that need all users at once
   *  (the admin overview). Building the same per-user "latest row" mapping
   *  in memory turns N+1 D1 round trips (each a subrequest against the
   *  Worker limit) into one. */
  async listActiveMemberships(): Promise<Membership[]> {
    const result = await env().DB.prepare("SELECT * FROM memberships WHERE status = 'active' ORDER BY created_at DESC").all();
    return (result.results || []).map(rowToMembership);
  },
  async createMembership(userId: string, plan: PlanSlug, status: MembershipStatus = "active"): Promise<Membership> {
    const stamp = nowIso();
    const row: Membership = { id: newId("mem"), userId, plan, status, createdAt: stamp, updatedAt: stamp };
    await env().DB.prepare("INSERT INTO memberships (id, user_id, plan, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(row.id, row.userId, row.plan, row.status, row.createdAt, row.updatedAt).run();
    return row;
  },
  async updateMembership(id: string, updates: Partial<Pick<Membership, "plan" | "status">>): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [];
    if (updates.plan !== undefined) { setClauses.push("plan = ?"); values.push(updates.plan); }
    if (updates.status !== undefined) { setClauses.push("status = ?"); values.push(updates.status); }
    if (setClauses.length === 0) return;
    setClauses.push("updated_at = ?"); values.push(nowIso());
    values.push(id);
    await env().DB.prepare(`UPDATE memberships SET ${setClauses.join(", ")} WHERE id = ?`).bind(...values).run();
  },

  // --- subscriptions ---
  async findActiveSubscriptionByUserId(userId: string): Promise<Subscription | null> {
    const row = await env().DB.prepare("SELECT * FROM subscriptions WHERE user_id = ? AND status != 'expired' ORDER BY created_at DESC LIMIT 1").bind(userId).first();
    return row ? rowToSubscription(row) : null;
  },
  /** Bulk counterpart of findActiveSubscriptionByUserId (see
   *  listActiveMemberships for why): all non-expired subscriptions, newest
   *  first — take the first row per user_id for the same result. */
  async listNonExpiredSubscriptions(): Promise<Subscription[]> {
    const result = await env().DB.prepare("SELECT * FROM subscriptions WHERE status != 'expired' ORDER BY created_at DESC").all();
    return (result.results || []).map(rowToSubscription);
  },
  async findSubscriptionByProviderId(providerSubscriptionId: string): Promise<Subscription | null> {
    const row = await env().DB.prepare("SELECT * FROM subscriptions WHERE provider_subscription_id = ?").bind(providerSubscriptionId).first();
    return row ? rowToSubscription(row) : null;
  },
  async listExpirableSubscriptions(): Promise<Subscription[]> {
    const result = await env().DB.prepare("SELECT * FROM subscriptions WHERE status NOT IN ('expired', 'active', 'on_trial')").all();
    return (result.results || []).map(rowToSubscription);
  },
  async createSubscription(sub: Omit<Subscription, "createdAt" | "updatedAt">): Promise<Subscription> {
    const stamp = nowIso();
    const row: Subscription = { ...sub, createdAt: stamp, updatedAt: stamp };
    await env().DB.prepare(
      `INSERT INTO subscriptions (id, user_id, provider, provider_customer_id, provider_subscription_id, provider_product_id, provider_variant_id, plan_id, billing_interval, status, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, expires_at, customer_portal_url, update_payment_url, card_brand, card_last_four, renewal_price, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      row.id, row.userId, row.provider, row.providerCustomerId, row.providerSubscriptionId, row.providerProductId, row.providerVariantId,
      row.planId, row.billingInterval, row.status, row.currentPeriodStart, row.currentPeriodEnd, row.cancelAtPeriodEnd ? 1 : 0, row.cancelledAt,
      row.expiresAt, row.customerPortalUrl, row.updatePaymentUrl, row.cardBrand, row.cardLastFour, row.renewalPrice, row.createdAt, row.updatedAt
    ).run();
    return row;
  },
  async updateSubscription(id: string, updates: Partial<Omit<Subscription, "id" | "userId" | "createdAt">>): Promise<void> {
    const map: Record<string, string> = {
      provider: "provider", providerCustomerId: "provider_customer_id", providerSubscriptionId: "provider_subscription_id",
      providerProductId: "provider_product_id", providerVariantId: "provider_variant_id", planId: "plan_id",
      billingInterval: "billing_interval", status: "status", currentPeriodStart: "current_period_start",
      currentPeriodEnd: "current_period_end", cancelAtPeriodEnd: "cancel_at_period_end", cancelledAt: "cancelled_at",
      expiresAt: "expires_at", customerPortalUrl: "customer_portal_url", updatePaymentUrl: "update_payment_url",
      cardBrand: "card_brand", cardLastFour: "card_last_four", renewalPrice: "renewal_price",
    };
    const setClauses: string[] = [];
    const values: any[] = [];
    for (const [key, column] of Object.entries(map)) {
      if (!(key in updates)) continue;
      const value = (updates as any)[key];
      setClauses.push(`${column} = ?`);
      values.push(key === "cancelAtPeriodEnd" ? (value ? 1 : 0) : value);
    }
    if (setClauses.length === 0) return;
    setClauses.push("updated_at = ?"); values.push(nowIso());
    values.push(id);
    await env().DB.prepare(`UPDATE subscriptions SET ${setClauses.join(", ")} WHERE id = ?`).bind(...values).run();
  },

  // --- usage records ---
  async listUsageSince(userId: string, sinceIso: string): Promise<UsageRecord[]> {
    const result = await env().DB.prepare("SELECT * FROM usage_records WHERE user_id = ? AND created_at >= ?").bind(userId, sinceIso).all();
    return (result.results || []).map(rowToUsage);
  },
  /** Bulk counterpart of listUsageSince across all users (see
   *  listActiveMemberships for why). */
  async listAllUsageSince(sinceIso: string): Promise<UsageRecord[]> {
    const result = await env().DB.prepare("SELECT * FROM usage_records WHERE created_at >= ?").bind(sinceIso).all();
    return (result.results || []).map(rowToUsage);
  },
  async createUsageRecord(record: Omit<UsageRecord, "id" | "createdAt">): Promise<UsageRecord> {
    const row: UsageRecord = { ...record, id: newId("use"), createdAt: nowIso() };
    await env().DB.prepare("INSERT INTO usage_records (id, user_id, kind, duration_minutes, format, project_id, reservation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(row.id, row.userId, row.kind, row.durationMinutes, row.format, row.projectId, row.reservationId, row.createdAt).run();
    return row;
  },

  // --- export reservations ---
  async listReservedSince(userId: string, sinceIso: string): Promise<ExportReservation[]> {
    const result = await env().DB.prepare("SELECT * FROM export_reservations WHERE user_id = ? AND status = 'reserved' AND created_at >= ?").bind(userId, sinceIso).all();
    return (result.results || []).map(rowToExportReservation);
  },
  async createExportReservation(row: Omit<ExportReservation, "id" | "createdAt" | "completedAt" | "status"> & { status?: ExportReservationStatus }): Promise<ExportReservation> {
    const full: ExportReservation = { ...row, id: newId("export"), status: row.status || "reserved", createdAt: nowIso(), completedAt: null };
    await env().DB.prepare("INSERT INTO export_reservations (id, user_id, project_id, duration_minutes, format, creative_manifest, status, expires_at, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(full.id, full.userId, full.projectId, full.durationMinutes, full.format, jsonOrNull(full.creativeManifest), full.status, full.expiresAt, full.createdAt, full.completedAt).run();
    return full;
  },
  async findExportReservation(id: string, userId: string): Promise<ExportReservation | null> {
    const row = await env().DB.prepare("SELECT * FROM export_reservations WHERE id = ? AND user_id = ?").bind(id, userId).first();
    return row ? rowToExportReservation(row) : null;
  },
  async completeExportReservation(id: string): Promise<void> {
    await env().DB.prepare("UPDATE export_reservations SET status = 'completed', completed_at = ? WHERE id = ?").bind(nowIso(), id).run();
  },
  async cancelExportReservation(id: string): Promise<void> {
    await env().DB.prepare("UPDATE export_reservations SET status = 'cancelled' WHERE id = ? AND status = 'reserved'").bind(id).run();
  },
  async expireStaleReservations(): Promise<void> {
    await env().DB.prepare("UPDATE export_reservations SET status = 'cancelled' WHERE status = 'reserved' AND expires_at <= ?").bind(nowSql()).run();
  },

  // --- complimentary grants ---
  async findActiveComplimentaryGrant(userId: string): Promise<ComplimentaryGrant | null> {
    const row = await env().DB.prepare("SELECT * FROM complimentary_grants WHERE user_id = ? AND status = 'active' AND ends_at > ? ORDER BY ends_at DESC LIMIT 1").bind(userId, nowSql()).first();
    return row ? rowToComplimentaryGrant(row) : null;
  },
  /** Bulk counterpart of findActiveComplimentaryGrant (see
   *  listActiveMemberships for why): every active, unexpired grant, latest
   *  end date first — take the first row per user_id for the same result. */
  async listActiveComplimentaryGrants(): Promise<ComplimentaryGrant[]> {
    const result = await env().DB.prepare("SELECT * FROM complimentary_grants WHERE status = 'active' AND ends_at > ? ORDER BY ends_at DESC").bind(nowSql()).all();
    return (result.results || []).map(rowToComplimentaryGrant);
  },
  async revokeActiveComplimentaryGrantsForUser(userId: string): Promise<void> {
    await env().DB.prepare("UPDATE complimentary_grants SET status = 'revoked', revoked_at = ? WHERE user_id = ? AND status = 'active'").bind(nowIso(), userId).run();
  },
  async createComplimentaryGrant(row: Omit<ComplimentaryGrant, "id" | "createdAt" | "revokedAt" | "status"> & { status?: ComplimentaryGrantStatus }): Promise<ComplimentaryGrant> {
    const full: ComplimentaryGrant = { ...row, id: newId("grant"), status: row.status || "active", createdAt: nowIso(), revokedAt: null };
    await env().DB.prepare("INSERT INTO complimentary_grants (id, user_id, plan_id, period, status, starts_at, ends_at, granted_by, reason, access_code_id, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(full.id, full.userId, full.planId, full.period, full.status, full.startsAt, full.endsAt, full.grantedBy, full.reason, full.accessCodeId, full.createdAt, full.revokedAt).run();
    return full;
  },
  async findComplimentaryGrantById(id: string): Promise<ComplimentaryGrant | null> {
    const row = await env().DB.prepare("SELECT * FROM complimentary_grants WHERE id = ?").bind(id).first();
    return row ? rowToComplimentaryGrant(row) : null;
  },
  async revokeComplimentaryGrant(id: string): Promise<void> {
    await env().DB.prepare("UPDATE complimentary_grants SET status = 'revoked', revoked_at = ? WHERE id = ? AND status = 'active'").bind(nowIso(), id).run();
  },
  async expireStaleComplimentaryGrants(): Promise<void> {
    await env().DB.prepare("UPDATE complimentary_grants SET status = 'expired' WHERE status = 'active' AND ends_at <= ?").bind(nowSql()).run();
  },

  // --- complimentary codes ---
  async createComplimentaryCode(row: Omit<ComplimentaryCode, "id" | "createdAt" | "redeemedBy" | "redeemedAt" | "status"> & { status?: ComplimentaryCodeStatus }): Promise<ComplimentaryCode> {
    const full: ComplimentaryCode = { ...row, id: newId("code"), status: row.status || "active", createdAt: nowIso(), redeemedBy: null, redeemedAt: null };
    await env().DB.prepare("INSERT INTO complimentary_codes (id, code_hash, code_prefix, plan_id, period, status, expires_at, created_by, created_at, redeemed_by, redeemed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(full.id, full.codeHash, full.codePrefix, full.planId, full.period, full.status, full.expiresAt, full.createdBy, full.createdAt, full.redeemedBy, full.redeemedAt).run();
    return full;
  },
  async findActiveComplimentaryCodeByHash(codeHash: string): Promise<ComplimentaryCode | null> {
    const row = await env().DB.prepare("SELECT * FROM complimentary_codes WHERE code_hash = ? AND status = 'active' AND expires_at > ?").bind(codeHash, nowSql()).first();
    return row ? rowToComplimentaryCode(row) : null;
  },
  async redeemComplimentaryCode(id: string, userId: string): Promise<void> {
    await env().DB.prepare("UPDATE complimentary_codes SET status = 'redeemed', redeemed_by = ?, redeemed_at = ? WHERE id = ?").bind(userId, nowIso(), id).run();
  },
  async revokeComplimentaryCode(id: string): Promise<boolean> {
    const result = await env().DB.prepare("UPDATE complimentary_codes SET status = 'revoked' WHERE id = ? AND status = 'active'").bind(id).run();
    return (result.meta?.changes ?? 0) > 0;
  },
  async listRecentComplimentaryCodes(limit = 100): Promise<ComplimentaryCode[]> {
    const result = await env().DB.prepare("SELECT * FROM complimentary_codes ORDER BY created_at DESC LIMIT ?").bind(limit).all();
    return (result.results || []).map(rowToComplimentaryCode);
  },
  async expireStaleComplimentaryCodes(): Promise<void> {
    await env().DB.prepare("UPDATE complimentary_codes SET status = 'expired' WHERE status = 'active' AND expires_at <= ?").bind(nowSql()).run();
  },

  // --- webhook / billing event logs ---
  async webhookEventExists(providerEventId: string): Promise<boolean> {
    const row = await env().DB.prepare("SELECT id FROM webhook_events WHERE provider_event_id = ?").bind(providerEventId).first();
    return Boolean(row);
  },
  async recordWebhookEvent(row: Omit<WebhookEvent, "id" | "createdAt">): Promise<void> {
    await env().DB.prepare("INSERT INTO webhook_events (id, provider_event_id, event_name, status, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(newId("wh"), row.providerEventId, row.eventName, row.status, jsonOrNull(row.payload), nowIso()).run();
  },
  /** Marks on the original event's row that a redelivery arrived (Lemon
   *  Squeezy retries, and the owner's webhook log should show it) without
   *  creating a second row for the same provider event id — the column is
   *  UNIQUE, and the original outcome must stay visible. */
  async markWebhookEventDuplicate(providerEventId: string): Promise<void> {
    await env().DB.prepare(
      "UPDATE webhook_events SET payload = json_set(payload, '$.duplicate_count', coalesce(json_extract(payload, '$.duplicate_count'), 0) + 1, '$.last_duplicate_at', ?) WHERE provider_event_id = ?"
    ).bind(nowIso(), providerEventId).run();
  },
  async listRecentWebhookEvents(limit = 25): Promise<WebhookEvent[]> {
    const result = await env().DB.prepare("SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT ?").bind(limit).all();
    return (result.results || []).map(rowToWebhookEvent);
  },
  async recordBillingEvent(row: Omit<BillingEvent, "id" | "createdAt">): Promise<void> {
    await env().DB.prepare("INSERT INTO billing_events (id, user_id, subscription_id, event_name, from_provider, extra, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(newId("bill"), row.userId, row.subscriptionId, row.eventName, row.fromProvider ? 1 : 0, jsonOrNull(row.extra), nowIso()).run();
  },

  // --- contact submissions ---
  async createContactSubmission(row: Omit<ContactSubmission, "id" | "createdAt" | "status"> & { status?: string }): Promise<ContactSubmission> {
    const full: ContactSubmission = { ...row, id: newId("contact"), status: row.status || "new", createdAt: nowIso() };
    await env().DB.prepare("INSERT INTO contact_submissions (id, name, email, subject, message, category, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(full.id, full.name, full.email, full.subject, full.message, full.category, full.status, full.createdAt).run();
    return full;
  },
  async listRecentContactSubmissions(limit = 200): Promise<ContactSubmission[]> {
    const result = await env().DB.prepare("SELECT * FROM contact_submissions ORDER BY created_at DESC LIMIT ?").bind(limit).all();
    return (result.results || []).map(rowToContact);
  },
  async updateContactStatus(id: string, status: string): Promise<ContactSubmission | null> {
    await env().DB.prepare("UPDATE contact_submissions SET status = ? WHERE id = ?").bind(status, id).run();
    const row = await env().DB.prepare("SELECT * FROM contact_submissions WHERE id = ?").bind(id).first();
    return row ? rowToContact(row) : null;
  },

  // --- email preferences ---
  async findEmailPreference(userId: string): Promise<EmailPreference | null> {
    const row = await env().DB.prepare("SELECT * FROM email_preferences WHERE user_id = ?").bind(userId).first();
    return row ? rowToEmailPreference(row) : null;
  },
  /** Bulk counterpart of findEmailPreference (see listActiveMemberships). */
  async listEmailPreferences(): Promise<EmailPreference[]> {
    const result = await env().DB.prepare("SELECT * FROM email_preferences").all();
    return (result.results || []).map(rowToEmailPreference);
  },
  async upsertEmailPreference(row: EmailPreference): Promise<EmailPreference> {
    await env().DB.prepare(
      `INSERT INTO email_preferences (user_id, marketing_consent, consent_timestamp, consent_source, consent_version, training_step, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET marketing_consent = excluded.marketing_consent, consent_timestamp = excluded.consent_timestamp,
         consent_source = excluded.consent_source, consent_version = excluded.consent_version, training_step = excluded.training_step, updated_at = excluded.updated_at`
    ).bind(row.userId, row.marketingConsent ? 1 : 0, row.consentTimestamp, row.consentSource, row.consentVersion, row.trainingStep, row.updatedAt).run();
    return row;
  },

  // --- admin settings (generic key/value; used for e.g. social links) ---
  async getSetting(key: string): Promise<string | null> {
    const row = await env().DB.prepare("SELECT value FROM admin_settings WHERE key = ?").bind(key).first();
    return (row as any)?.value ?? null;
  },
  async setSetting(key: string, value: string): Promise<void> {
    await env().DB.prepare(
      "INSERT INTO admin_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    ).bind(key, value, nowIso()).run();
  },
};
