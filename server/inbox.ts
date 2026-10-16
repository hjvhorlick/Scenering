import type { Express, NextFunction, Request, Response } from "express";
import { inboxDb, type InboxFilter, type InboxMessage } from "../src/inbox-db.ts";
import { INBOX_STATUSES, type InboxStatus } from "../src/inbox-schema.ts";
import {
  deleteInboxThread, ensureInboxSchema, inboxConnectionStatus, InboxError, readInboxAttachment, replyIdentityFor, sendInboxReply, startInboxConversation,
} from "./inbox-core.ts";
import { getInboxSettings, headerSafe, saveInboxSettings, validateInboxSettings } from "./inbox-settings.ts";
import { adminMemberSummary, platformRateLimit, requirePlatformAdmin } from "./platform.ts";

/**
 * The Email Centre inbox API: /api/admin/inbox/*.
 *
 * Every route is behind requirePlatformAdmin (401 without a session, 403
 * for anyone but the owner administrator) and the KV rate limiter. The
 * logic lives in server/inbox-core.ts; this file only validates input and
 * shapes responses. Attachment storage keys never leave the server.
 */

const FILTERS: readonly InboxFilter[] = ["needs_reply", "all", ...INBOX_STATUSES];

function handler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    fn(req, res).catch((error) => {
      if (error instanceof InboxError) return res.status(error.status).json({ error: error.message });
      next(error);
    });
  };
}

const adminIdOf = (req: Request): string => String((req as any).auth?.user?.id || "");

/** The message shape the admin UI receives: no storage keys, no raw headers. */
function apiMessage(message: InboxMessage) {
  return {
    id: message.id,
    direction: message.direction,
    fromEmail: message.fromEmail,
    fromName: message.fromName,
    toEmail: message.toEmail,
    subject: message.subject,
    textBody: message.textBody,
    deliveryStatus: message.deliveryStatus,
    failureReason: message.failureReason,
    attachments: message.attachments.map((file, index) => ({ index, name: file.name, type: file.type, size: file.size, available: Boolean(file.key), skipped: file.skipped || null })),
    authSummary: message.authSummary,
    automated: message.automated,
    createdAt: message.createdAt,
  };
}

function statusFrom(value: unknown): InboxStatus | null {
  return typeof value === "string" && (INBOX_STATUSES as readonly string[]).includes(value) ? (value as InboxStatus) : null;
}

