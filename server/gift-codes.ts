import { db, type ComplimentaryGrant, type User } from "../src/db.ts";
import { giftsDb, type GiftCode, type GiftCodeResults } from "../src/gifts-db.ts";
import { GIFT_CODE_STATUSES, type GiftCodeStatus } from "../src/gifts-schema.ts";
import { giftEndsAt, isGiftLength, type GiftLength } from "../src/lib/gift-lengths.ts";

/**
 * Gift codes: making them (validation), using them (the claim rules) and
 * describing them. A leaf module (database only) so that server/platform.ts
 * can use it in the public redeem endpoint without importing the admin
 * routes in server/members.ts.
 */

let schemaReady: Promise<void> | null = null;
/** Creates the gift-code table on first use in this isolate (see src/gifts-schema.ts). */
export function ensureGiftSchema(): Promise<void> {
  if (!schemaReady) schemaReady = giftsDb.ensureSchema().catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}
/** Tests only: forget that the schema was ensured. */
export function resetGiftSchemaCache() {
  schemaReady = null;
}

const PLAN_RANK: Record<string, number> = { free: 0, sceneflow: 1, sceneforge: 2 };
/** The longest a code can stay open for claims. */
export const MAX_CLAIM_DAYS = 730;
export const MAX_GIFT_USES = 100000;

/** What people type is matched without regard to case or surrounding spaces. */
export function normalizeGiftCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

/** Own codes: letters, digits and dashes, 4 to 32 characters. "SCN-" belongs to the one-time codes. */
export function giftCodeTextProblem(code: string): string | null {
  if (!/^[A-Z0-9][A-Z0-9-]{2,30}[A-Z0-9]$/.test(code)) return "A code can use letters, numbers and dashes, 4 to 32 characters, starting and ending with a letter or number.";
  if (code.startsWith("SCN-")) return "Codes starting with SCN- are kept for one-time codes. Choose another start.";
  return null;
}

/** No 0/O or 1/I, so a code read aloud or copied by hand still works. Exactly 32 characters. */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export function generateGiftCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `GIFT-${Array.from(bytes, (byte) => CODE_ALPHABET[byte & 31]).join("")}`;
}

export interface NewGiftCode {
  code: string | null;
  label: string;
  planId: "sceneflow" | "sceneforge";
  period: GiftLength;
  maxUses: number | null;
  newMembersOnly: boolean;
  expiresAt: string;
}

