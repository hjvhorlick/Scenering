import PostalMime from "postal-mime";
import { env } from "../src/env.ts";
import { db, type ContactSubmission } from "../src/db.ts";
import { CONTACT_FORM_MAILBOX, inboxDb, previewOf, type InboxAttachment, type InboxMessage, type InboxSummary, type InboxThread } from "../src/inbox-db.ts";
import type { InboxStatus } from "../src/inbox-schema.ts";
import { escapeEmailHtml } from "../src/lib/email-templates.ts";
import { sendConversationEmail, sendTransactionalEmail } from "./email.ts";
import { defaultInboxSettings, findInboxIdentity, getInboxSettings, headerSafe, inboxIdentities, isInboxAddress, isValidEmailAddress, type InboxIdentity, type InboxSettings } from "./inbox-settings.ts";

/**
 * The owner's inbox: everything except the HTTP routes (server/inbox.ts).
 *
 * Kept free of server/platform.ts so the contact form (platform.ts) and the
 * Worker's email() handler (worker.ts) can both call into it without a
 * circular import.
 *
 * Where messages come from
 * ------------------------
 *  - The contact form: platform.ts stores the submission exactly as before
 *    and then calls recordContactFormMessage(), which opens a conversation
 *    and alerts the owner. If that step fails the submission is still
 *    stored, and the next inbox load imports it (inboxDb.syncContactSubmissions).
 *  - Email to the Scenering address: Cloudflare Email Routing hands each
 *    message to the Worker's email() handler, which calls handleInboundEmail().
 *    The message is parsed, matched to its conversation through the
 *    Message-IDs it quotes, stored, and an untouched copy is forwarded to
 *    the owner's own mailbox (or, if forwarding is off or fails, an alert
 *    is sent instead).
 *
 * Replies go out through the existing provider (Resend) from the owner's
 * address with In-Reply-To/References set, so they thread in the
 * customer's mail app, and the customer's answer threads back here.
 *
 * Safety
 * ------
 *  - Inbound HTML is never stored or shown as HTML: it is reduced to text.
 *  - Attachments are stored privately and only ever downloaded (never shown
 *    inline), by the administrator.
 *  - Flood limits per sender and per day, a size limit, and messages that
 *    fail DMARC are filed as spam (stored, never forwarded or alerted).
 *    Automatic messages (out-of-office, newsletters, bounces, service
 *    notices) are stored and still copied to the owner, but never alert
 *    and never put a conversation back on the "needs reply" list.
 */

const DAY_MS = 24 * 3600_000;
const MAX_RAW_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 100_000;
const MAX_PER_SENDER_PER_HOUR = 30;
const MAX_INBOUND_PER_DAY = 1000;
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ALERTS_PER_DAY = 50;
const ALERT_BUDGET_KEY = "inbox_alert_budget";
const ATTACHMENT_PREFIX = "inbox/";

export class InboxError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

let schemaReady: Promise<void> | null = null;
/** Creates the inbox tables on first use in this isolate (see src/inbox-schema.ts). */
export function ensureInboxSchema(): Promise<void> {
  if (!schemaReady) schemaReady = inboxDb.ensureSchema().catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}
/** Tests only: forget that the schema was ensured. */
export function resetInboxSchemaCache() {
  schemaReady = null;
}

// ---------------------------------------------------------------------------
// Text helpers (exported for tests)
// ---------------------------------------------------------------------------

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** A Message-ID without angle brackets, lower-cased, or null. */
export function normalizeMessageId(value: unknown): string | null {
  const id = String(value ?? "").trim().replace(/^<+/, "").replace(/>+$/, "").trim().toLowerCase();
  return id && id.length <= 300 && !/\s/.test(id) ? id : null;
}

/** Every Message-ID named in an In-Reply-To or References header. */
export function extractMessageIds(value: unknown): string[] {
  const text = String(value ?? "");
  const bracketed = Array.from(text.matchAll(/<([^<>\s]{1,300})>/g), (match) => match[1].toLowerCase());
  if (bracketed.length) return bracketed;
  const single = normalizeMessageId(text);
  return single ? [single] : [];
}

