import { emailApi } from "./email-centre-api";

/**
 * Client types and calls for the Email Centre inbox (/api/admin/inbox/*).
 * The server re-checks the administrator role on every call.
 */

export type InboxStatus = "new" | "open" | "resolved" | "closed" | "spam";
export type InboxFilter = "needs_reply" | "all" | InboxStatus;

export interface InboxThread {
  id: string;
  subject: string;
  contactEmail: string;
  contactName: string;
  userId: string | null;
  mailbox: string;
  source: "email" | "contact_form" | "outbound";
  category: string;
  status: InboxStatus;
  unread: boolean;
  messageCount: number;
  lastMessageAt: string;
  lastDirection: "in" | "out";
  lastPreview: string;
  createdAt: string;
}

export interface InboxAttachment { index: number; name: string; type: string; size: number; available: boolean; skipped: string | null }

export interface InboxMessage {
  id: string;
  direction: "in" | "out";
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  textBody: string;
  deliveryStatus: "received" | "sending" | "sent" | "delivered" | "bounced" | "failed" | "complained";
  failureReason: string | null;
  attachments: InboxAttachment[];
  authSummary: string;
  automated: boolean;
  createdAt: string;
}

export interface InboxMember {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  plan: "free" | "sceneflow" | "sceneforge";
  source: string;
  complimentaryEndsAt: string | null;
  complimentaryPeriod: string | null;
  marketingConsent: boolean;
}

/** One more address the owner can answer from (support@, hello@…). */
export interface InboxAddress { address: string; displayName: string; signature: string }

export interface InboxSettings {
  address: string;
  displayName: string;
  signature: string;
  otherAddresses: InboxAddress[];
  alertsEnabled: boolean;
  alertEmail: string;
  forwardEnabled: boolean;
  forwardEmail: string;
  replyToAllEmails: boolean;
  /** Empty: campaigns come from Scenering <noreply@scenering.com>. Otherwise one of the addresses above. */
  campaignFrom: string;
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  updatedAt: string | null;
}

export interface InboxConnection {
  address: string;
  /** Every address customers can write to: the personal one first. */
  addresses?: string[];
  domain: string;
  mx: { state: "cloudflare" | "other" | "none" | "unknown"; hosts: string[] };
  lastInboundAt: string | null;
  receiving: boolean;
  sendingConfigured: boolean;
  forwardEmail: string;
  alertEmail: string;
}

export interface SavedReply { id: string; title: string; body: string }
export interface InboxSummary { needsReply: number; unread: number; total: number; spam: number }

export const INBOX_FILTERS: Array<{ value: InboxFilter; label: string }> = [
  { value: "needs_reply", label: "Needs reply" },
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "spam", label: "Spam" },
];

export const STATUS_LABEL: Record<InboxStatus, string> = { new: "New", open: "Open", resolved: "Resolved", closed: "Closed", spam: "Spam" };

export const PLAN_LABEL: Record<string, string> = { free: "Free", sceneflow: "SceneFlow", sceneforge: "SceneForge" };

export const inboxApi = {
  summary: () => emailApi<{ summary: InboxSummary }>("/api/admin/inbox/summary"),
  threads: (filter: InboxFilter, q: string, offset = 0) =>
    emailApi<{ threads: InboxThread[]; hasMore: boolean; counts: Record<InboxFilter, number> }>(`/api/admin/inbox/threads?filter=${encodeURIComponent(filter)}&q=${encodeURIComponent(q)}&offset=${offset}`),
  thread: (id: string) => emailApi<{ thread: InboxThread; messages: InboxMessage[]; member: InboxMember | null; replyFrom?: string }>(`/api/admin/inbox/threads/${encodeURIComponent(id)}`),
  update: (id: string, patch: { status?: InboxStatus; unread?: boolean }) =>
    emailApi<{ thread: InboxThread }>(`/api/admin/inbox/threads/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) }),
  remove: (id: string) => emailApi<{ deleted: boolean }>(`/api/admin/inbox/threads/${encodeURIComponent(id)}`, { method: "DELETE" }),
  reply: (id: string, body: string, status?: InboxStatus, from?: string) =>
    emailApi<{ thread: InboxThread; message: InboxMessage }>(`/api/admin/inbox/threads/${encodeURIComponent(id)}/reply`, { method: "POST", body: JSON.stringify({ body, status, from }) }),
  compose: (to: string, subject: string, body: string, from?: string) =>
    emailApi<{ thread: InboxThread; message: InboxMessage }>("/api/admin/inbox/compose", { method: "POST", body: JSON.stringify({ to, subject, body, from }) }),
  settings: () => emailApi<{ settings: InboxSettings }>("/api/admin/inbox/settings"),
  saveSettings: (patch: Partial<InboxSettings>) => emailApi<{ settings: InboxSettings }>("/api/admin/inbox/settings", { method: "PUT", body: JSON.stringify(patch) }),
  status: () => emailApi<{ status: InboxConnection }>("/api/admin/inbox/status"),
  savedReplies: () => emailApi<{ replies: SavedReply[] }>("/api/admin/inbox/saved-replies"),
  createSavedReply: (title: string, body: string) => emailApi<{ reply: SavedReply }>("/api/admin/inbox/saved-replies", { method: "POST", body: JSON.stringify({ title, body }) }),
  updateSavedReply: (id: string, title: string, body: string) =>
    emailApi<{ reply: SavedReply }>(`/api/admin/inbox/saved-replies/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ title, body }) }),
  deleteSavedReply: (id: string) => emailApi<{ deleted: boolean }>(`/api/admin/inbox/saved-replies/${encodeURIComponent(id)}`, { method: "DELETE" }),
  giftAccess: (userId: string, planId: "sceneflow" | "sceneforge", period: "month" | "year") =>
    emailApi<{ grant: unknown }>("/api/admin/complimentary-memberships", { method: "POST", body: JSON.stringify({ userId, planId, period, reason: "Gift from the Email Centre inbox" }) }),
};

/** "2 min ago", "3 h ago", "Yesterday", else a date. */
export function relativeTime(iso: string): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "";
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  if (hours < 48) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A saved reply with {{first_name}} filled in for this conversation. */
export function fillSavedReply(body: string, contactName: string): string {
  const first = String(contactName || "").trim().split(/\s+/)[0] || "there";
  return body.replace(/\{\{\s*first_name\s*\}\}/g, first);
}

/** Every address the owner can send from, the personal one first. */
export function senderOptions(settings: InboxSettings | null): Array<InboxAddress & { primary: boolean }> {
  if (!settings) return [];
  return [
    { address: settings.address, displayName: settings.displayName, signature: settings.signature, primary: true },
    ...(settings.otherAddresses || []).map((entry) => ({ ...entry, primary: false })),
  ];
}

export function senderLabel(option: { address: string; displayName: string }): string {
  return option.displayName ? `${option.displayName} <${option.address}>` : option.address;
}
