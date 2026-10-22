/**
 * The workspace repository: a member's projects, on the server, so every
 * device signed in to the membership sees the same work.
 *
 * Before this existed, a project was a localStorage entry in the browser that
 * created it. A second computer showed an empty studio, and each machine could
 * render and download its own way through the plan's allowance with nothing
 * tying the two together. The browser still owns the live copy (the studio
 * must work offline and instantly); this is the shared record behind it.
 *
 * Authorization is per account, not per project: a document is only ever read
 * or written for `auth.user.id`, so one member can never see another's work.
 * The document key namespace is checked against the shared registry in
 * src/lib/workspace-keys.ts — credentials (`scenering_customer_api_keys`), the
 * session token and this browser's identity are deliberately not synced.
 */
import type { Express, NextFunction, Request, Response } from "express";
import { db } from "../src/db.ts";
import { getPlanConfig } from "../src/config/plans.ts";
import { MAX_SYNC_DOCUMENT_BYTES, isLocalOnlyKey, isSyncedWorkspaceKey } from "../src/lib/workspace-keys.ts";
import { platformRateLimit, requirePlatformUser } from "./platform.ts";

const MAX_DOCUMENTS_PER_REQUEST = 200;
const MAX_WORKSPACE_BYTES = 8 * 1024 * 1024;

type Auth = { user: { id: string }; plan: string };

function apiDocument(document: { key: string; body: string; revision: number; updatedAt: string; deleted: boolean }) {
  return { key: document.key, body: document.body, revision: document.revision, updatedAt: document.updatedAt, deleted: document.deleted };
}

function validKey(key: unknown): key is string {
  return typeof key === "string" && key.length >= 8 && key.length <= 220 && /^scenering_[A-Za-z0-9_.:\-]+$/.test(key) && isSyncedWorkspaceKey(key) && !isLocalOnlyKey(key);
}

function handler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    fn(req, res).catch(next);
  };
}

export function registerWorkspaceRoutes(app: Express) {
  /* The whole workspace, for a device that has just opened the studio. */
  app.get("/api/workspace", requirePlatformUser, platformRateLimit("workspace-read", 240, 3600000), handler(async (req, res) => {
    const { user, plan } = (req as any).auth as Auth;
    try {
      const documents = await db.listWorkspaceDocuments(user.id);
      const config = getPlanConfig(plan);
      return res.json({
        documents: documents.map(apiDocument),
        limits: { maxConcurrentDevices: config.limits.maxConcurrentDevices },
      });
    } catch (error: any) {
      return res.status(500).json({ error: "Your workspace could not be loaded." });
    }
  }));

  /* Push what changed here, take back anything newer from elsewhere. */
  app.post("/api/workspace/sync", requirePlatformUser, platformRateLimit("workspace-sync", 600, 3600000), handler(async (req, res) => {
    const { user } = (req as any).auth as Auth;
    const deviceId = String(req.headers["x-scenering-device"] || "").slice(0, 80) || null;
    const incoming = Array.isArray(req.body?.documents) ? req.body.documents : null;
    if (!incoming) return res.status(400).json({ error: "documents must be an array" });
    if (incoming.length > MAX_DOCUMENTS_PER_REQUEST) return res.status(413).json({ error: "Too many documents in one request." });

    const accepted: Array<{ key: string; revision: number }> = [];
    const conflicts: Array<{ key: string; document: ReturnType<typeof apiDocument> | null }> = [];
    let bytes = 0;

    for (const candidate of incoming) {
      const key = candidate?.key;
      if (!validKey(key)) continue;
      const deleted = candidate?.deleted === true;
      const body = deleted ? "" : typeof candidate?.body === "string" ? candidate.body : null;
      if (!deleted && body === null) continue;
      bytes += (body || "").length;
      if (bytes > MAX_WORKSPACE_BYTES) return res.status(413).json({ error: "This workspace update is too large." });
      if (!deleted && (body as string).length > MAX_SYNC_DOCUMENT_BYTES) {
        // Too big to carry: it stays on the device that made it. Reported as a
        // conflict with no document so the client stops retrying it.
        conflicts.push({ key, document: null });
        continue;
      }
      const baseRevision = Number.isFinite(Number(candidate?.baseRevision)) ? Math.max(0, Math.trunc(Number(candidate.baseRevision))) : 0;
      const result = await db.putWorkspaceDocumentIfRevision(user.id, key, body ?? "", baseRevision, { deleted, deviceId });
      if (result.ok && result.document) accepted.push({ key, revision: result.document.revision });
      else conflicts.push({ key, document: result.document ? apiDocument(result.document) : null });
    }

    return res.json({ accepted, conflicts });
  }));

  /* Forget this account's workspace — offered from the account panel, and
     used when an owner deliberately starts over. */
  app.post("/api/workspace/reset", requirePlatformUser, platformRateLimit("workspace-reset", 3, 3600000), handler(async (req, res) => {
    const { user } = (req as any).auth as Auth;
    await db.deleteWorkspaceForUser(user.id);
    return res.json({ ok: true });
  }));
}