const REPLY_PREFIX = /^(re|fw|fwd|aw|wg|sv|vs|antw|tr|rv|ref)\s*(\[\d+\]|\(\d+\))?\s*:\s*/i;
/** A subject with every Re:/Fwd:/Aw: prefix removed, for matching replies. */
export function normalizeSubject(subject: unknown): string {
  let value = String(subject ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  let previous = "";
  while (value !== previous) {
    previous = value;
    value = value.replace(REPLY_PREFIX, "").trim();
  }
  return value;
}
export function hasReplyPrefix(subject: unknown): boolean {
  return REPLY_PREFIX.test(String(subject ?? "").trim());
}
export function replySubject(subject: unknown): string {
  const clean = headerSafe(subject, 200) || "Your message";
  return /^re\s*:/i.test(clean) ? clean : `Re: ${clean}`;
}

const NAMED_ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©" };
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Readable text from an HTML email: scripts, styles and tags removed. */
export function htmlToText(html: unknown): string {
  let text = String(html ?? "");
  text = text.replace(/<(script|style|head|title|template|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|li|tr|h[1-6]|blockquote|section|article|table|ul|ol)\s*>/gi, "\n");
  text = text.replace(/<li\b[^>]*>/gi, "• ");
  text = text.replace(/<[^>]*>/g, " ");
  text = decodeEntities(text);
  return cleanText(text);
}

/** Line endings normalised, control characters removed, blank runs collapsed. */
export function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type HeaderList = Array<{ key: string; value: string }>;

/** SPF/DKIM/DMARC results from the receiving server's Authentication-Results header. */
export function summarizeAuthentication(headers: HeaderList): { summary: string; suspicious: boolean } {
  const header = headers.find((h) => h.key === "authentication-results")?.value || "";
  const pick = (name: string) => header.match(new RegExp(`\\b${name}=([a-z]+)`, "i"))?.[1]?.toLowerCase() || "";
  const spf = pick("spf");
  const dkim = pick("dkim");
  const dmarc = pick("dmarc");
  const summary = [spf && `spf=${spf}`, dkim && `dkim=${dkim}`, dmarc && `dmarc=${dmarc}`].filter(Boolean).join(" ");
  const suspicious = dmarc === "fail" || (spf === "fail" && dkim !== "pass");
  return { summary, suspicious };
}

/** Out-of-office replies, bounces, newsletters and other machine-sent mail. */
export function isAutomatedMessage(headers: HeaderList, fromAddress: string): boolean {
  const get = (key: string) => headers.find((h) => h.key === key)?.value?.trim().toLowerCase() || "";
  const autoSubmitted = get("auto-submitted");
  if (autoSubmitted && autoSubmitted !== "no") return true;
  if (get("x-autoreply") || get("x-autorespond")) return true;
  if (/^(bulk|junk|list|auto_reply)$/.test(get("precedence"))) return true;
  if (get("list-id") || get("list-unsubscribe")) return true;
  return /^(mailer-daemon|postmaster)@/i.test(fromAddress);
}

// ---------------------------------------------------------------------------
// Alerts to the owner
// ---------------------------------------------------------------------------

function appBase(): string {
  return String(env().PUBLIC_APP_URL || "https://scenering.com").replace(/\/+$/, "");
}

export function inboxThreadLink(threadId: string): string {
  return `${appBase()}/admin?tab=inbox&thread=${encodeURIComponent(threadId)}`;
}

/** At most MAX_ALERTS_PER_DAY alert emails a day, so a flood cannot use up the sending quota. */
async function takeAlertBudget(): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  let count = 0;
  try {
    const raw = await db.getSetting(ALERT_BUDGET_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.day === day) count = Number(parsed.count) || 0;
  } catch {
    count = 0;
  }
  if (count >= MAX_ALERTS_PER_DAY) return false;
  await db.setSetting(ALERT_BUDGET_KEY, JSON.stringify({ day, count: count + 1 }));
  return true;
}

export type AlertOutcome = "sent" | "skipped" | "failed";

