import type { Express, NextFunction, Request, Response } from "express";
import { db } from "../src/db.ts";
import { programsDb, type EmailProgram, type ProgramStep } from "../src/programs-db.ts";
import { PROGRAM_STOP_RULES, PROGRAM_TRIGGERS, type ProgramStopRule, type ProgramTrigger } from "../src/programs-schema.ts";
import { marketingContext, sendTemplateEmail } from "./email-centre.ts";
import { platformRateLimit, requirePlatformAdmin } from "./platform.ts";

/**
 * Email programmes: emails that go out by themselves, to each member at
 * their own moment, run by the five-minute Cron Trigger (worker.ts).
 *
 * Safety rules, all enforced here or in src/programs-db.ts:
 *  - a programme does nothing until the owner switches it on, and only
 *    members whose moment comes after that are added;
 *  - each member gets each step of a programme once (a UNIQUE key);
 *  - consent, a confirmed address and the stop rule are checked again at
 *    the moment of sending, and an email more than two days late is
 *    dropped rather than sent;
 *  - every email is a marketing email with the same footer, unsubscribe
 *    link and headers as a campaign (sendTemplateEmail);
 *  - each cron run sends at most PROGRAM_SEND_BUDGET emails (and looks at
 *    no more than twice that many).
 */

export const PROGRAM_SEND_BUDGET = 10;
export const MAX_PROGRAM_STEPS = 10;
/** Furthest a step can be from its moment. */
export const MAX_DAYS: Record<ProgramTrigger, number> = { joined: 60, gift_ending: 30 };
/** An email this late is dropped, not sent. */
const STALE_MS = 2 * 86400000;

let schemaReady: Promise<void> | null = null;
export function ensureProgramSchema(): Promise<void> {
  if (!schemaReady) schemaReady = programsDb.ensureSchema().catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}
/** Tests only. */
export function resetProgramSchemaCache() {
  schemaReady = null;
}

