import { env } from "./env";

/**
 * Read-only queries behind the Email Centre's Members tab: who has joined,
 * what plan each member is on and why, whether they make videos, and what
 * Scenering has sent them. Administrators are never listed.
 *
 * Every list is one bounded query (correlated subqueries per row, LIMIT and
 * OFFSET for paging), so the cost stays fixed however many members there
 * are, within the Workers subrequest limit.
 */

export const MEMBER_FILTERS = ["all", "free", "paying", "gift", "new", "no_video", "quiet", "unconfirmed"] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];
export const MEMBER_SORTS = ["newest", "videos", "active"] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];

/** "Joined recently" and "quiet" both look back this many days. */
export const MEMBER_WINDOW_DAYS = 30;

export interface MemberRow {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  verified: boolean;
  marketingConsent: boolean;
  /** Plan of the active paid membership, if any. */
  paidPlan: "sceneflow" | "sceneforge" | null;
  /** Running gift, if any. */
  giftPlan: "sceneflow" | "sceneforge" | null;
  giftEndsAt: string | null;
  /** Videos downloaded (and older rendered exports), ever. */
  videos: number;
  lastVideoAt: string | null;
}

export interface MemberActivity {
  videos: number;
  thisWeek: number;
  shorts: number;
  long: number;
  firstVideoAt: string | null;
  lastVideoAt: string | null;
}

export interface MemberGrant {
  id: string;
  planId: string;
  period: string;
  status: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  accessCodeId: string | null;
  createdAt: string;
}

export interface MemberDelivery {
  id: string;
  campaignId: string;
  campaignName: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
}

export interface MemberThread {
  id: string;
  subject: string;
  status: string;
  lastMessageAt: string;
  lastDirection: string;
}

const D1 = () => env().DB;

const PAID = "EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.status = 'active' AND m.plan != 'free')";
const GIFT = "EXISTS (SELECT 1 FROM complimentary_grants g WHERE g.user_id = u.id AND g.status = 'active' AND g.ends_at > ?)";
/** Any finished video: downloads since metering, final_export rows from before. */
const ANY_VIDEO = "EXISTS (SELECT 1 FROM usage_records r WHERE r.user_id = u.id)";

export function isMemberFilter(value: unknown): value is MemberFilter {
  return typeof value === "string" && (MEMBER_FILTERS as readonly string[]).includes(value);
}
export function isMemberSort(value: unknown): value is MemberSort {
  return typeof value === "string" && (MEMBER_SORTS as readonly string[]).includes(value);
}

/** The SQL condition for one filter over `users u`, with its parameters. */
export function memberFilterCondition(filter: MemberFilter, now: Date): { sql: string; params: unknown[] } {
  const nowIso = now.toISOString();
  const windowStart = new Date(now.getTime() - MEMBER_WINDOW_DAYS * 86400000).toISOString();
  switch (filter) {
    case "free": return { sql: `(NOT ${PAID} AND NOT ${GIFT})`, params: [nowIso] };
    case "paying": return { sql: PAID, params: [] };
    case "gift": return { sql: GIFT, params: [nowIso] };
    case "new": return { sql: "u.created_at >= ?", params: [windowStart] };
    case "no_video": return { sql: `NOT ${ANY_VIDEO}`, params: [] };
    // Joined before the window (so new members are not "quiet"), no video in it:
    // the same rule as the Email Centre's "inactive" audience.
    case "quiet": return { sql: "(u.created_at <= ? AND NOT EXISTS (SELECT 1 FROM usage_records r WHERE r.user_id = u.id AND r.created_at >= ?))", params: [windowStart, windowStart] };
    case "unconfirmed": return { sql: "u.is_verified = 0", params: [] };
    default: return { sql: "1 = 1", params: [] };
  }
}