async function alertOwner(settings: InboxSettings, thread: InboxThread, details: { name: string; email: string; text: string; via: string }): Promise<AlertOutcome> {
  if (!settings.alertsEnabled || !isValidEmailAddress(settings.alertEmail)) return "skipped";
  try {
    if (!(await takeAlertBudget())) return "skipped";
    const who = headerSafe(details.name, 80) || details.email;
    const snippet = cleanText(details.text).slice(0, 2000);
    await sendTransactionalEmail({
      to: settings.alertEmail,
      kind: "inbox_alert",
      subject: headerSafe(`New message from ${who}: ${thread.subject}`, 200),
      text: [
        `${who} (${details.email}) wrote ${details.via}:`,
        snippet || "(no text)",
        `Reply in your Scenering inbox: ${inboxThreadLink(thread.id)}`,
      ].join("\n\n"),
    });
    return "sent";
  } catch (error) {
    console.error("[inbox] owner alert failed:", (error as Error)?.message || error);
    return "failed";
  }
}

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------

/** Opens a conversation for a stored contact-form submission and alerts the owner. */
export async function recordContactFormMessage(contact: ContactSubmission): Promise<{ thread: InboxThread; alert: AlertOutcome }> {
  await ensureInboxSchema();
  const settings = await getInboxSettings();
  const email = normalizeEmail(contact.email);
  const member = await db.findUserByEmail(email);
  const threadId = `thr_${contact.id}`;
  await inboxDb.createThread({
    id: threadId, subject: headerSafe(contact.subject, 200) || "Contact form message", contactEmail: email, contactName: headerSafe(contact.name, 100),
    userId: member?.id || null, mailbox: CONTACT_FORM_MAILBOX, source: "contact_form", category: headerSafe(contact.category, 40), status: "new", createdAt: contact.createdAt,
  });
  await inboxDb.createMessage({
    id: `msg_${contact.id}`, threadId, direction: "in", fromEmail: email, fromName: headerSafe(contact.name, 100), toEmail: CONTACT_FORM_MAILBOX,
    subject: headerSafe(contact.subject, 200), textBody: cleanText(contact.message).slice(0, MAX_TEXT_CHARS), messageId: `contact-${contact.id}@scenering.com`,
    inReplyTo: null, referencesHeader: null, providerMessageId: null, deliveryStatus: "received", failureReason: null, attachments: [],
    authSummary: "", automated: false, sentBy: null, createdAt: contact.createdAt,
  });
  await inboxDb.touchThread(threadId, { direction: "in", at: contact.createdAt, preview: contact.message, unread: true });
  const thread = (await inboxDb.findThread(threadId))!;
  const alert = await alertOwner(settings, thread, { name: contact.name, email, text: contact.message, via: `through the contact form (${headerSafe(contact.category, 40) || "General"})` });
  return { thread, alert };
}

// ---------------------------------------------------------------------------
// Inbound email (Cloudflare Email Routing → worker.ts email() → here)
// ---------------------------------------------------------------------------

/** The part of Cloudflare's ForwardableEmailMessage the inbox uses. */
export interface InboundEmail {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  readonly headers: Headers;
  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<unknown>;
}

export interface InboundOutcome {
  stored: boolean;
  rejected?: string;
  threadId?: string;
  messageId?: string;
  status?: InboxStatus;
  automated?: boolean;
  forwarded?: boolean;
  forwardError?: string;
  alert?: AlertOutcome;
}

function attachmentBytes(content: unknown): Uint8Array | null {
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content)) return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  if (typeof content === "string") return new TextEncoder().encode(content);
  return null;
}

async function storeAttachments(messageRowId: string, attachments: Array<{ filename: string | null; mimeType: string; disposition: string | null; related?: boolean; content: unknown }>): Promise<InboxAttachment[]> {
  const bucket = env().AUDIO_BUCKET;
  const out: InboxAttachment[] = [];
  let total = 0;
  // Inline images referenced from the HTML (logos, signature pictures) are
  // part of the layout, not files the customer sent.
  const files = attachments.filter((file) => !(file.related && file.disposition !== "attachment"));
  for (const [index, file] of files.entries()) {
    const bytes = attachmentBytes(file.content);
    const name = headerSafe(file.filename || `attachment-${index + 1}`, 180);
    const type = headerSafe(file.mimeType || "application/octet-stream", 100).toLowerCase();
    const size = bytes?.byteLength || 0;
    if (index >= MAX_ATTACHMENTS) { out.push({ name, type, size, key: null, skipped: "Too many attachments" }); continue; }
    if (!bytes || size === 0) { out.push({ name, type, size, key: null, skipped: "Empty file" }); continue; }
    if (size > MAX_ATTACHMENT_BYTES || total + size > MAX_TOTAL_ATTACHMENT_BYTES) { out.push({ name, type, size, key: null, skipped: "Too large to keep" }); continue; }
    if (!bucket) { out.push({ name, type, size, key: null, skipped: "No file storage configured" }); continue; }
    // The voice-import bucket is the app's only R2 bucket. Its hourly
    // cleanup deletes only keys listed in its own audio_files table, so
    // files under inbox/ are never touched by it.
    const key = `${ATTACHMENT_PREFIX}${messageRowId}/${index}`;
    try {
      await bucket.put(key, bytes, { httpMetadata: { contentType: "application/octet-stream" } });
      total += size;
      out.push({ name, type, size, key });
    } catch {
      out.push({ name, type, size, key: null, skipped: "Could not be stored" });
    }
  }
  return out;
}