/** RFC 6266 filename: an ASCII fallback plus the UTF-8 original. */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "attachment";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function registerInboxRoutes(app: Express) {
  const admin = requirePlatformAdmin;
  const readLimit = platformRateLimit("admin-inbox-read", 900, 3600000);
  const writeLimit = platformRateLimit("admin-inbox-write", 300, 3600000);
  const sendLimit = platformRateLimit("admin-inbox-send", 120, 3600000);

  app.get("/api/admin/inbox/summary", admin, readLimit, handler(async (_req, res) => {
    await ensureInboxSchema();
    await inboxDb.syncContactSubmissions();
    res.json({ summary: await inboxDb.summary() });
  }));

  app.get("/api/admin/inbox/threads", admin, readLimit, handler(async (req, res) => {
    await ensureInboxSchema();
    await inboxDb.syncContactSubmissions();
    const filter = FILTERS.includes(String(req.query.filter) as InboxFilter) ? (String(req.query.filter) as InboxFilter) : "needs_reply";
    const limit = Math.min(100, Math.max(1, Math.trunc(Number(req.query.limit) || 50)));
    const offset = Math.max(0, Math.trunc(Number(req.query.offset) || 0));
    const threads = await inboxDb.listThreads({ filter, query: String(req.query.q || ""), limit: limit + 1, offset });
    res.json({ threads: threads.slice(0, limit), hasMore: threads.length > limit, counts: await inboxDb.countsByFilter(), filter });
  }));

  app.get("/api/admin/inbox/threads/:id", admin, readLimit, handler(async (req, res) => {
    await ensureInboxSchema();
    const thread = await inboxDb.findThread(String(req.params.id));
    if (!thread) return res.status(404).json({ error: "Conversation not found." });
    if (thread.unread) await inboxDb.setThreadUnread(thread.id, false);
    const messages = await inboxDb.listMessages(thread.id);
    const member = thread.userId ? await adminMemberSummary(thread.userId) : null;
    // The address the reply box starts on (the owner can pick another).
    const replyFrom = replyIdentityFor(await getInboxSettings(), thread, messages).address;
    res.json({ thread: { ...thread, unread: false }, messages: messages.map(apiMessage), member, replyFrom });
  }));

  app.put("/api/admin/inbox/threads/:id", admin, writeLimit, handler(async (req, res) => {
    await ensureInboxSchema();
    const thread = await inboxDb.findThread(String(req.params.id));
    if (!thread) return res.status(404).json({ error: "Conversation not found." });
    if (req.body?.status !== undefined) {
      const status = statusFrom(req.body.status);
      if (!status) return res.status(400).json({ error: "Choose a valid status." });
      await inboxDb.setThreadStatus(thread.id, status);
    }
    if (req.body?.unread !== undefined) await inboxDb.setThreadUnread(thread.id, Boolean(req.body.unread));
    res.json({ thread: await inboxDb.findThread(thread.id) });
  }));

  app.delete("/api/admin/inbox/threads/:id", admin, writeLimit, handler(async (req, res) => {
    const deleted = await deleteInboxThread(String(req.params.id));
    if (!deleted) return res.status(404).json({ error: "Conversation not found." });
    res.json({ deleted: true });
  }));

  app.post("/api/admin/inbox/threads/:id/reply", admin, sendLimit, handler(async (req, res) => {
    const result = await sendInboxReply({ threadId: String(req.params.id), body: req.body?.body, status: req.body?.status, from: req.body?.from, sentBy: adminIdOf(req) });
    res.status(201).json({ thread: result.thread, message: apiMessage(result.message) });
  }));

  app.post("/api/admin/inbox/compose", admin, sendLimit, handler(async (req, res) => {
    const result = await startInboxConversation({ to: req.body?.to, subject: req.body?.subject, body: req.body?.body, from: req.body?.from, sentBy: adminIdOf(req) });
    res.status(201).json({ thread: result.thread, message: apiMessage(result.message) });
  }));

  app.get("/api/admin/inbox/attachments/:messageId/:index", admin, readLimit, handler(async (req, res) => {
    const file = await readInboxAttachment(String(req.params.messageId), Math.trunc(Number(req.params.index)));
    if (!file) return res.status(404).json({ error: "This attachment is not available." });
    const bytes = Buffer.from(await new Response(file.body).arrayBuffer());
    // Always a download, never rendered: an HTML or SVG file from a
    // stranger must not run on the application's origin.
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", contentDisposition(headerSafe(file.name, 180) || "attachment"));
    res.setHeader("Content-Length", String(bytes.byteLength));
    res.setHeader("Cache-Control", "private, no-store");
    res.end(bytes);
  }));

  app.get("/api/admin/inbox/settings", admin, readLimit, handler(async (_req, res) => {
    res.json({ settings: await getInboxSettings({ fresh: true }) });
  }));

  app.put("/api/admin/inbox/settings", admin, writeLimit, handler(async (req, res) => {
    const result = validateInboxSettings(req.body || {}, await getInboxSettings({ fresh: true }));
    if ("error" in result) return res.status(400).json({ error: result.error });
    res.json({ settings: await saveInboxSettings(result.settings) });
  }));

  app.get("/api/admin/inbox/status", admin, readLimit, handler(async (_req, res) => {
    res.json({ status: await inboxConnectionStatus() });
  }));

  app.get("/api/admin/inbox/saved-replies", admin, readLimit, handler(async (_req, res) => {
    await ensureInboxSchema();
    res.json({ replies: await inboxDb.listSavedReplies() });
  }));

  const savedReplyInput = (body: any): { title: string; body: string } | { error: string } => {
    const title = headerSafe(body?.title, 80);
    const text = String(body?.body ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 10_000);
    if (!title) return { error: "Give the saved reply a short title." };
    if (!text) return { error: "Write the text of the saved reply." };
    return { title, body: text };
  };

  app.post("/api/admin/inbox/saved-replies", admin, writeLimit, handler(async (req, res) => {
    await ensureInboxSchema();
    const input = savedReplyInput(req.body);
    if ("error" in input) return res.status(400).json({ error: input.error });
    res.status(201).json({ reply: await inboxDb.createSavedReply(input.title, input.body) });
  }));

  app.put("/api/admin/inbox/saved-replies/:id", admin, writeLimit, handler(async (req, res) => {
    await ensureInboxSchema();
    if (!(await inboxDb.findSavedReply(String(req.params.id)))) return res.status(404).json({ error: "Saved reply not found." });
    const input = savedReplyInput(req.body);
    if ("error" in input) return res.status(400).json({ error: input.error });
    res.json({ reply: await inboxDb.updateSavedReply(String(req.params.id), input.title, input.body) });
  }));

  app.delete("/api/admin/inbox/saved-replies/:id", admin, writeLimit, handler(async (req, res) => {
    await ensureInboxSchema();
    await inboxDb.deleteSavedReply(String(req.params.id));
    res.json({ deleted: true });
  }));
}