function cleanName(value: unknown): string {
  return String(value ?? "").replace(/[\x00-\x1F\x7F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Checks a programme from the editor. Templates must exist and be active. */
export async function validateProgram(body: any, existing: EmailProgram | null): Promise<{ value: { name: string; trigger: ProgramTrigger; stopRule: ProgramStopRule; steps: ProgramStep[] } } | { error: string }> {
  const name = body?.name !== undefined ? cleanName(body.name) : existing?.name || "";
  if (name.length < 2) return { error: "Give the programme a name." };
  const trigger = (body?.trigger ?? existing?.trigger) as ProgramTrigger;
  if (!(PROGRAM_TRIGGERS as readonly string[]).includes(trigger)) return { error: "Choose when the programme starts for a member." };
  if (existing && existing.status === "on" && trigger !== existing.trigger) return { error: "Switch the programme off before changing when it starts." };
  const stopRule = (body?.stopRule ?? existing?.stopRule ?? "none") as ProgramStopRule;
  if (!(PROGRAM_STOP_RULES as readonly string[]).includes(stopRule)) return { error: "Choose when a member stops getting these emails." };
  const rawSteps = body?.steps !== undefined ? body.steps : existing?.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) return { error: "Add at least one email." };
  if (rawSteps.length > MAX_PROGRAM_STEPS) return { error: `A programme can have up to ${MAX_PROGRAM_STEPS} emails.` };
  const steps: ProgramStep[] = [];
  for (const raw of rawSteps) {
    const day = Number(raw?.day);
    if (!Number.isInteger(day) || day < 0 || day > MAX_DAYS[trigger]) {
      return { error: trigger === "joined" ? `Each email goes out 0 to ${MAX_DAYS.joined} days after joining.` : `Each email goes out 0 to ${MAX_DAYS.gift_ending} days before the gift ends.` };
    }
    const templateId = String(raw?.templateId || "");
    const template = templateId ? await db.findEmailTemplate(templateId) : null;
    if (!template || template.status !== "active") return { error: "Choose an email (an active template) for every step." };
    const id = typeof raw?.id === "string" && /^st_[a-z0-9]{6,40}$/.test(raw.id) ? raw.id : `st_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    if (steps.some((step) => step.id === id)) return { error: "Two steps are the same. Remove one and add it again." };
    if (steps.some((step) => step.day === day)) return { error: "Two emails are on the same day. Give each its own day." };
    steps.push({ id, templateId, day });
  }
  // In the order members receive them: days after joining go up, days before the end go down.
  steps.sort((a, b) => (trigger === "joined" ? a.day - b.day : b.day - a.day));
  return { value: { name, trigger, stopRule, steps } };
}

/** Why an email that is due must not go, or null if it may. */
export function reasonNotToSend(send: Awaited<ReturnType<typeof programsDb.due>>[number], now: Date): string | null {
  if (!send.email || !send.role) return "The account no longer exists";
  if (send.role === "admin") return "Owner accounts do not get programme emails";
  if (!send.verified) return "Email address not confirmed";
  if (!send.consent) return "Does not want marketing email";
  if (!/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/.test(send.email)) return "The email address is not valid";
  if (send.stopRule === "made_video" && send.madeVideo) return "Made a video, so the programme stopped";
  if (send.stopRule === "paying" && send.paying) return "Started paying, so the programme stopped";
  if (send.trigger === "gift_ending" && !send.giftRunning) return "The gift ended early or was replaced";
  if (!send.steps.some((step) => step.id === send.stepId)) return "This email was removed from the programme";
  if (now.getTime() - Date.parse(send.dueAt) > STALE_MS) return "More than two days late, so it was not sent";
  return null;
}

/**
 * The cron entry point: adds members to every switched-on programme, then
 * sends what is due, within the budget. Never throws.
 */
export async function processEmailPrograms(budget: number = PROGRAM_SEND_BUDGET, now: Date = new Date()): Promise<{ sent: number; skipped: number; failed: number }> {
  const outcome = { sent: 0, skipped: 0, failed: 0 };
  try {
    await ensureProgramSchema();
    const programs = await programsDb.listOn();
    if (programs.length === 0) return outcome;
    for (const program of programs) {
      try { await programsDb.enrol(program, now); } catch (error: any) { console.warn("Programme enrolment error:", program.id, error?.message || error); }
    }
    // Up to twice the budget is looked at, so emails that must be dropped
    // (late, no consent, stopped) do not hold up the ones that may go; at
    // most `budget` are sent.
    const due = await programsDb.due(now, budget * 2);
    if (due.length === 0) return outcome;
    const context = await marketingContext();
    const templates = new Map<string, Awaited<ReturnType<typeof db.findEmailTemplate>>>();
    for (const send of due) {
      if (outcome.sent + outcome.failed >= budget) break;
      const reason = reasonNotToSend(send, now);
      if (reason) { await programsDb.skip(send.id, reason); outcome.skipped += 1; continue; }
      const step = send.steps.find((entry) => entry.id === send.stepId)!;
      if (!templates.has(step.templateId)) templates.set(step.templateId, await db.findEmailTemplate(step.templateId));
      const template = templates.get(step.templateId);
      if (!template || template.status !== "active") { await programsDb.skip(send.id, "The email's template was deleted or archived"); outcome.skipped += 1; continue; }
      // Claim first, send second: a second run that overlaps finds nothing to take.
      if (!(await programsDb.claim(send.id))) continue;
      try {
        const result = await sendTemplateEmail(context, template, { userId: send.userId, email: send.email!, displayName: send.displayName }, [`program:${send.programId}`]);
        await programsDb.markSent(send.id, result.messageId);
        outcome.sent += 1;
      } catch (error: any) {
        await programsDb.markFailed(send.id, String(error?.message || error || "Provider request failed"));
        outcome.failed += 1;
      }
    }
  } catch (error: any) {
    console.warn("Email programme error:", error?.message || error);
  }
  return outcome;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

function handler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    fn(req, res).catch(next);
  };
}

async function apiPrograms() {
  const [programs, stats] = await Promise.all([programsDb.list(), programsDb.stats()]);
  return programs.map((program) => ({ ...program, stats: stats.get(program.id) || { members: 0, sent: 0, waiting: 0, skipped: 0, failed: 0, nextDueAt: null, sentByStep: {} } }));
}

export function registerProgramRoutes(app: Express) {
  const admin = requirePlatformAdmin;
  const readLimit = platformRateLimit("admin-programs-read", 600, 3600000);
  const writeLimit = platformRateLimit("admin-programs-write", 200, 3600000);

  app.get("/api/admin/programs", admin, readLimit, handler(async (_req, res) => {
    await ensureProgramSchema();
    res.json({ programs: await apiPrograms() });
  }));

  app.post("/api/admin/programs", admin, writeLimit, handler(async (req, res) => {
    await ensureProgramSchema();
    const parsed = await validateProgram(req.body, null);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    const program = await programsDb.create({ ...parsed.value, createdBy: String((req as any).auth?.user?.id || "") });
    res.status(201).json({ program: (await apiPrograms()).find((entry) => entry.id === program.id) });
  }));

  app.put("/api/admin/programs/:id", admin, writeLimit, handler(async (req, res) => {
    await ensureProgramSchema();
    const existing = await programsDb.find(String(req.params.id));
    if (!existing) return res.status(404).json({ error: "Programme not found." });
    const parsed = await validateProgram(req.body, existing);
    if ("error" in parsed) return res.status(400).json({ error: parsed.error });
    await programsDb.update(existing.id, parsed.value);
    res.json({ program: (await apiPrograms()).find((entry) => entry.id === existing.id) });
  }));

  app.post("/api/admin/programs/:id/switch", admin, writeLimit, handler(async (req, res) => {
    await ensureProgramSchema();
    const program = await programsDb.find(String(req.params.id));
    if (!program) return res.status(404).json({ error: "Programme not found." });
    const on = Boolean(req.body?.on);
    if (on) {
      // Re-check the steps: a template may have been archived since.
      const checked = await validateProgram({}, { ...program, status: "off" });
      if ("error" in checked) return res.status(400).json({ error: `${checked.error} Then switch it on.` });
    }
    await programsDb.setStatus(program.id, on);
    res.json({ program: (await apiPrograms()).find((entry) => entry.id === program.id) });
  }));

  app.delete("/api/admin/programs/:id", admin, writeLimit, handler(async (req, res) => {
    await ensureProgramSchema();
    const program = await programsDb.find(String(req.params.id));
    if (!program) return res.status(404).json({ error: "Programme not found." });
    if (program.status === "on") return res.status(400).json({ error: "Switch the programme off before deleting it." });
    await programsDb.remove(program.id);
    res.json({ deleted: true });
  }));

  app.get("/api/admin/programs/:id/activity", admin, readLimit, handler(async (req, res) => {
    await ensureProgramSchema();
    const program = await programsDb.find(String(req.params.id));
    if (!program) return res.status(404).json({ error: "Programme not found." });
    res.json({ activity: await programsDb.activity(program.id) });
  }));
}