async function findThreadForInbound(contactEmail: string, subject: string, messageIds: string[]): Promise<InboxThread | null> {
  const byId = await inboxDb.findThreadIdByMessageIds(messageIds);
  if (byId) {
    const thread = await inboxDb.findThread(byId);
    if (thread) return thread;
  }
  // Fallback for mail apps that drop the threading headers: a "Re:" from
  // the same person with the same subject in the last 90 days. A new
  // message without a reply prefix always starts a new conversation.
  if (!hasReplyPrefix(subject)) return null;
  const wanted = normalizeSubject(subject);
  if (!wanted) return null;
  const candidates = await inboxDb.recentThreadsForContact(contactEmail, new Date(Date.now() - 90 * DAY_MS).toISOString());
  return candidates.find((thread) => thread.status !== "spam" && normalizeSubject(thread.subject) === wanted) || null;
}

async function forwardCopy(message: InboundEmail, settings: InboxSettings): Promise<{ forwarded: boolean; error?: string }> {
  if (!settings.forwardEnabled || !isValidEmailAddress(settings.forwardEmail) || settings.forwardEmail === normalizeEmail(message.to) || isInboxAddress(settings, settings.forwardEmail)) return { forwarded: false };
  try {
    await message.forward(settings.forwardEmail);
    return { forwarded: true };
  } catch (error) {
    return { forwarded: false, error: String((error as Error)?.message || error).slice(0, 300) };
  }
}

/**
 * Receives one email for the Scenering address. Never loses a message
 * silently: if it cannot be stored, an untouched copy is forwarded to the
 * owner; if even that fails, the error propagates so the sender's server
 * learns the delivery failed.
 */