/** The end of a chosen day (UTC), or `days` from now. */
function claimByFrom(body: any, now: Date): { expiresAt: string } | { error: string } {
  if (body?.claimByDate !== undefined && body?.claimByDate !== null && body?.claimByDate !== "") {
    const text = String(body.claimByDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { error: "Choose the last day the code can be used." };
    const end = new Date(`${text}T23:59:59.999Z`);
    if (!Number.isFinite(end.getTime()) || end.getTime() <= now.getTime()) return { error: "The last day to use the code must be in the future." };
    if (end.getTime() > now.getTime() + MAX_CLAIM_DAYS * 86400000) return { error: "A code can stay open for up to two years." };
    return { expiresAt: end.toISOString() };
  }
  const days = Math.trunc(Number(body?.claimByDays));
  if (!Number.isFinite(days) || days < 1 || days > MAX_CLAIM_DAYS) return { error: "Choose how long people have to use the code." };
  return { expiresAt: new Date(now.getTime() + days * 86400000).toISOString() };
}

function maxUsesFrom(value: unknown): { maxUses: number | null } | { error: string } {
  if (value === null || value === undefined || value === "") return { maxUses: null };
  const uses = Number(value);
  if (!Number.isInteger(uses) || uses < 1 || uses > MAX_GIFT_USES) return { error: `The number of people must be a whole number from 1 to ${MAX_GIFT_USES.toLocaleString("en-GB")}, or no limit.` };
  return { maxUses: uses };
}

/** Checks the "make a gift code" form. */
export function validateNewGiftCode(body: any, now: Date = new Date()): { value: NewGiftCode } | { error: string } {
  const planId = body?.planId;
  if (planId !== "sceneflow" && planId !== "sceneforge") return { error: "Choose SceneFlow or SceneForge." };
  if (!isGiftLength(body?.period)) return { error: "Choose how long the gift lasts." };
  const uses = maxUsesFrom(body?.maxUses);
  if ("error" in uses) return uses;
  const claimBy = claimByFrom(body, now);
  if ("error" in claimBy) return claimBy;
  let code: string | null = null;
  if (body?.code !== undefined && body?.code !== null && String(body.code).trim() !== "") {
    code = normalizeGiftCode(body.code);
    const problem = giftCodeTextProblem(code);
    if (problem) return { error: problem };
  }
  const label = String(body?.label ?? "").replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return { value: { code, label, planId, period: body.period, maxUses: uses.maxUses, newMembersOnly: Boolean(body?.newMembersOnly), expiresAt: claimBy.expiresAt } };
}

/** Checks an edit: name, number of people, last day, or status. */
export function validateGiftCodeEdit(body: any, code: GiftCode, claimed: number, now: Date = new Date()): { fields: Partial<Pick<GiftCode, "label" | "maxUses" | "expiresAt" | "status">> } | { error: string } {
  const fields: Partial<Pick<GiftCode, "label" | "maxUses" | "expiresAt" | "status">> = {};
  if (body?.label !== undefined) fields.label = String(body.label ?? "").replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (body?.maxUses !== undefined) {
    const uses = maxUsesFrom(body.maxUses);
    if ("error" in uses) return uses;
    if (uses.maxUses !== null && uses.maxUses < claimed) return { error: `${claimed} ${claimed === 1 ? "person has" : "people have"} already used this code, so the limit cannot be lower than that.` };
    fields.maxUses = uses.maxUses;
  }
  if (body?.claimByDate !== undefined || body?.claimByDays !== undefined) {
    const claimBy = claimByFrom(body, now);
    if ("error" in claimBy) return claimBy;
    fields.expiresAt = claimBy.expiresAt;
  }
  if (body?.status !== undefined) {
    const status = body.status as GiftCodeStatus;
    if (!(GIFT_CODE_STATUSES as readonly string[]).includes(status)) return { error: "Unknown status." };
    if (code.status === "ended" && status !== "ended") return { error: "An ended code cannot be started again. Make a new code instead." };
    fields.status = status;
  }
  if (code.status === "ended" && (fields.maxUses !== undefined || fields.expiresAt !== undefined)) return { error: "An ended code cannot be changed. Make a new code instead." };
  return { fields };
}

export type GiftCodeState = "active" | "paused" | "ended" | "expired" | "used_up";

/** What the owner sees: ended and paused first, then whether it ran out. */
export function giftCodeState(code: GiftCode, claimed: number, now: Date = new Date()): GiftCodeState {
  if (code.status === "ended") return "ended";
  if (code.status === "paused") return "paused";
  if (code.expiresAt <= now.toISOString()) return "expired";
  if (code.maxUses !== null && claimed >= code.maxUses) return "used_up";
  return "active";
}

export function apiGiftCode(code: GiftCode, results: GiftCodeResults, now: Date = new Date()) {
  return { ...code, results, state: giftCodeState(code, results.claimed, now) };
}

export type GiftClaim =
  | { status: "not_found" }
  | { status: "refused"; error: string }
  | { status: "claimed"; grant: ComplimentaryGrant; code: GiftCode };

const refused = (error: string): GiftClaim => ({ status: "refused", error });

/**
 * One person using a gift code. The checks before the write only choose
 * the message; the write itself (giftsDb.claim) re-checks status, date,
 * use limit and "not used before" in one statement, so a race can never
 * give out more gifts than the code allows.
 *
 * A gift never takes something away: someone whose paid plan already
 * covers the gift, or whose running gift is at least as good and lasts at
 * least as long, is told so and the use is not spent.
 */
export async function claimGiftCode(user: User, raw: string, now: Date = new Date()): Promise<GiftClaim> {
  const text = normalizeGiftCode(raw);
  if (!text || text.length > 40) return { status: "not_found" };
  let code: GiftCode | null = null;
  try {
    await ensureGiftSchema();
    code = await giftsDb.findByCode(text);
  } catch {
    // No gift-code table and none could be made: there are no gift codes,
    // so the person gets the usual "invalid code" answer, not an error.
    return { status: "not_found" };
  }
  if (!code) return { status: "not_found" };
  const nowIso = now.toISOString();
  if (code.status === "ended") return refused("This gift code has ended.");
  if (code.status === "paused") return refused("This gift code is not available right now. Please try again later.");
  if (code.expiresAt <= nowIso) return refused("This gift code has expired.");
  if (code.newMembersOnly && user.createdAt < code.createdAt) return refused("This gift code is for new members only.");
  if (await giftsDb.hasClaimed(code.id, user.id)) return refused("You have already used this gift code.");
  if (code.maxUses !== null && (await giftsDb.countClaims(code.id)) >= code.maxUses) return refused("This gift code has been used up.");
  const membership = await db.findMembershipByUserId(user.id);
  if (membership && (PLAN_RANK[membership.plan] ?? 0) >= PLAN_RANK[code.planId]) return refused("Your plan already includes everything in this gift.");
  const endsAt = giftEndsAt(now, code.period as GiftLength).toISOString();
  await db.expireStaleComplimentaryGrants();
  const current = await db.findActiveComplimentaryGrant(user.id);
  if (current && (PLAN_RANK[current.planId] ?? 0) >= PLAN_RANK[code.planId] && current.endsAt >= endsAt) return refused("You already have a gift that is at least as good and lasts longer.");

  const grantId = db.newId("grant");
  const reason = `Gift code ${code.code}`;
  const claimed = await giftsDb.claim({ codeId: code.id, userId: user.id, grantId, startsAt: nowIso, endsAt, reason, now: nowIso });
  if (!claimed) {
    // Lost a race: say which way.
    if (await giftsDb.hasClaimed(code.id, user.id)) return refused("You have already used this gift code.");
    if (code.maxUses !== null && (await giftsDb.countClaims(code.id)) >= code.maxUses) return refused("This gift code has been used up.");
    return refused("This gift code is not available right now. Please try again later.");
  }
  await giftsDb.revokeOtherActiveGrants(user.id, grantId);
  const grant = await db.findComplimentaryGrantById(grantId);
  return {
    status: "claimed",
    code,
    grant: grant || { id: grantId, userId: user.id, planId: code.planId, period: code.period, status: "active", startsAt: nowIso, endsAt, grantedBy: code.createdBy, reason, accessCodeId: code.id, createdAt: nowIso, revokedAt: null },
  };
}
