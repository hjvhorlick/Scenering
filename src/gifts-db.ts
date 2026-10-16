import { env } from "./env";
import { GIFT_CODE_STATUSES, GIFT_SCHEMA_STATEMENTS, type GiftCodeStatus } from "./gifts-schema.ts";

/**
 * Data access for gift codes (see src/gifts-schema.ts), kept beside
 * src/db.ts in the same style as src/inbox-db.ts: plain SQL through the D1
 * binding, ISO-8601 timestamps written by the application, prefixed random
 * ids, and row mappers from snake_case rows to camelCase objects.
 */

export interface GiftCode {
  id: string;
  /** The code as people type it, upper case: "GIFT-7K3M9Q", "WELCOME-OCT". */
  code: string;
  /** The owner's own name for it: "October newsletter". */
  label: string;
  planId: "sceneflow" | "sceneforge";
  /** Gift length (src/lib/gift-lengths.ts). */
  period: string;
  /** How many people may use it; null for no limit. */
  maxUses: number | null;
  /** Only accounts made after the code was. */
  newMembersOnly: boolean;
  status: GiftCodeStatus;
  /** Last moment the code can be used. */
  expiresAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** What happened after people used a code. */
export interface GiftCodeResults {
  /** People who used it. */
  claimed: number;
  /** Of those, accounts made after the code was. */
  newMembers: number;
  /** Still on the gift today. */
  onGift: number;
  /** Downloaded at least one video after using it. */
  madeVideo: number;
  /** Started a paid subscription after using it. */
  thenPaid: number;
}

export interface GiftCodePerson {
  grantId: string;
  userId: string;
  email: string;
  displayName: string;
  joinedAt: string;
  claimedAt: string;
  endsAt: string;
  /** The gift is still running. */
  active: boolean;
  /** Videos downloaded since using the code. */
  videosSince: number;
  thenPaid: boolean;
}

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
const D1 = () => env().DB;

function isStatus(value: unknown): value is GiftCodeStatus {
  return typeof value === "string" && (GIFT_CODE_STATUSES as readonly string[]).includes(value);
}

function rowToGiftCode(row: any): GiftCode {
  return {
    id: row.id,
    code: row.code,
    label: row.label || "",
    planId: row.plan_id === "sceneforge" ? "sceneforge" : "sceneflow",
    period: row.period,
    maxUses: row.max_uses === null || row.max_uses === undefined ? null : Number(row.max_uses),
    newMembersOnly: Number(row.new_members_only) === 1,
    status: isStatus(row.status) ? row.status : "active",
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToResults(row: any): GiftCodeResults {
  return {
    claimed: Number(row.claimed) || 0,
    newMembers: Number(row.new_members) || 0,
    onGift: Number(row.on_gift) || 0,
    madeVideo: Number(row.made_video) || 0,
    thenPaid: Number(row.then_paid) || 0,
  };
}

/** The results columns, as correlated subqueries on gift code `c`. The one
 *  bound parameter is "now" (for gifts still running). */
const RESULT_COLUMNS = `
  (SELECT COUNT(*) FROM complimentary_grants g WHERE g.access_code_id = c.id) AS claimed,
  (SELECT COUNT(*) FROM complimentary_grants g JOIN users u ON u.id = g.user_id WHERE g.access_code_id = c.id AND u.created_at >= c.created_at) AS new_members,
  (SELECT COUNT(*) FROM complimentary_grants g WHERE g.access_code_id = c.id AND g.status = 'active' AND g.ends_at > ?) AS on_gift,
  (SELECT COUNT(DISTINCT g.user_id) FROM complimentary_grants g WHERE g.access_code_id = c.id AND EXISTS (SELECT 1 FROM usage_records r WHERE r.user_id = g.user_id AND r.created_at >= g.created_at)) AS made_video,
  (SELECT COUNT(DISTINCT g.user_id) FROM complimentary_grants g WHERE g.access_code_id = c.id AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = g.user_id AND s.created_at >= g.created_at)) AS then_paid`;

export const giftsDb = {
  newId,

  /** Creates the gift-code table if it is missing (idempotent). */
  async ensureSchema(): Promise<void> {
    const db = D1();
    try {
      await db.batch(GIFT_SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)));
    } catch {
      for (const sql of GIFT_SCHEMA_STATEMENTS) await db.prepare(sql).run();
    }
  },

  /** Inserts a code. Returns null when the code text is already taken. */
  async create(row: Omit<GiftCode, "id" | "status" | "createdAt" | "updatedAt">): Promise<GiftCode | null> {
    const stamp = nowIso();
    const full: GiftCode = { ...row, id: newId("gift"), status: "active", createdAt: stamp, updatedAt: stamp };
    const result = await D1().prepare(
      "INSERT OR IGNORE INTO gift_codes (id, code, label, plan_id, period, max_uses, new_members_only, status, expires_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(full.id, full.code, full.label, full.planId, full.period, full.maxUses, full.newMembersOnly ? 1 : 0, full.status, full.expiresAt, full.createdBy, full.createdAt, full.updatedAt).run();
    return (result.meta?.changes ?? 0) === 1 ? full : null;
  },

  async findByCode(code: string): Promise<GiftCode | null> {
    const row = await D1().prepare("SELECT * FROM gift_codes WHERE code = ?").bind(code).first();
    return row ? rowToGiftCode(row) : null;
  },

  async findById(id: string): Promise<GiftCode | null> {
    const row = await D1().prepare("SELECT * FROM gift_codes WHERE id = ?").bind(id).first();
    return row ? rowToGiftCode(row) : null;
  },

  /** Newest first, each with its results. One query, however many codes. */
  async listWithResults(limit = 200): Promise<Array<GiftCode & { results: GiftCodeResults }>> {
    const result = await D1().prepare(`SELECT c.*, ${RESULT_COLUMNS} FROM gift_codes c ORDER BY c.created_at DESC LIMIT ?`).bind(nowIso(), limit).all();
    return (result.results || []).map((row: any) => ({ ...rowToGiftCode(row), results: rowToResults(row) }));
  },

  async resultsFor(id: string): Promise<GiftCodeResults> {
    const row = await D1().prepare(`SELECT ${RESULT_COLUMNS} FROM gift_codes c WHERE c.id = ?`).bind(nowIso(), id).first();
    return rowToResults(row || {});
  },

  async update(id: string, fields: Partial<Pick<GiftCode, "label" | "maxUses" | "expiresAt" | "status">>): Promise<GiftCode | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (fields.label !== undefined) { sets.push("label = ?"); values.push(fields.label); }
    if (fields.maxUses !== undefined) { sets.push("max_uses = ?"); values.push(fields.maxUses); }
    if (fields.expiresAt !== undefined) { sets.push("expires_at = ?"); values.push(fields.expiresAt); }
    if (fields.status !== undefined) { sets.push("status = ?"); values.push(fields.status); }
    if (sets.length > 0) {
      sets.push("updated_at = ?");
      values.push(nowIso(), id);
      await D1().prepare(`UPDATE gift_codes SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
    }
    return this.findById(id);
  },

  async countClaims(codeId: string): Promise<number> {
    const row = await D1().prepare("SELECT COUNT(*) AS n FROM complimentary_grants WHERE access_code_id = ?").bind(codeId).first();
    return Number((row as any)?.n ?? 0);
  },

  async hasClaimed(codeId: string, userId: string): Promise<boolean> {
    const row = await D1().prepare("SELECT 1 AS found FROM complimentary_grants WHERE access_code_id = ? AND user_id = ? LIMIT 1").bind(codeId, userId).first();
    return Boolean(row);
  },

  /**
   * Gives one person the code's gift, as ONE statement: the grant is only
   * written while the code is active, unexpired, under its use limit and
   * not yet used by this person. Two people racing for the last use can
   * therefore never both get it, and one person can never use a code
   * twice. Returns false (writing nothing) when any condition fails.
   */
  async claim(input: { codeId: string; userId: string; grantId: string; startsAt: string; endsAt: string; reason: string; now: string }): Promise<boolean> {
    const result = await D1().prepare(
      `INSERT INTO complimentary_grants (id, user_id, plan_id, period, status, starts_at, ends_at, granted_by, reason, access_code_id, created_at, revoked_at)
       SELECT ?, ?, c.plan_id, c.period, 'active', ?, ?, c.created_by, ?, c.id, ?, NULL
         FROM gift_codes c
        WHERE c.id = ? AND c.status = 'active' AND c.expires_at > ?
          AND (c.max_uses IS NULL OR (SELECT COUNT(*) FROM complimentary_grants g WHERE g.access_code_id = c.id) < c.max_uses)
          AND NOT EXISTS (SELECT 1 FROM complimentary_grants g WHERE g.access_code_id = c.id AND g.user_id = ?)`
    ).bind(input.grantId, input.userId, input.startsAt, input.endsAt, input.reason, input.now, input.codeId, input.now, input.userId).run();
    return (result.meta?.changes ?? 0) === 1;
  },

  /** A new gift replaces the person's other running gifts (as granting one always has). */
  async revokeOtherActiveGrants(userId: string, keepGrantId: string): Promise<void> {
    await D1().prepare("UPDATE complimentary_grants SET status = 'revoked', revoked_at = ? WHERE user_id = ? AND status = 'active' AND id != ?").bind(nowIso(), userId, keepGrantId).run();
  },

  /** Who used a code, newest first. */
  async people(codeId: string, limit = 500): Promise<GiftCodePerson[]> {
    const now = nowIso();
    const result = await D1().prepare(
      `SELECT g.id AS grant_id, g.user_id, g.created_at AS claimed_at, g.ends_at, g.status, u.email, u.display_name, u.created_at AS joined_at,
              (SELECT COUNT(*) FROM usage_records r WHERE r.user_id = g.user_id AND r.created_at >= g.created_at) AS videos_since,
              EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id = g.user_id AND s.created_at >= g.created_at) AS then_paid
         FROM complimentary_grants g JOIN users u ON u.id = g.user_id
        WHERE g.access_code_id = ?
        ORDER BY g.created_at DESC LIMIT ?`
    ).bind(codeId, limit).all();
    return (result.results || []).map((row: any) => ({
      grantId: String(row.grant_id),
      userId: String(row.user_id),
      email: String(row.email),
      displayName: String(row.display_name || ""),
      joinedAt: String(row.joined_at),
      claimedAt: String(row.claimed_at),
      endsAt: String(row.ends_at),
      active: row.status === "active" && String(row.ends_at) > now,
      videosSince: Number(row.videos_since) || 0,
      thenPaid: Number(row.then_paid) === 1,
    }));
  },

  /** Labels for a set of gift-code ids (a member's gifts show which code they came from). */
  async labelsFor(ids: string[]): Promise<Map<string, { code: string; label: string }>> {
    const wanted = [...new Set(ids.filter((id) => typeof id === "string" && id.startsWith("gift_")))].slice(0, 100);
    if (wanted.length === 0) return new Map();
    const result = await D1().prepare(`SELECT id, code, label FROM gift_codes WHERE id IN (${wanted.map(() => "?").join(", ")})`).bind(...wanted).all();
    return new Map((result.results || []).map((row: any) => [String(row.id), { code: String(row.code), label: String(row.label || "") }]));
  },
};