export async function handleInboundEmail(message: InboundEmail): Promise<InboundOutcome> {
  let settings: InboxSettings;
  try {
    await ensureInboxSchema();
    settings = await getInboxSettings();
  } catch (error) {
    const fallback = await forwardCopy(message, { ...defaultInboxSettings(), forwardEnabled: true });
    if (fallback.forwarded) return { stored: false, forwarded: true };
    throw error;
  }

  if (message.rawSize > MAX_RAW_BYTES) {
    message.setReject("Message too large for this mailbox (25 MB limit).");
    return { stored: false, rejected: "too_large" };
  }

  try {
    if ((await inboxDb.countInboundSince(new Date(Date.now() - DAY_MS).toISOString())) >= MAX_INBOUND_PER_DAY) {
      message.setReject("This mailbox is not accepting messages right now. Please try again later.");
      return { stored: false, rejected: "daily_limit" };
    }

    let parsed: Awaited<ReturnType<typeof PostalMime.parse>> | null = null;
    try {
      parsed = await PostalMime.parse(message.raw, { attachmentEncoding: "arraybuffer", maxPartCount: 1000 });
    } catch {
      parsed = null;
    }
    const headerList: HeaderList = parsed?.headers?.map((h) => ({ key: h.key, value: h.value })) || [];
    const fromMailbox = parsed?.from && "address" in parsed.from && parsed.from.address ? parsed.from : null;
    const fromEmail = normalizeEmail(fromMailbox?.address || message.from);
    const replyToAddress = parsed?.replyTo?.find((entry) => "address" in entry && entry.address) as { address: string; name: string } | undefined;
    const contactEmail = isValidEmailAddress(normalizeEmail(replyToAddress?.address)) ? normalizeEmail(replyToAddress!.address) : fromEmail;
    const fromName = headerSafe(fromMailbox?.name || replyToAddress?.name || "", 100);

    if ((await inboxDb.countInboundFromSince(fromEmail, new Date(Date.now() - 3600_000).toISOString())) >= MAX_PER_SENDER_PER_HOUR) {
      message.setReject("Too many messages from this address. Please try again later.");
      return { stored: false, rejected: "sender_limit" };
    }

    const subject = headerSafe(parsed?.subject ?? message.headers.get("subject") ?? "", 200) || "(no subject)";
    const text = parsed
      ? cleanText(parsed.text || htmlToText(parsed.html || "")).slice(0, MAX_TEXT_CHARS)
      : "This email could not be read. An untouched copy was forwarded to your own mailbox if copies are switched on.";
    const ownMessageId = normalizeMessageId(parsed?.messageId);
    const inReplyTo = parsed?.inReplyTo ? extractMessageIds(parsed.inReplyTo).join(" ") : "";
    const referenceIds = [...extractMessageIds(parsed?.inReplyTo), ...extractMessageIds(parsed?.references)];
    const auth = summarizeAuthentication(headerList);
    const automated = isAutomatedMessage(headerList, fromEmail);
    // Mail "from" one of the inbox's own addresses is a loop or a spoof: keep it, never copy it on.
    const loop = isInboxAddress(settings, fromEmail);

    let thread = await findThreadForInbound(contactEmail, subject, referenceIds);
    const member = await db.findUserByEmail(contactEmail);
    if (!thread) {
      thread = await inboxDb.createThread({
        id: inboxDb.newId("thr"), subject, contactEmail, contactName: fromName, userId: member?.id || null,
        mailbox: normalizeEmail(message.to), source: "email", category: "",
        // A machine-sent message opens a conversation that needs no reply.
        status: auth.suspicious ? "spam" : automated ? "closed" : "new",
      });
    } else if (!thread.userId && member) {
      await inboxDb.linkThreadsToUser(contactEmail, member.id);
    }

    const messageRowId = inboxDb.newId("msg");
    const attachments = parsed?.attachments?.length ? await storeAttachments(messageRowId, parsed.attachments as any) : [];
    const stored = await inboxDb.createMessage({
      id: messageRowId, threadId: thread.id, direction: "in", fromEmail, fromName, toEmail: normalizeEmail(message.to), subject, textBody: text,
      messageId: ownMessageId, inReplyTo: inReplyTo || null, referencesHeader: referenceIds.length ? referenceIds.slice(-20).join(" ") : null,
      providerMessageId: null, deliveryStatus: "received", failureReason: null, attachments, authSummary: auth.summary, automated, sentBy: null,
    });
    // A person writing again reopens a finished conversation. An automatic
    // message (an out-of-office reply to the owner's answer) is recorded
    // and marked unread, but leaves the status and "who spoke last" alone.
    const reopened: InboxStatus | undefined = !automated && (thread.status === "resolved" || thread.status === "closed") ? "open" : undefined;
    await inboxDb.touchThread(thread.id, {
      direction: automated && thread.messageCount > 0 ? thread.lastDirection : "in",
      at: stored.createdAt, preview: text || subject, unread: true, status: reopened,
    });
    const current = (await inboxDb.findThread(thread.id))!;

    const quiet = loop || current.status === "spam";
    let forwarded = false;
    let forwardError: string | undefined;
    if (!quiet) {
      const copy = await forwardCopy(message, settings);
      forwarded = copy.forwarded;
      forwardError = copy.error;
    }
    const alert: AlertOutcome = quiet || automated || forwarded ? "skipped" : await alertOwner(settings, current, { name: fromName, email: contactEmail, text, via: `to ${normalizeEmail(message.to)}` });
    return { stored: true, threadId: current.id, messageId: stored.id, status: current.status, automated, forwarded, forwardError, alert };
  } catch (error) {
    console.error("[inbox] could not store an incoming email:", (error as Error)?.message || error);
    const copy = await forwardCopy(message, { ...settings, forwardEnabled: true });
    if (copy.forwarded) return { stored: false, forwarded: true };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Replies and new conversations
// ---------------------------------------------------------------------------

function senderLine(identity: InboxIdentity): string {
  const name = headerSafe(identity.displayName, 80).replace(/[,;:]/g, " ").trim();
  return name ? `${name} <${identity.address}>` : identity.address;
}

/**
 * The address a reply goes out from unless the owner picks another: the one
 * the conversation is using now — the address the customer last wrote to,
 * or the one the owner last answered from, whichever is more recent — then
 * the address the conversation started at, then the personal address.
 * Addresses that are no longer in the settings are skipped.
 */
export function replyIdentityFor(settings: InboxSettings, thread: InboxThread, history: InboxMessage[]): InboxIdentity {
  for (const message of [...history].reverse()) {
    const ours = findInboxIdentity(settings, message.direction === "out" ? message.fromEmail : message.toEmail);
    if (ours) return ours;
  }
  return findInboxIdentity(settings, thread.mailbox) || inboxIdentities(settings)[0];
}

/** The identity the owner chose, or the default when nothing was chosen. */
function chosenIdentity(settings: InboxSettings, from: unknown, fallback: () => InboxIdentity): InboxIdentity {
  if (from === undefined || from === null || String(from).trim() === "") return fallback();
  const identity = findInboxIdentity(settings, from);
  if (!identity) throw new InboxError(400, "Choose one of your own addresses to send from.");
  return identity;
}

function quoteFor(message: InboxMessage | undefined): { header: string; text: string } | null {
  if (!message || !message.textBody.trim()) return null;
  const when = new Date(message.createdAt);
  const stamp = Number.isFinite(when.getTime()) ? when.toUTCString().replace(" GMT", " UTC") : message.createdAt;
  const who = message.fromName ? `${message.fromName} <${message.fromEmail}>` : message.fromEmail;
  const lines = message.textBody.split("\n").slice(0, 60);
  const text = lines.join("\n").slice(0, 3000);
  return { header: `On ${stamp}, ${who} wrote:`, text };
}

export function conversationText(body: string, signature: string, quote: { header: string; text: string } | null): string {
  const parts = [body];
  if (signature.trim()) parts.push(signature.trim());
  if (quote) parts.push(`${quote.header}\n${quote.text.split("\n").map((line) => `> ${line}`).join("\n")}`);
  return parts.join("\n\n");
}

export function conversationHtml(body: string, signature: string, quote: { header: string; text: string } | null): string {
  const lines = (value: string) => escapeEmailHtml(value).replace(/\n/g, "<br>");
  const paragraphs = body.split(/\n{2,}/).map((paragraph) => `<p style="margin:0 0 14px">${lines(paragraph)}</p>`).join("");
  const signed = signature.trim() ? `<p style="margin:18px 0 0;color:#4b5563">${lines(signature.trim())}</p>` : "";
  const quoted = quote
    ? `<div style="margin:24px 0 0;padding:0 0 0 12px;border-left:3px solid #d1d5db;color:#6b7280"><p style="margin:0 0 8px">${escapeEmailHtml(quote.header)}</p><p style="margin:0">${lines(quote.text)}</p></div>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:16px;background:#ffffff"><div style="max-width:640px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">${paragraphs}${signed}${quoted}</div></body></html>`;
}

function cleanBody(value: unknown): string {
  const body = String(value ?? "").replace(/\r\n?/g, "\n").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  if (!body) throw new InboxError(400, "Write a message first.");
  if (body.length > 20_000) throw new InboxError(400, "Your message is too long (20,000 characters at most).");
  return body;
}

async function deliver(thread: InboxThread, outbound: InboxMessage, identity: InboxIdentity, input: { subject: string; text: string; html: string; headers?: Record<string, string> }): Promise<InboxMessage> {
  try {
    const result = await sendConversationEmail({
      to: thread.contactEmail,
      from: senderLine(identity),
      replyTo: identity.address,
      subject: input.subject,
      text: input.text,
      html: input.html,
      headers: input.headers,
      idempotencyKey: `inbox-${outbound.id}`,
      tags: [`inbox:${thread.id}`],
    });
    await inboxDb.markMessageSent(outbound.id, result.messageId);
  } catch (error) {
    const reason = String((error as Error)?.message || error || "The email provider did not accept the message.");
    await inboxDb.markMessageFailed(outbound.id, reason);
    throw new InboxError(502, `Your reply was not sent: ${reason.slice(0, 300)}`);
  }
  return (await inboxDb.findMessage(outbound.id))!;
}

/** Sends the owner's reply in a conversation and records it there. */
export async function sendInboxReply(input: { threadId: string; body: unknown; status?: unknown; from?: unknown; sentBy: string }): Promise<{ thread: InboxThread; message: InboxMessage }> {
  await ensureInboxSchema();
  const thread = await inboxDb.findThread(input.threadId);
  if (!thread) throw new InboxError(404, "Conversation not found.");
  if (!isValidEmailAddress(thread.contactEmail)) throw new InboxError(400, "This conversation has no valid email address to reply to.");
  const body = cleanBody(input.body);
  const settings = await getInboxSettings();
  const history = await inboxDb.listMessages(thread.id);
  const identity = chosenIdentity(settings, input.from, () => replyIdentityFor(settings, thread, history));
  const lastInbound = [...history].reverse().find((message) => message.direction === "in");
  const knownIds = history.map((message) => message.messageId).filter((id): id is string => Boolean(id));
  const headers: Record<string, string> = {};
  if (lastInbound?.messageId) headers["In-Reply-To"] = `<${lastInbound.messageId}>`;
  if (knownIds.length) headers.References = knownIds.slice(-20).map((id) => `<${id}>`).join(" ");
  const subject = replySubject(thread.subject);
  const quote = quoteFor(lastInbound);
  const outbound = await inboxDb.createMessage({
    id: inboxDb.newId("msg"), threadId: thread.id, direction: "out", fromEmail: identity.address, fromName: identity.displayName, toEmail: thread.contactEmail,
    subject, textBody: body, messageId: null, inReplyTo: lastInbound?.messageId || null, referencesHeader: knownIds.slice(-20).join(" ") || null,
    providerMessageId: null, deliveryStatus: "sending", failureReason: null, attachments: [], authSummary: "", automated: false, sentBy: input.sentBy,
  });
  const sent = await deliver(thread, outbound, identity, {
    subject,
    text: conversationText(body, identity.signature, quote),
    html: conversationHtml(body, identity.signature, quote),
    headers,
  }).finally(async () => {
    // Even a failed send is part of the conversation (shown as failed with
    // its reason), so the thread order and preview always reflect it.
    const status: InboxStatus = input.status === "resolved" || input.status === "closed" ? input.status : "open";
    await inboxDb.touchThread(thread.id, { direction: "out", at: outbound.createdAt, preview: body, unread: false, status });
  });
  return { thread: (await inboxDb.findThread(thread.id))!, message: sent };
}

/** Starts a new conversation with one person (a member or anyone else). */
export async function startInboxConversation(input: { to: unknown; subject: unknown; body: unknown; from?: unknown; sentBy: string }): Promise<{ thread: InboxThread; message: InboxMessage }> {
  await ensureInboxSchema();
  const to = normalizeEmail(input.to);
  if (!isValidEmailAddress(to)) throw new InboxError(400, "Enter a valid email address to write to.");
  const subject = headerSafe(input.subject, 200);
  if (!subject) throw new InboxError(400, "Add a subject.");
  const body = cleanBody(input.body);
  const settings = await getInboxSettings();
  if (isInboxAddress(settings, to)) throw new InboxError(400, "That is one of your own inbox addresses.");
  const identity = chosenIdentity(settings, input.from, () => inboxIdentities(settings)[0]);
  const member = await db.findUserByEmail(to);
  const thread = await inboxDb.createThread({
    id: inboxDb.newId("thr"), subject, contactEmail: to, contactName: member?.displayName || "", userId: member?.id || null,
    mailbox: identity.address, source: "outbound", category: "", status: "open", unread: false,
  });
  const outbound = await inboxDb.createMessage({
    id: inboxDb.newId("msg"), threadId: thread.id, direction: "out", fromEmail: identity.address, fromName: identity.displayName, toEmail: to,
    subject, textBody: body, messageId: null, inReplyTo: null, referencesHeader: null, providerMessageId: null, deliveryStatus: "sending",
    failureReason: null, attachments: [], authSummary: "", automated: false, sentBy: input.sentBy,
  });
  const sent = await deliver(thread, outbound, identity, {
    subject,
    text: conversationText(body, identity.signature, null),
    html: conversationHtml(body, identity.signature, null),
  }).finally(async () => {
    await inboxDb.touchThread(thread.id, { direction: "out", at: outbound.createdAt, preview: body, unread: false, status: "open" });
  });
  return { thread: (await inboxDb.findThread(thread.id))!, message: sent };
}

// ---------------------------------------------------------------------------
// Attachments, deletion, status
// ---------------------------------------------------------------------------

export async function readInboxAttachment(messageId: string, index: number): Promise<{ name: string; type: string; size: number; body: ReadableStream } | null> {
  await ensureInboxSchema();
  const message = await inboxDb.findMessage(messageId);
  const file = message?.attachments?.[index];
  if (!file || !file.key || !file.key.startsWith(ATTACHMENT_PREFIX)) return null;
  const bucket = env().AUDIO_BUCKET;
  if (!bucket) return null;
  const object = await bucket.get(file.key);
  if (!object) return null;
  return { name: file.name, type: file.type, size: file.size, body: object.body };
}

export async function deleteInboxThread(threadId: string): Promise<boolean> {
  await ensureInboxSchema();
  const thread = await inboxDb.findThread(threadId);
  if (!thread) return false;
  const { attachmentKeys } = await inboxDb.deleteThread(threadId);
  const bucket = env().AUDIO_BUCKET;
  if (bucket) for (const key of attachmentKeys) { try { await bucket.delete(key); } catch { /* best effort */ } }
  return true;
}

/** Counts for badges (Account window, Email Centre tab). Never throws. */
export async function inboxSummarySafe(): Promise<InboxSummary | null> {
  try {
    await ensureInboxSchema();
    await inboxDb.syncContactSubmissions();
    return await inboxDb.summary();
  } catch {
    return null;
  }
}

export type MxState = "cloudflare" | "other" | "none" | "unknown";
const mxCache = new Map<string, { at: number; value: { state: MxState; hosts: string[] } }>();

/** Who receives mail for a domain, from its MX records (DNS over HTTPS, cached 10 minutes). */
export async function lookupMx(domain: string): Promise<{ state: MxState; hosts: string[] }> {
  const cached = mxCache.get(domain);
  if (cached && Date.now() - cached.at < 600_000) return cached.value;
  let value: { state: MxState; hosts: string[] } = { state: "unknown", hosts: [] };
  try {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(4000),
    });
    if (response.ok) {
      const data = (await response.json()) as { Status?: number; Answer?: Array<{ type: number; data: string }> };
      const hosts = (data.Answer || []).filter((answer) => answer.type === 15).map((answer) => String(answer.data).split(/\s+/).pop()!.replace(/\.$/, "").toLowerCase()).filter(Boolean);
      value = { state: hosts.length === 0 ? "none" : hosts.some((host) => /(^|\.)mx\.cloudflare\.net$/.test(host)) ? "cloudflare" : "other", hosts };
    }
  } catch {
    value = { state: "unknown", hosts: [] };
  }
  if (value.state !== "unknown") mxCache.set(domain, { at: Date.now(), value });
  return value;
}

export async function inboxConnectionStatus() {
  await ensureInboxSchema();
  const settings = await getInboxSettings();
  const domain = settings.address.split("@")[1] || "";
  const [mx, lastInboundAt] = await Promise.all([lookupMx(domain), inboxDb.latestInboundEmailAt()]);
  const provider = String(env().EMAIL_PROVIDER || "console").trim().toLowerCase();
  return {
    address: settings.address,
    addresses: inboxIdentities(settings).map((identity) => identity.address),
    domain,
    mx,
    lastInboundAt,
    receiving: Boolean(lastInboundAt) || mx.state === "cloudflare",
    sendingConfigured: provider === "resend" && Boolean(String(env().RESEND_API_KEY || "").trim()),
    forwardEmail: settings.forwardEnabled ? settings.forwardEmail : "",
    alertEmail: settings.alertsEnabled ? settings.alertEmail : "",
  };
}

export { previewOf };