/** LIKE pattern with the user's wildcard characters escaped. */
function likePattern(query: string): string {
  return `%${String(query).replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

function planOrNull(value: unknown): "sceneflow" | "sceneforge" | null {
  return value === "sceneflow" || value === "sceneforge" ? value : null;
}

function rowToMember(row: any): MemberRow {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name || ""),
    createdAt: String(row.created_at),
    verified: Number(row.is_verified) === 1,
    marketingConsent: Number(row.consent) === 1,
    paidPlan: planOrNull(row.paid_plan),
    giftPlan: planOrNull(row.gift_plan),
    giftEndsAt: row.gift_ends_at ? String(row.gift_ends_at) : null,
    videos: Number(row.videos) || 0,
    lastVideoAt: row.last_video_at ? String(row.last_video_at) : null,
  };
}

const ORDER: Record<MemberSort, string> = {
  newest: "u.created_at DESC",
  videos: "videos DESC, u.created_at DESC",
  active: "last_video_at IS NULL, last_video_at DESC, u.created_at DESC",
};

export const membersDb = {
  async list(options: { filter: MemberFilter; query: string; sort: MemberSort; limit: number; offset: number; now?: Date }): Promise<MemberRow[]> {
    const now = options.now || new Date();
    const nowIso = now.toISOString();
    const where: string[] = ["u.role != 'admin'"];
    const params: unknown[] = [nowIso, nowIso];
    const condition = memberFilterCondition(options.filter, now);
    where.push(condition.sql);
    params.push(...condition.params);
    const query = String(options.query || "").trim().slice(0, 100);
    if (query) {
      where.push("(u.email LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')");
      params.push(likePattern(query), likePattern(query));
    }
    params.push(Math.max(1, Math.min(200, options.limit)), Math.max(0, options.offset));
    const result = await D1().prepare(
      `SELECT u.id, u.email, u.display_name, u.created_at, u.is_verified,
              COALESCE(p.marketing_consent, 0) AS consent,
              (SELECT m.plan FROM memberships m WHERE m.user_id = u.id AND m.status = 'active' ORDER BY m.created_at DESC LIMIT 1) AS paid_plan,
              (SELECT g.plan_id FROM complimentary_grants g WHERE g.user_id = u.id AND g.status = 'active' AND g.ends_at > ? ORDER BY g.ends_at DESC LIMIT 1) AS gift_plan,
              (SELECT g.ends_at FROM complimentary_grants g WHERE g.user_id = u.id AND g.status = 'active' AND g.ends_at > ? ORDER BY g.ends_at DESC LIMIT 1) AS gift_ends_at,
              (SELECT COUNT(*) FROM usage_records r WHERE r.user_id = u.id) AS videos,
              (SELECT MAX(r.created_at) FROM usage_records r WHERE r.user_id = u.id) AS last_video_at
         FROM users u LEFT JOIN email_preferences p ON p.user_id = u.id
        WHERE ${where.join(" AND ")}
        ORDER BY ${ORDER[options.sort] || ORDER.newest}
        LIMIT ? OFFSET ?`
    ).bind(...params).all();
    return (result.results || []).map(rowToMember);
  },

  /** How many members each filter holds (search ignored). One query. */
  async counts(now: Date = new Date()): Promise<Record<MemberFilter, number>> {
    const columns: string[] = [];
    const params: unknown[] = [];
    for (const filter of MEMBER_FILTERS) {
      const condition = memberFilterCondition(filter, now);
      columns.push(`COALESCE(SUM(CASE WHEN ${condition.sql} THEN 1 ELSE 0 END), 0) AS "${filter}"`);
      params.push(...condition.params);
    }
    const row = (await D1().prepare(`SELECT ${columns.join(", ")} FROM users u WHERE u.role != 'admin'`).bind(...params).first()) as any;
    return Object.fromEntries(MEMBER_FILTERS.map((filter) => [filter, Number(row?.[filter] ?? 0)])) as Record<MemberFilter, number>;
  },

  async activity(userId: string, weekStartIso: string): Promise<MemberActivity> {
    const row = (await D1().prepare(
      `SELECT COUNT(*) AS videos,
              COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS this_week,
              COALESCE(SUM(CASE WHEN COALESCE(NULLIF(format, ''), CASE WHEN duration_minutes <= 1 THEN 'short' ELSE 'long' END) = 'short' THEN 1 ELSE 0 END), 0) AS shorts,
              MIN(created_at) AS first_at, MAX(created_at) AS last_at
         FROM usage_records WHERE user_id = ?`
    ).bind(weekStartIso, userId).first()) as any;
    const videos = Number(row?.videos) || 0;
    const shorts = Number(row?.shorts) || 0;
    return { videos, thisWeek: Number(row?.this_week) || 0, shorts, long: videos - shorts, firstVideoAt: row?.first_at || null, lastVideoAt: row?.last_at || null };
  },

  async grants(userId: string): Promise<MemberGrant[]> {
    const result = await D1().prepare("SELECT * FROM complimentary_grants WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").bind(userId).all();
    return (result.results || []).map((row: any) => ({
      id: String(row.id), planId: String(row.plan_id), period: String(row.period), status: String(row.status),
      startsAt: String(row.starts_at), endsAt: String(row.ends_at), reason: row.reason ? String(row.reason) : null,
      accessCodeId: row.access_code_id ? String(row.access_code_id) : null, createdAt: String(row.created_at),
    }));
  },

  async deliveries(userId: string): Promise<MemberDelivery[]> {
    const result = await D1().prepare(
      `SELECT d.id, d.campaign_id, d.status, d.sent_at, d.created_at, c.name AS campaign_name
         FROM email_deliveries d LEFT JOIN email_campaigns c ON c.id = d.campaign_id
        WHERE d.user_id = ? ORDER BY d.created_at DESC LIMIT 20`
    ).bind(userId).all();
    return (result.results || []).map((row: any) => ({
      id: String(row.id), campaignId: String(row.campaign_id), campaignName: String(row.campaign_name || ""), status: String(row.status),
      sentAt: row.sent_at ? String(row.sent_at) : null, createdAt: String(row.created_at),
    }));
  },

  /** Conversations in the Inbox with this member (needs the inbox tables). */
  async threads(userId: string, email: string): Promise<MemberThread[]> {
    const result = await D1().prepare(
      "SELECT id, subject, status, last_message_at, last_direction FROM inbox_threads WHERE (user_id = ? OR contact_email = ?) AND status != 'spam' ORDER BY last_message_at DESC LIMIT 10"
    ).bind(userId, String(email).toLowerCase()).all();
    return (result.results || []).map((row: any) => ({
      id: String(row.id), subject: String(row.subject), status: String(row.status), lastMessageAt: String(row.last_message_at), lastDirection: String(row.last_direction),
    }));
  },
};
