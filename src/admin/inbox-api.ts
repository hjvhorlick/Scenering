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

export interface InboxAttachment { index: number; name: string; type: string; size: number; available: boolean; skipped: string | null; inline?: boolean }

export interface InboxOutgoingAttachment {
  name: string;
  type: string;
  size: number;
  /** Base64-encoded file bytes. */
  content: string;
}

export interface InboxMessage {
  id: string;
  direction: "in" | "out";
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
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
  emptySpam: () => emailApi<{ deletedCount: number }>("/api/admin/inbox/spam", { method: "DELETE" }),
  reply: (id: string, body: string, status?: InboxStatus, from?: string, attachments?: InboxOutgoingAttachment[]) =>
    emailApi<{ thread: InboxThread; message: InboxMessage }>(
      `/api/admin/inbox/threads/${encodeURIComponent(id)}/reply`,
      { method: "POST", body: JSON.stringify({ body, status, from, ...(attachments?.length ? { attachments } : {}) }) },
    ),
  compose: (to: string, subject: string, body: string, from?: string, attachments?: InboxOutgoingAttachment[]) =>
    emailApi<{ thread: InboxThread; message: InboxMessage }>(
      "/api/admin/inbox/compose",
      { method: "POST", body: JSON.stringify({ to, subject, body, from, ...(attachments?.length ? { attachments } : {}) }) },
    ),
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

export const MAX_OUTGOING_ATTACHMENTS = 10;
export const MAX_OUTGOING_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_OUTGOING_TOTAL_BYTES = 25 * 1024 * 1024;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/** Reads selected browser Files into base64 attachments, enforcing the 10-file / 10 MB / 25 MB limits. */
export async function readFilesForUpload(
  files: FileList | File[],
  existing: InboxOutgoingAttachment[] = [],
): Promise<{ attachments: InboxOutgoingAttachment[]; error: string | null }> {
  const incoming = Array.from(files || []);
  if (!incoming.length) return { attachments: existing, error: null };
  const next = [...existing];
  let total = next.reduce((sum, item) => sum + item.size, 0);
  for (const file of incoming) {
    if (next.length >= MAX_OUTGOING_ATTACHMENTS) {
      return { attachments: next, error: `You can attach up to ${MAX_OUTGOING_ATTACHMENTS} files per message.` };
    }
    if (file.size === 0) {
      return { attachments: next, error: `"${file.name}" is empty.` };
    }
    if (file.size > MAX_OUTGOING_ATTACHMENT_BYTES) {
      return { attachments: next, error: `"${file.name}" exceeds the 10 MB per-file limit.` };
    }
    if (total + file.size > MAX_OUTGOING_TOTAL_BYTES) {
      return { attachments: next, error: "Total attachments cannot exceed 25 MB." };
    }
    const buffer = await file.arrayBuffer();
    next.push({
      name: file.name || `attachment-${next.length + 1}`,
      type: file.type || "application/octet-stream",
      size: file.size,
      content: arrayBufferToBase64(buffer),
    });
    total += file.size;
  }
  return { attachments: next, error: null };
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

export type TextSegment = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

const URL_TOKEN_RE = /(?:https?:\/\/|mailto:)[^\s<>"'`]+/gi;

function trimTrailingUrlPunctuation(raw: string): { url: string; trailing: string } {
  let url = raw;
  let trailing = "";
  while (url.length > 0) {
    const last = url[url.length - 1]!;
    if (/[.,;:!?"'\]>]/.test(last)) {
      trailing = last + trailing;
      url = url.slice(0, -1);
      continue;
    }
    if (last === ")") {
      const opens = (url.match(/\(/g) || []).length;
      const closes = (url.match(/\)/g) || []).length;
      if (closes > opens) {
        trailing = last + trailing;
        url = url.slice(0, -1);
        continue;
      }
    }
    break;
  }
  return { url, trailing };
}

/** Splits message text into plain-text runs and clickable URL/mailto links. */
export function tokenizeTextWithLinks(text: string): TextSegment[] {
  const source = String(text || "");
  if (!source) return [];
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of source.matchAll(URL_TOKEN_RE)) {
    const start = match.index ?? 0;
    const raw = match[0] || "";
    const { url, trailing } = trimTrailingUrlPunctuation(raw);
    if (!url || /^(?:https?:\/\/|mailto:)$/i.test(url)) continue;
    if (start > cursor) segments.push({ kind: "text", text: source.slice(cursor, start) });
    segments.push({ kind: "link", text: url, href: url });
    if (trailing) segments.push({ kind: "text", text: trailing });
    cursor = start + raw.length;
  }
  if (cursor < source.length) segments.push({ kind: "text", text: source.slice(cursor) });
  return segments;
}

export interface ExtractedEmailLink {
  url: string;
  label: string;
  isVerification: boolean;
}

const VERIFICATION_HINT_RE = /\b(verify|verification|confirm|confirmation|activate|activation|validate|authorize|approve|accept|reset|token|magic|sign[- ]?in|login|complete)\b/i;

function decodeBasicEntities(value: string): string {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

/** Extracts unique clickable http(s) links from a message's HTML and plain text, highlighting verification links. */
export function extractMessageLinks(message: Pick<InboxMessage, "textBody" | "htmlBody" | "subject">): ExtractedEmailLink[] {
  const byUrl = new Map<string, ExtractedEmailLink>();
  const subjectVerify = VERIFICATION_HINT_RE.test(String(message.subject || ""));
  const html = String(message.htmlBody || "");
  if (html) {
    const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
    for (const match of html.matchAll(anchorRe)) {
      const attrs = match[1] || "";
      const inner = match[2] || "";
      const hrefMatch = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
      if (!hrefMatch) continue;
      const url = decodeBasicEntities(hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? "").trim();
      if (!/^https?:\/\//i.test(url)) continue;
      const label = decodeBasicEntities(inner.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
      const isVerification = subjectVerify || VERIFICATION_HINT_RE.test(label) || VERIFICATION_HINT_RE.test(url);
      const existing = byUrl.get(url);
      if (!existing || (!existing.label && label)) {
        byUrl.set(url, { url, label: label && label.toLowerCase() !== url.toLowerCase() ? label : "", isVerification: Boolean(existing?.isVerification || isVerification) });
      }
    }
  }
  for (const segment of tokenizeTextWithLinks(message.textBody || "")) {
    if (segment.kind !== "link" || !/^https?:\/\//i.test(segment.href)) continue;
    const url = segment.href;
    if (!byUrl.has(url)) {
      const isVerification = subjectVerify || VERIFICATION_HINT_RE.test(url);
      byUrl.set(url, { url, label: "", isVerification });
    }
  }
  return Array.from(byUrl.values()).sort((a, b) => Number(b.isVerification) - Number(a.isVerification));
}

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/bmp", "image/avif"]);

export function isImageAttachment(file: Pick<InboxAttachment, "type" | "available">): boolean {
  return Boolean(file.available && IMAGE_MIME_TYPES.has(String(file.type || "").toLowerCase()));
}

export function hasEmailImages(message: Pick<InboxMessage, "htmlBody" | "attachments">): boolean {
  return /<img\b/i.test(String(message.htmlBody || "")) || (message.attachments || []).some(isImageAttachment);
}

/**
 * Whether an email's sender is automatically trusted to display rich HTML and images:
 * - Outgoing messages sent by the owner;
 * - Senders explicitly trusted by the owner;
 * - Non-spam incoming emails that passed SPF, DKIM or DMARC authentication without failing DMARC.
 */
export function isMessageTrusted(
  message: Pick<InboxMessage, "direction" | "fromEmail" | "authSummary">,
  threadStatus?: InboxStatus,
  trustedSenders?: ReadonlySet<string>,
): boolean {
  if (threadStatus === "spam") return false;
  if (message.direction === "out") return true;
  const sender = String(message.fromEmail || "").trim().toLowerCase();
  if (sender && trustedSenders?.has(sender)) return true;
  const auth = String(message.authSummary || "").toLowerCase();
  if (/\bdmarc=fail\b/.test(auth)) return false;
  return /\b(?:dmarc|dkim|spf)=pass\b/.test(auth);
}

/**
 * Prepares stored HTML for display in the conversation view:
 * - ensures all links open in a new tab with rel="noopener noreferrer";
 * - strips <img> tags when images are not yet trusted for this message.
 */
export function prepareEmailHtmlForDisplay(html: string, options: { showImages: boolean }): string {
  let output = String(html || "");
  if (!output) return "";
  if (!options.showImages) {
    output = output.replace(/<img\b[^>]*>/gi, "");
  }
  output = output.replace(/<a\b([^>]*)>/gi, (_full, attrs: string) => {
    const cleaned = String(attrs || "")
      .replace(/\s*\btarget\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/gi, "")
      .replace(/\s*\brel\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/gi, "");
    return `<a${cleaned} target="_blank" rel="noopener noreferrer">`;
  });
  return output;
}
