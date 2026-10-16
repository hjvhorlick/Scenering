import type { Express, NextFunction, Request, Response } from "express";
import { db } from "../src/db.ts";
import { giftsDb } from "../src/gifts-db.ts";
import { giftLengthLabel } from "../src/lib/gift-lengths.ts";
import { isMemberFilter, isMemberSort, membersDb } from "../src/members-db.ts";
import { apiGiftCode, ensureGiftSchema, generateGiftCode, validateGiftCodeEdit, validateNewGiftCode } from "./gift-codes.ts";
import { ensureInboxSchema } from "./inbox-core.ts";
import { adminMemberSummary, platformRateLimit, requirePlatformAdmin } from "./platform.ts";

/**
 * The Email Centre's Members and Gifts API:
 *   /api/admin/members        who has joined, their plan and activity
 *   /api/admin/gift-codes     codes that give free time, and their results
 *
 * Every route is behind requirePlatformAdmin (401 without a session, 403
 * for anyone but the owner administrator) and the KV rate limiter. Giving
 * a gift to one member reuses /api/admin/complimentary-memberships, and
 * using a code is the existing /api/complimentary-codes/redeem.
 */

function handler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    fn(req, res).catch(next);
  };
}

const adminIdOf = (req: Request): string => String((req as any).auth?.user?.id || "");

/** Monday 00:00 UTC, when weekly download allowances restart. */
function weekStart(now: Date): Date {
  const start = new Date(now.getTime());
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

const PAGE_SIZE = 50;

export function registerMembersRoutes(app: Express) {
  const admin = requirePlatformAdmin;
  const readLimit = platformRateLimit("admin-members-read", 900, 3600000);
  const writeLimit = platformRateLimit("admin-members-write", 300, 3600000);

  app.get("/api/admin/members", admin, readLimit, handler(async (req, res) => {
    const filter = isMemberFilter(req.query.filter) ? req.query.filter : "all";
    const sort = isMemberSort(req.query.sort) ? req.query.sort : "newest";
    const offset = Math.max(0, Math.trunc(Number(req.query.offset) || 0));
    const now = new Date();
    await db.expireStaleComplimentaryGrants();
    const [rows, counts] = await Promise.all([
      membersDb.list({ filter, query: String(req.query.q || ""), sort, limit: PAGE_SIZE + 1, offset, now }),
      membersDb.counts(now),
    ]);
    res.json({ members: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, counts });
  }));

  app.get("/api/admin/members/:id", admin, readLimit, handler(async (req, res) => {
    const user = await db.findUserById(String(req.params.id));
    if (!user || user.role === "admin") return res.status(404).json({ error: "Member not found." });
    await ensureGiftSchema();
    await ensureInboxSchema();
    const now = new Date();
    const [summary, subscription, preference, activity, grants, deliveries, threads] = await Promise.all([
      adminMemberSummary(user.id),
      db.findActiveSubscriptionByUserId(user.id),
      db.findEmailPreference(user.id),
      membersDb.activity(user.id, weekStart(now).toISOString()),
      membersDb.grants(user.id),
      membersDb.deliveries(user.id),
      membersDb.threads(user.id, user.email),
    ]);
    const codes = await giftsDb.labelsFor(grants.map((grant) => grant.accessCodeId || ""));
    res.json({
      member: summary,
      subscription: subscription ? {
        planId: subscription.planId, interval: subscription.billingInterval, status: subscription.status,
        renewsAt: subscription.currentPeriodEnd, endsAt: subscription.expiresAt, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd, startedAt: subscription.createdAt,
      } : null,
      consent: preference ? { given: preference.marketingConsent, at: preference.consentTimestamp, source: preference.consentSource } : null,
      activity,
      gifts: grants.map((grant) => ({
        ...grant,
        active: grant.status === "active" && grant.endsAt > now.toISOString(),
        code: grant.accessCodeId ? codes.get(grant.accessCodeId) || null : null,
      })),
      emails: deliveries,
      conversations: threads,
    });
  }));

  app.get("/api/admin/gift-codes", admin, readLimit, handler(async (_req, res) => {
    await ensureGiftSchema();
    const now = new Date();
    const codes = await giftsDb.listWithResults();
    res.json({ codes: codes.map(({ results, ...code }) => apiGiftCode(code, results, now)) });
  }));

  app.post("/api/admin/gift-codes", admin, writeLimit, handler(async (req, res) => {
    await ensureGiftSchema();
    const parsed = validateNewGiftCode(req.body);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    const { code: chosen, ...rest } = parsed.value;
    const label = rest.label || `${rest.planId === "sceneforge" ? "SceneForge" : "SceneFlow"} for ${giftLengthLabel(rest.period)}`;
    // An own code must be free; a made-up one is retried on the (very unlikely) clash.
    for (let attempt = 0; attempt < (chosen ? 1 : 6); attempt += 1) {
      const created = await giftsDb.create({ ...rest, label, code: chosen || generateGiftCode(), createdBy: adminIdOf(req) });
      if (created) return res.status(201).json({ code: apiGiftCode(created, await giftsDb.resultsFor(created.id)) });
    }
    return res.status(409).json({ error: chosen ? `The code ${chosen} is already taken. Choose another.` : "A code could not be made. Please try again." });
  }));

  app.get("/api/admin/gift-codes/:id", admin, readLimit, handler(async (req, res) => {
    await ensureGiftSchema();
    const code = await giftsDb.findById(String(req.params.id));
    if (!code) return res.status(404).json({ error: "Gift code not found." });
    const [results, people] = await Promise.all([giftsDb.resultsFor(code.id), giftsDb.people(code.id)]);
    res.json({ code: apiGiftCode(code, results), people });
  }));

  app.put("/api/admin/gift-codes/:id", admin, writeLimit, handler(async (req, res) => {
    await ensureGiftSchema();
    const code = await giftsDb.findById(String(req.params.id));
    if (!code) return res.status(404).json({ error: "Gift code not found." });
    const parsed = validateGiftCodeEdit(req.body, code, await giftsDb.countClaims(code.id));
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    const updated = await giftsDb.update(code.id, parsed.fields);
    if (!updated) return res.status(404).json({ error: "Gift code not found." });
    res.json({ code: apiGiftCode(updated, await giftsDb.resultsFor(updated.id)) });
  }));
}
