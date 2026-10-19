import { env } from "./env";
import { INBOX_SCHEMA_STATEMENTS, INBOX_STATUSES, type InboxStatus } from "./inbox-schema.ts";

/**
 * Data access for the Email Centre inbox (see src/inbox-schema.ts).
 *
 * Kept beside src/db.ts rather than inside it so the inbox stays one
 * readable unit; it follows the same conventions: plain SQL through the D1
 * binding, ISO-8601 timestamps written by the application, prefixed random
 * ids, and row mappers that turn snake_case rows into camelCase objects.
 */

export type InboxDirection = "in" | "out";
export type InboxSource = "email" | "contact_form" | "outbound";
export type InboxFilter = "needs_reply" | "all" | InboxStatus;
export type InboxDeliveryStatus = "received" | "sending" | "sent" | "delivered" | "bounced" | "failed" | "complained";

export interface InboxAttachment {
  name: string;
  type: string;
  size: number;
  /** Storage key in R2, or null when the file was not kept (too large, no bucket). */
  key: string | null;
  skipped?: string;
  /** Content-ID for inline HTML images (cid:...), when present. */
  cid?: string;
  /** True when the file is an inline image referenced by the HTML body. */
  inline?: boolean;
}

export interface InboxThread {
  id: string;
  subject: string;
  contactEmail: string;
  contactName: string;
  userId: string | null;
  mailbox: string;
  source: InboxSource;
  category: string;
  status: InboxStatus;
  unread: boolean;
  messageCount: number;
  lastMessageAt: string;
  lastDirection: InboxDirection;
  lastPreview: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboxMessage {
  id: string;
  threadId: string;
  direction: InboxDirection;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  messageId: string | null;
  inReplyTo: string | null;
  referencesHeader: string | null;
  providerMessageId: string | null;
  deliveryStatus: InboxDeliveryStatus;
  failureReason: string | null;
  attachments: InboxAttachment[];
  authSummary: string;
  automated: boolean;
  sentBy: string | null;
  createdAt: string;
}

export interface InboxSavedReply {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboxSummary {
  needsReply: number;
  unread: number;
  total: number;
  spam: number;
}

/** The address a contact-form message is "sent to" in the message table. */
export const CONTACT_FORM_MAILBOX = "contact-form";

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
const D1 = () => env().DB;

/** One line of text for list rows: whitespace collapsed, 160 characters. */
export function previewOf(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function parseAttachments(value: unknown): InboxAttachment[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
  } catch {
    return [];
  }
}

function isStatus(value: unknown): value is InboxStatus {
  return typeof value === "string" && (INBOX_STATUSES as readonly string[]).includes(value);
}

function rowToThread(row: any): InboxThread {
  return {
    id: row.id,
    subject: row.subject,
    contactEmail: row.contact_email,
    contactName: row.contact_name || "",
    userId: row.user_id || null,
    mailbox: row.mailbox || "",
    source: row.source,
    category: row.category || "",
    status: isStatus(row.status) ? row.status : "new",
    unread: Number(row.unread) === 1,
    messageCount: Number(row.message_count) || 0,
    lastMessageAt: row.last_message_at,
    lastDirection: row.last_direction === "out" ? "out" : "in",
    lastPreview: row.last_preview || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: any): InboxMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    direction: row.direction === "out" ? "out" : "in",
    fromEmail: row.from_email,
    fromName: row.from_name || "",
    toEmail: row.to_email || "",
    subject: row.subject || "",
    textBody: row.text_body || "",
    htmlBody: row.html_body || "",
    messageId: row.message_id || null,
    inReplyTo: row.in_reply_to || null,
    referencesHeader: row.references_header || null,
    providerMessageId: row.provider_message_id || null,
    deliveryStatus: row.delivery_status || "received",
    failureReason: row.failure_reason || null,
    attachments: parseAttachments(row.attachments),
    authSummary: row.auth_summary || "",
    automated: Number(row.automated) === 1,
    sentBy: row.sent_by || null,
    createdAt: row.created_at,
  };
}

function rowToSavedReply(row: any): InboxSavedReply {
  return { id: row.id, title: row.title, body: row.body, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** LIKE pattern with the wildcard characters in the user's text escaped. */
function likePattern(query: string): string {
  return `%${String(query).replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/** How far each delivery state is along the road; a state only moves forward. */
const DELIVERY_RANK: Record<string, number> = { received: 0, sending: 0, sent: 1, delivered: 2, bounced: 3, failed: 3, complained: 3 };

export const inboxDb = {
  newId,

  /** Creates the inbox tables if they are missing (idempotent). */
  async ensureSchema(): Promise<void> {
    const db = D1();
    const statements = INBOX_SCHEMA_STATEMENTS.map((sql) => db.prepare(sql));
    try {
      await db.batch(statements);
    } catch {
      for (const sql of INBOX_SCHEMA_STATEMENTS) await db.prepare(sql).run();
    }
    try {
      await db.prepare("ALTER TABLE inbox_messages ADD COLUMN html_body TEXT NOT NULL DEFAULT ''").run();
    } catch {
      /* column already exists */
    }
  },

  /**
   * Brings every stored contact-form message into the inbox.
   *
   * New messages are written to both tables as they arrive; this catches the
   * ones that came in before the inbox existed, or whose inbox write failed.
   * Thread and message ids are derived from the contact row, so nothing is
   * ever imported twice, and deleting a conversation deletes its contact
   * row too, so a deleted conversation never comes back.
   */
  async syncContactSubmissions(): Promise<void> {
    const db = D1();
    await db.prepare(
      `INSERT OR IGNORE INTO inbox_threads (id, subject, contact_email, contact_name, user_id, mailbox, source, category, status, unread, message_count, last_message_at, last_direction, last_preview, created_at, updated_at)
       SELECT 'thr_' || c.id, c.subject, lower(trim(c.email)), c.name,
              (SELECT u.id FROM users u WHERE u.email = lower(trim(c.email)) LIMIT 1),
              '${CONTACT_FORM_MAILBOX}', 'contact_form', c.category,
              CASE WHEN c.status IN ('new', 'open', 'resolved', 'closed') THEN c.status ELSE 'new' END,
              CASE WHEN c.status IN ('open', 'resolved', 'closed') THEN 0 ELSE 1 END,
              1, c.created_at, 'in', substr(trim(replace(replace(c.message, char(13), ' '), char(10), ' ')), 1, 160), c.created_at, c.created_at
         FROM contact_submissions c
        WHERE NOT EXISTS (SELECT 1 FROM inbox_threads t WHERE t.id = 'thr_' || c.id)`
    ).run();
    await db.prepare(
      `INSERT OR IGNORE INTO inbox_messages (id, thread_id, direction, from_email, from_name, to_email, subject, text_body, message_id, delivery_status, created_at)
       SELECT 'msg_' || c.id, 'thr_' || c.id, 'in', lower(trim(c.email)), c.name, '${CONTACT_FORM_MAILBOX}', c.subject, c.message,
              'contact-' || c.id || '@scenering.com', 'received', c.created_at
         FROM contact_submissions c
        WHERE EXISTS (SELECT 1 FROM inbox_threads t WHERE t.id = 'thr_' || c.id)
          AND NOT EXISTS (SELECT 1 FROM inbox_messages m WHERE m.id = 'msg_' || c.id)`
    ).run();
  },

  async createThread(row: Omit<InboxThread, "createdAt" | "updatedAt" | "messageCount" | "lastPreview" | "lastDirection" | "lastMessageAt" | "unread"> & { createdAt?: string; unread?: boolean }): Promise<InboxThread> {
    const stamp = row.createdAt || nowIso();
    await D1().prepare(
      `INSERT OR IGNORE INTO inbox_threads (id, subject, contact_email, contact_name, user_id, mailbox, source, category, status, unread, message_count, last_message_at, last_direction, last_preview, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'in', '', ?, ?)`
    ).bind(row.id, row.subject, row.contactEmail, row.contactName || "", row.userId, row.mailbox || "", row.source, row.category || "", row.status, row.unread === false ? 0 : 1, stamp, stamp, stamp).run();
    return (await inboxDb.findThread(row.id))!;
  },

  async createMessage(row: Omit<InboxMessage, "createdAt" | "htmlBody"> & { htmlBody?: string; createdAt?: string }): Promise<InboxMessage> {
    const stamp = row.createdAt || nowIso();
    await D1().prepare(
      `INSERT OR IGNORE INTO inbox_messages (id, thread_id, direction, from_email, from_name, to_email, subject, text_body, html_body, message_id, in_reply_to, references_header, provider_message_id, delivery_status, failure_reason, attachments, auth_summary, automated, sent_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      row.id, row.threadId, row.direction, row.fromEmail, row.fromName || "", row.toEmail || "", row.subject || "", row.textBody || "", row.htmlBody || "",
      row.messageId, row.inReplyTo, row.referencesHeader, row.providerMessageId, row.deliveryStatus, row.failureReason,
      JSON.stringify(row.attachments || []), row.authSummary || "", row.automated ? 1 : 0, row.sentBy, stamp,
    ).run();
    return (await inboxDb.findMessage(row.id))!;
  },

  /** Records that a message joined the conversation: count, preview, order, unread and (optionally) status. */
  async touchThread(threadId: string, update: { direction: InboxDirection; at: string; preview: string; unread: boolean; status?: InboxStatus }): Promise<void> {
    await D1().prepare(
      `UPDATE inbox_threads
          SET message_count = (SELECT COUNT(*) FROM inbox_messages WHERE thread_id = ?),
              last_message_at = CASE WHEN ? > last_message_at THEN ? ELSE last_message_at END,
              last_direction = ?, last_preview = ?, unread = ?,
              status = COALESCE(?, status), updated_at = ?
        WHERE id = ?`
    ).bind(threadId, update.at, update.at, update.direction, previewOf(update.preview), update.unread ? 1 : 0, update.status ?? null, nowIso(), threadId).run();
  },

  async findThread(id: string): Promise<InboxThread | null> {
    const row = await D1().prepare("SELECT * FROM inbox_threads WHERE id = ?").bind(id).first();
    return row ? rowToThread(row) : null;
  },

  async listThreads(options: { filter: InboxFilter; query?: string; limit: number; offset: number }): Promise<InboxThread[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (options.filter === "needs_reply") where.push("status IN ('new', 'open') AND last_direction = 'in'");
    else if (options.filter === "all") where.push("status <> 'spam'");
    else { where.push("status = ?"); values.push(options.filter); }
    const query = String(options.query || "").trim().slice(0, 200);
    if (query) {
      const pattern = likePattern(query.toLowerCase());
      where.push(`(lower(subject) LIKE ? ESCAPE '\\' OR lower(contact_email) LIKE ? ESCAPE '\\' OR lower(contact_name) LIKE ? ESCAPE '\\'
              OR id IN (SELECT thread_id FROM inbox_messages WHERE lower(text_body) LIKE ? ESCAPE '\\'))`);
      values.push(pattern, pattern, pattern, pattern);
    }
    const result = await D1().prepare(
      `SELECT * FROM inbox_threads WHERE ${where.join(" AND ")} ORDER BY last_message_at DESC, id DESC LIMIT ? OFFSET ?`
    ).bind(...values, options.limit, options.offset).all();
    return (result.results || []).map(rowToThread);
  },

  async countsByFilter(): Promise<Record<InboxFilter, number>> {
    const result = await D1().prepare("SELECT status, COUNT(*) AS n FROM inbox_threads GROUP BY status").all();
    const counts = { needs_reply: 0, all: 0, new: 0, open: 0, resolved: 0, closed: 0, spam: 0 } as Record<InboxFilter, number>;
    for (const row of (result.results || []) as any[]) {
      if (isStatus(row.status)) counts[row.status as InboxStatus] = Number(row.n) || 0;
      if (row.status !== "spam") counts.all += Number(row.n) || 0;
    }
    const waiting = await D1().prepare("SELECT COUNT(*) AS n FROM inbox_threads WHERE status IN ('new', 'open') AND last_direction = 'in'").first();
    counts.needs_reply = Number((waiting as any)?.n) || 0;
    return counts;
  },

  async summary(): Promise<InboxSummary> {
    const row: any = await D1().prepare(
      `SELECT
         SUM(CASE WHEN status IN ('new', 'open') AND last_direction = 'in' THEN 1 ELSE 0 END) AS needs_reply,
         SUM(CASE WHEN unread = 1 AND status <> 'spam' THEN 1 ELSE 0 END) AS unread,
         SUM(CASE WHEN status <> 'spam' THEN 1 ELSE 0 END) AS total,
         SUM(CASE WHEN status = 'spam' THEN 1 ELSE 0 END) AS spam
       FROM inbox_threads`
    ).first();
    return { needsReply: Number(row?.needs_reply) || 0, unread: Number(row?.unread) || 0, total: Number(row?.total) || 0, spam: Number(row?.spam) || 0 };
  },

  /** The conversation a reply belongs to, found through the Message-IDs it quotes. */
  async findThreadIdByMessageIds(messageIds: string[]): Promise<string | null> {
    const ids = Array.from(new Set(messageIds.filter(Boolean))).slice(0, 40);
    if (!ids.length) return null;
    const row: any = await D1().prepare(
      `SELECT m.thread_id FROM inbox_messages m JOIN inbox_threads t ON t.id = m.thread_id
        WHERE m.message_id IN (${ids.map(() => "?").join(", ")}) ORDER BY m.created_at DESC LIMIT 1`
    ).bind(...ids).first();
    return row?.thread_id || null;
  },

  async recentThreadsForContact(contactEmail: string, sinceIso: string): Promise<InboxThread[]> {
    const result = await D1().prepare(
      "SELECT * FROM inbox_threads WHERE contact_email = ? AND last_message_at >= ? ORDER BY last_message_at DESC LIMIT 25"
    ).bind(contactEmail, sinceIso).all();
    return (result.results || []).map(rowToThread);
  },

  async listMessages(threadId: string): Promise<InboxMessage[]> {
    const result = await D1().prepare("SELECT * FROM inbox_messages WHERE thread_id = ? ORDER BY created_at ASC, id ASC").bind(threadId).all();
    return (result.results || []).map(rowToMessage);
  },

  async findMessage(id: string): Promise<InboxMessage | null> {
    const row = await D1().prepare("SELECT * FROM inbox_messages WHERE id = ?").bind(id).first();
    return row ? rowToMessage(row) : null;
  },

  async findMessageByProviderId(providerMessageId: string): Promise<InboxMessage | null> {
    if (!providerMessageId) return null;
    const row = await D1().prepare("SELECT * FROM inbox_messages WHERE provider_message_id = ? LIMIT 1").bind(providerMessageId).first();
    return row ? rowToMessage(row) : null;
  },

  async markMessageSent(id: string, providerMessageId: string | null): Promise<void> {
    await D1().prepare("UPDATE inbox_messages SET delivery_status = 'sent', provider_message_id = ?, failure_reason = NULL WHERE id = ?").bind(providerMessageId, id).run();
  },

  async markMessageFailed(id: string, reason: string): Promise<void> {
    await D1().prepare("UPDATE inbox_messages SET delivery_status = 'failed', failure_reason = ? WHERE id = ?").bind(reason.slice(0, 500), id).run();
  },

  /** Applies a provider delivery event; a message's state only ever moves forward. */
  async advanceDeliveryByProviderId(providerMessageId: string, status: InboxDeliveryStatus, reason: string | null): Promise<boolean> {
    const message = await inboxDb.findMessageByProviderId(providerMessageId);
    if (!message) return false;
    if ((DELIVERY_RANK[status] ?? 0) <= (DELIVERY_RANK[message.deliveryStatus] ?? 0)) return true;
    await D1().prepare("UPDATE inbox_messages SET delivery_status = ?, failure_reason = COALESCE(?, failure_reason) WHERE id = ?").bind(status, reason, message.id).run();
    return true;
  },

  async setThreadStatus(id: string, status: InboxStatus): Promise<void> {
    await D1().prepare("UPDATE inbox_threads SET status = ?, updated_at = ? WHERE id = ?").bind(status, nowIso(), id).run();
  },

  async setThreadUnread(id: string, unread: boolean): Promise<void> {
    await D1().prepare("UPDATE inbox_threads SET unread = ?, updated_at = ? WHERE id = ?").bind(unread ? 1 : 0, nowIso(), id).run();
  },

  async linkThreadsToUser(contactEmail: string, userId: string): Promise<void> {
    await D1().prepare("UPDATE inbox_threads SET user_id = ? WHERE contact_email = ? AND user_id IS NULL").bind(userId, contactEmail).run();
  },

  /**
   * Deletes a conversation permanently and returns the stored attachment
   * keys so the caller can remove the files. A contact-form conversation
   * also removes its original contact row, which is what keeps the
   * contact-form sync from bringing it back.
   */
  async deleteThread(id: string): Promise<{ attachmentKeys: string[] }> {
    const messages = await inboxDb.listMessages(id);
    const attachmentKeys = messages.flatMap((message) => message.attachments.map((file) => file.key).filter((key): key is string => Boolean(key)));
    const db = D1();
    if (id.startsWith("thr_contact_")) await db.prepare("DELETE FROM contact_submissions WHERE id = ?").bind(id.slice(4)).run();
    await db.prepare("DELETE FROM inbox_messages WHERE thread_id = ?").bind(id).run();
    await db.prepare("DELETE FROM inbox_threads WHERE id = ?").bind(id).run();
    return { attachmentKeys };
  },

  /** Inbound messages from one sender since a moment (flood protection). */
  async countInboundFromSince(fromEmail: string, sinceIso: string): Promise<number> {
    const row: any = await D1().prepare("SELECT COUNT(*) AS n FROM inbox_messages WHERE direction = 'in' AND from_email = ? AND created_at >= ?").bind(fromEmail, sinceIso).first();
    return Number(row?.n) || 0;
  },

  async countInboundSince(sinceIso: string): Promise<number> {
    const row: any = await D1().prepare("SELECT COUNT(*) AS n FROM inbox_messages WHERE direction = 'in' AND created_at >= ?").bind(sinceIso).first();
    return Number(row?.n) || 0;
  },

  /** When the last real email (not a contact-form message) arrived. */
  async latestInboundEmailAt(): Promise<string | null> {
    const row: any = await D1().prepare(`SELECT MAX(created_at) AS at FROM inbox_messages WHERE direction = 'in' AND to_email <> '${CONTACT_FORM_MAILBOX}'`).first();
    return row?.at || null;
  },

  async listSavedReplies(): Promise<InboxSavedReply[]> {
    const result = await D1().prepare("SELECT * FROM inbox_saved_replies ORDER BY lower(title) ASC").all();
    return (result.results || []).map(rowToSavedReply);
  },

  async findSavedReply(id: string): Promise<InboxSavedReply | null> {
    const row = await D1().prepare("SELECT * FROM inbox_saved_replies WHERE id = ?").bind(id).first();
    return row ? rowToSavedReply(row) : null;
  },

  async createSavedReply(title: string, body: string): Promise<InboxSavedReply> {
    const stamp = nowIso();
    const id = newId("reply");
    await D1().prepare("INSERT INTO inbox_saved_replies (id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(id, title, body, stamp, stamp).run();
    return (await inboxDb.findSavedReply(id))!;
  },

  async updateSavedReply(id: string, title: string, body: string): Promise<InboxSavedReply | null> {
    await D1().prepare("UPDATE inbox_saved_replies SET title = ?, body = ?, updated_at = ? WHERE id = ?").bind(title, body, nowIso(), id).run();
    return inboxDb.findSavedReply(id);
  },

  async deleteSavedReply(id: string): Promise<void> {
    await D1().prepare("DELETE FROM inbox_saved_replies WHERE id = ?").bind(id).run();
  },
};
