import { emailApi } from "./email-centre-api";
import { GIFT_LENGTHS, giftLengthLabel, type GiftLength } from "../lib/gift-lengths";

/**
 * Client types and calls for the Email Centre's Members and Gifts tabs
 * (/api/admin/members, /api/admin/gift-codes). The server re-checks the
 * administrator role on every call.
 */

export { GIFT_LENGTHS, giftLengthLabel, type GiftLength };

export type MemberFilter = "all" | "free" | "paying" | "gift" | "new" | "no_video" | "quiet" | "unconfirmed";
export type MemberSort = "newest" | "videos" | "active";
export type PaidPlan = "sceneflow" | "sceneforge";

export const MEMBER_FILTERS: Array<{ value: MemberFilter; label: string; hint: string }> = [
  { value: "all", label: "Everyone", hint: "Every member" },
  { value: "free", label: "Free", hint: "On Free, with no gift" },
  { value: "paying", label: "Paying", hint: "A SceneFlow or SceneForge subscription" },
  { value: "gift", label: "On a gift", hint: "Free time you gave, still running" },
  { value: "new", label: "Joined in the last 30 days", hint: "New members" },
  { value: "no_video", label: "No video yet", hint: "Never downloaded a video" },
  { value: "quiet", label: "Quiet for 30 days", hint: "No video in the last 30 days" },
  { value: "unconfirmed", label: "Email not confirmed", hint: "Never clicked the confirmation link" },
];

export const MEMBER_SORTS: Array<{ value: MemberSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "active", label: "Last video" },
  { value: "videos", label: "Most videos" },
];

export interface MemberRow {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  verified: boolean;
  marketingConsent: boolean;
  paidPlan: PaidPlan | null;
  giftPlan: PaidPlan | null;
  giftEndsAt: string | null;
  videos: number;
  lastVideoAt: string | null;
}

export interface MemberSummary {
  id: string;
  email: string;
  displayName: string;
  verified: boolean;
  createdAt: string;
  plan: "free" | PaidPlan;
  source: string;
  complimentaryEndsAt: string | null;
  complimentaryPeriod: string | null;
  marketingConsent: boolean;
}

export interface MemberGift {
  id: string;
  planId: string;
  period: string;
  status: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  accessCodeId: string | null;
  createdAt: string;
  active: boolean;
  code: { code: string; label: string } | null;
}

export interface MemberDetail {
  member: MemberSummary;
  subscription: { planId: string; interval: string; status: string; renewsAt: string | null; endsAt: string | null; cancelAtPeriodEnd: boolean; startedAt: string } | null;
  consent: { given: boolean; at: string; source: string } | null;
  activity: { videos: number; thisWeek: number; shorts: number; long: number; firstVideoAt: string | null; lastVideoAt: string | null };
  gifts: MemberGift[];
  emails: Array<{ id: string; campaignId: string; campaignName: string; status: string; sentAt: string | null; createdAt: string }>;
  conversations: Array<{ id: string; subject: string; status: string; lastMessageAt: string; lastDirection: string }>;
}

export type GiftCodeState = "active" | "paused" | "ended" | "expired" | "used_up";

export interface GiftCodeResults { claimed: number; newMembers: number; onGift: number; madeVideo: number; thenPaid: number }

export interface GiftCode {
  id: string;
  code: string;
  label: string;
  planId: PaidPlan;
  period: string;
  maxUses: number | null;
  newMembersOnly: boolean;
  status: "active" | "paused" | "ended";
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  results: GiftCodeResults;
  state: GiftCodeState;
}

export interface GiftCodePerson {
  grantId: string;
  userId: string;
  email: string;
  displayName: string;
  joinedAt: string;
  claimedAt: string;
  endsAt: string;
  active: boolean;
  videosSince: number;
  thenPaid: boolean;
}

export interface NewGiftCodeInput {
  label: string;
  planId: PaidPlan;
  period: GiftLength;
  maxUses: number | null;
  newMembersOnly: boolean;
  claimByDays?: number;
  claimByDate?: string;
  code?: string;
}

export const PLAN_NAME: Record<string, string> = { free: "Free", sceneflow: "SceneFlow", sceneforge: "SceneForge" };

export const GIFT_STATE_LABEL: Record<GiftCodeState, string> = {
  active: "Open", paused: "Paused", ended: "Ended", expired: "Past its last day", used_up: "Used up",
};

export const membersApi = {
  list: (filter: MemberFilter, q: string, sort: MemberSort, offset = 0) =>
    emailApi<{ members: MemberRow[]; hasMore: boolean; counts: Record<MemberFilter, number> }>(`/api/admin/members?filter=${encodeURIComponent(filter)}&q=${encodeURIComponent(q)}&sort=${encodeURIComponent(sort)}&offset=${offset}`),
  detail: (id: string) => emailApi<MemberDetail>(`/api/admin/members/${encodeURIComponent(id)}`),
  give: (userId: string, planId: PaidPlan, period: GiftLength, reason: string) =>
    emailApi<{ grant: { ends_at: string } }>("/api/admin/complimentary-memberships", { method: "POST", body: JSON.stringify({ userId, planId, period, reason }) }),
  endGift: (grantId: string) => emailApi<{ revoked: boolean }>(`/api/admin/complimentary-memberships/${encodeURIComponent(grantId)}/revoke`, { method: "POST", body: "{}" }),
  codes: () => emailApi<{ codes: GiftCode[] }>("/api/admin/gift-codes"),
  code: (id: string) => emailApi<{ code: GiftCode; people: GiftCodePerson[] }>(`/api/admin/gift-codes/${encodeURIComponent(id)}`),
  createCode: (input: NewGiftCodeInput) => emailApi<{ code: GiftCode }>("/api/admin/gift-codes", { method: "POST", body: JSON.stringify(input) }),
  updateCode: (id: string, patch: Partial<{ label: string; maxUses: number | null; claimByDays: number; claimByDate: string; status: "active" | "paused" | "ended" }>) =>
    emailApi<{ code: GiftCode }>(`/api/admin/gift-codes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) }),
};

/** "SceneFlow for 1 month" */
export function giftText(planId: string, period: string): string {
  return `${PLAN_NAME[planId] || planId} for ${giftLengthLabel(period)}`;
}

/** The two links a code is shared with. Members claim at once; new people make an account first. */
export function giftLinks(code: string, origin: string): { members: string; newPeople: string } {
  const encoded = encodeURIComponent(code);
  return { members: `${origin}/app?code=${encoded}`, newPeople: `${origin}/register?code=${encoded}` };
}

/** "16 Oct 2026" */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

/** Copies text, falling back to a hidden field where the clipboard API is blocked. */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through to the older way
  }
  try {
    const field = document.createElement("textarea");
    field.value = value;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  } catch {
    return false;
  }
}
