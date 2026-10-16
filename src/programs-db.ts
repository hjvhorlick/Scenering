import { env } from "./env";
import { PROGRAM_SCHEMA_STATEMENTS, PROGRAM_STOP_RULES, PROGRAM_TRIGGERS, type ProgramStopRule, type ProgramTrigger } from "./programs-schema.ts";

/**
 * Data access for email programmes (see src/programs-schema.ts), in the
 * style of src/inbox-db.ts: plain SQL through the D1 binding, ISO-8601
 * timestamps written by the application, prefixed random ids.
 *
 * Dates for each member's emails are worked out inside SQLite with
 * strftime('%Y-%m-%dT%H:%M:%fZ', moment, '+N days'), which produces exactly
 * the ISO format the rest of the app writes, so they compare as text.
 */

export interface ProgramStep {
  /** Stable id: a member's sends point at it, so steps can be reordered or removed safely. */
  id: string;
  templateId: string;
  /** joined: days after joining. gift_ending: days before the gift ends. */
  day: number;
}

export interface EmailProgram {
  id: string;
  name: string;
  trigger: ProgramTrigger;
  stopRule: ProgramStopRule;
  steps: ProgramStep[];
  status: "on" | "off";
  /** When it was last switched on: only members whose moment comes after this are added. */
  startedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface DueSend {
  id: string;
  programId: string;
  userId: string;
  stepId: string;
  anchorKey: string;
  dueAt: string;
  trigger: string;
  stopRule: string;
  steps: ProgramStep[];
  email: string | null;
  displayName: string;
  verified: boolean;
  role: string | null;
  consent: boolean;
  madeVideo: boolean;
  paying: boolean;
  giftRunning: boolean;
}

export interface ProgramStats { members: number; sent: number; waiting: number; skipped: number; failed: number; nextDueAt: string | null; sentByStep: Record<string, number> }

export interface ProgramActivity {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  stepId: string;
  status: string;
  reason: string | null;
  dueAt: string;
  sentAt: string | null;
}

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
const D1 = () => env().DB;
/** strftime format that reproduces the app's ISO timestamps. */
const ISO = "'%Y-%m-%dT%H:%M:%fZ'";

export function parseSteps(raw: unknown): ProgramStep[] {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(value)) return [];
    return value
      .filter((step: any) => step && typeof step.id === "string" && typeof step.templateId === "string" && Number.isInteger(step.day))
      .map((step: any) => ({ id: step.id, templateId: step.templateId, day: step.day }));
  } catch {
    return [];
  }
}

function rowToProgram(row: any): EmailProgram {
  return {
    id: row.id,
    name: row.name,
    trigger: (PROGRAM_TRIGGERS as readonly string[]).includes(row.trigger_type) ? row.trigger_type : "joined",
    stopRule: (PROGRAM_STOP_RULES as readonly string[]).includes(row.stop_rule) ? row.stop_rule : "none",
    steps: parseSteps(row.steps),
    status: row.status === "on" ? "on" : "off",
    startedAt: row.started_at || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const programsDb = {
  newId,

  async ensureSchema(): Promise<void> {
    const db = D1();
    try {
      await db.batch(PROGRAM_SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)));
    } catch {
      for (const sql of PROGRAM_SCHEMA_STATEMENTS) await db.prepare(sql).run();
    }
  },

  async list(): Promise<EmailProgram[]> {
    const result = await D1().prepare("SELECT * FROM email_programs ORDER BY created_at ASC").all();
    return (result.results || []).map(rowToProgram);
  },

  async listOn(): Promise<EmailProgram[]> {
    const result = await D1().prepare("SELECT * FROM email_programs WHERE status = 'on' ORDER BY created_at ASC").all();
    return (result.results || []).map(rowToProgram);
  },

  async find(id: string): Promise<EmailProgram | null> {
    const row = await D1().prepare("SELECT * FROM email_programs WHERE id = ?").bind(id).first();
    return row ? rowToProgram(row) : null;
  },

  async create(input: { name: string; trigger: ProgramTrigger; stopRule: ProgramStopRule; steps: ProgramStep[]; createdBy: string }): Promise<EmailProgram> {
    const stamp = nowIso();
    const program: EmailProgram = { id: newId("prg"), ...input, status: "off", startedAt: null, createdAt: stamp, updatedAt: stamp };
    await D1().prepare("INSERT INTO email_programs (id, name, trigger_type, stop_rule, steps, status, started_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'off', NULL, ?, ?, ?)")
      .bind(program.id, program.name, program.trigger, program.stopRule, JSON.stringify(program.steps), program.createdBy, stamp, stamp).run();
    return program;
  },

  async update(id: string, fields: Partial<Pick<EmailProgram, "name" | "trigger" | "stopRule" | "steps">>): Promise<EmailProgram | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (fields.name !== undefined) { sets.push("name = ?"); values.push(fields.name); }
    if (fields.trigger !== undefined) { sets.push("trigger_type = ?"); values.push(fields.trigger); }
    if (fields.stopRule !== undefined) { sets.push("stop_rule = ?"); values.push(fields.stopRule); }
    if (fields.steps !== undefined) { sets.push("steps = ?"); values.push(JSON.stringify(fields.steps)); }
    if (sets.length > 0) {
      sets.push("updated_at = ?");
      values.push(nowIso(), id);
      await D1().prepare(`UPDATE email_programs SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
    }
    return this.find(id);
  },

  /**
   * On: from now, members whose moment comes are added. Off: nothing more
   * is sent, and emails that were waiting are dropped, so switching on
   * again never releases a pile of late emails at once.
   */
  async setStatus(id: string, on: boolean): Promise<void> {
    const stamp = nowIso();
    if (on) {
      await D1().prepare("UPDATE email_programs SET status = 'on', started_at = ?, updated_at = ? WHERE id = ?").bind(stamp, stamp, id).run();
      return;
    }
    await D1().batch([
      D1().prepare("UPDATE email_programs SET status = 'off', updated_at = ? WHERE id = ?").bind(stamp, id),
      D1().prepare("UPDATE email_program_sends SET status = 'skipped', reason = 'The programme was switched off', updated_at = ? WHERE program_id = ? AND status = 'pending'").bind(stamp, id),
    ]);
  },

  async remove(id: string): Promise<void> {
    await D1().batch([
      D1().prepare("DELETE FROM email_program_sends WHERE program_id = ?").bind(id),
      D1().prepare("DELETE FROM email_programs WHERE id = ?").bind(id),
    ]);
  },

  /**
   * Adds the members whose moment has come, one statement per step, all in
   * one batch. INSERT OR IGNORE plus the UNIQUE key makes this safe to run
   * any number of times; each statement is bounded (LIMIT 200), so a large
   * backlog is worked through over several runs.
   *
   * joined: verified members (not administrators) who joined after the
   * programme was switched on and within the last 14 days. Their moment is
   * when they were first added (so a member who confirms their email late
   * still gets the emails spaced out, not all at once); a step added later
   * counts from that same moment.
   *
   * gift_ending: running gifts ending within the longest step's reach
   * (plus a day), counting back from the end of each gift. A step whose day
   * has already passed is written as skipped, never sent late.
   */
  async enrol(program: EmailProgram, now: Date = new Date()): Promise<void> {
    if (program.steps.length === 0) return;
    const stamp = now.toISOString();
    const tooLateBefore = new Date(now.getTime() - 3600000).toISOString();
    const statements: Array<ReturnType<ReturnType<typeof D1>["prepare"]>> = [];
    if (program.trigger === "joined") {
      const since = [program.startedAt || stamp, new Date(now.getTime() - 14 * 86400000).toISOString()].sort().pop()!;
      for (const step of program.steps) {
        const offset = `+${step.day} days`;
        statements.push(D1().prepare(
          `INSERT OR IGNORE INTO email_program_sends (id, program_id, user_id, step_id, anchor_key, anchor_at, due_at, status, reason, created_at, updated_at)
           SELECT 'pgs_' || lower(hex(randomblob(16))), ?, x.user_id, ?, 'joined', x.anchor_at,
                  strftime(${ISO}, x.anchor_at, ?),
                  CASE WHEN strftime(${ISO}, x.anchor_at, ?) < ? THEN 'skipped' ELSE 'pending' END,
                  CASE WHEN strftime(${ISO}, x.anchor_at, ?) < ? THEN 'Too late: this email was added after its day had passed' ELSE NULL END,
                  ?, ?
             FROM (SELECT u.id AS user_id,
                          COALESCE((SELECT MIN(s.anchor_at) FROM email_program_sends s WHERE s.program_id = ? AND s.user_id = u.id AND s.anchor_key = 'joined'), ?) AS anchor_at
                     FROM users u
                    WHERE u.role != 'admin' AND u.is_verified = 1 AND u.email LIKE '%@%.%' AND u.created_at >= ?
                      AND NOT EXISTS (SELECT 1 FROM email_program_sends s WHERE s.program_id = ? AND s.user_id = u.id AND s.anchor_key = 'joined' AND s.step_id = ?)
                    ORDER BY u.created_at ASC
                    LIMIT 200) x`
        ).bind(program.id, step.id, offset, offset, tooLateBefore, offset, tooLateBefore, stamp, stamp, program.id, stamp, since, program.id, step.id));
      }
    } else {
      const reach = Math.max(...program.steps.map((step) => step.day)) + 1;
      const horizon = new Date(now.getTime() + reach * 86400000).toISOString();
      for (const step of program.steps) {
        const offset = `-${step.day} days`;
        statements.push(D1().prepare(
          `INSERT OR IGNORE INTO email_program_sends (id, program_id, user_id, step_id, anchor_key, anchor_at, due_at, status, reason, created_at, updated_at)
           SELECT 'pgs_' || lower(hex(randomblob(16))), ?, g.user_id, ?, g.id, g.ends_at,
                  strftime(${ISO}, g.ends_at, ?),
                  CASE WHEN strftime(${ISO}, g.ends_at, ?) < ? THEN 'skipped' ELSE 'pending' END,
                  CASE WHEN strftime(${ISO}, g.ends_at, ?) < ? THEN 'Too late: the gift ends sooner than this email''s day' ELSE NULL END,
                  ?, ?
             FROM complimentary_grants g JOIN users u ON u.id = g.user_id
            WHERE g.status = 'active' AND g.ends_at > ? AND g.ends_at <= ?
              AND u.role != 'admin' AND u.is_verified = 1 AND u.email LIKE '%@%.%'
              AND NOT EXISTS (SELECT 1 FROM email_program_sends s WHERE s.program_id = ? AND s.user_id = g.user_id AND s.anchor_key = g.id AND s.step_id = ?)
            ORDER BY g.ends_at ASC
            LIMIT 200`
        ).bind(program.id, step.id, offset, offset, tooLateBefore, offset, tooLateBefore, stamp, stamp, stamp, horizon, program.id, step.id));
      }
    }
    await D1().batch(statements);
  },

  /** Emails whose time has come, with everything needed to decide whether each may still go. One query. */
  async due(now: Date, limit: number): Promise<DueSend[]> {
    const stamp = now.toISOString();
    const result = await D1().prepare(
      `SELECT s.id, s.program_id, s.user_id, s.step_id, s.anchor_key, s.due_at,
              p.trigger_type, p.stop_rule, p.steps,
              u.email, u.display_name, u.is_verified, u.role,
              COALESCE(e.marketing_consent, 0) AS consent,
              EXISTS (SELECT 1 FROM usage_records r WHERE r.user_id = s.user_id) AS made_video,
              EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = s.user_id AND m.status = 'active' AND m.plan != 'free') AS paying,
              EXISTS (SELECT 1 FROM complimentary_grants g WHERE g.id = s.anchor_key AND g.status = 'active' AND g.ends_at > ?) AS gift_running
         FROM email_program_sends s
         JOIN email_programs p ON p.id = s.program_id
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN email_preferences e ON e.user_id = s.user_id
        WHERE s.status = 'pending' AND s.due_at <= ? AND p.status = 'on'
        ORDER BY s.due_at ASC
        LIMIT ?`
    ).bind(stamp, stamp, limit).all();
    return (result.results || []).map((row: any) => ({
      id: String(row.id), programId: String(row.program_id), userId: String(row.user_id), stepId: String(row.step_id), anchorKey: String(row.anchor_key), dueAt: String(row.due_at),
      trigger: String(row.trigger_type), stopRule: String(row.stop_rule), steps: parseSteps(row.steps),
      email: row.email ? String(row.email) : null, displayName: String(row.display_name || ""), verified: Number(row.is_verified) === 1, role: row.role ? String(row.role) : null,
      consent: Number(row.consent) === 1, madeVideo: Number(row.made_video) === 1, paying: Number(row.paying) === 1, giftRunning: Number(row.gift_running) === 1,
    }));
  },

  /** Takes one email for sending; false if another run already took it. */
  async claim(id: string): Promise<boolean> {
    const result = await D1().prepare("UPDATE email_program_sends SET status = 'sending', updated_at = ? WHERE id = ? AND status = 'pending'").bind(nowIso(), id).run();
    return (result.meta?.changes ?? 0) === 1;
  },
  async markSent(id: string, providerMessageId: string | null): Promise<void> {
    const stamp = nowIso();
    await D1().prepare("UPDATE email_program_sends SET status = 'sent', provider_message_id = ?, sent_at = ?, updated_at = ? WHERE id = ?").bind(providerMessageId, stamp, stamp, id).run();
  },
  async markFailed(id: string, reason: string): Promise<void> {
    await D1().prepare("UPDATE email_program_sends SET status = 'failed', reason = ?, updated_at = ? WHERE id = ?").bind(reason.slice(0, 500), nowIso(), id).run();
  },
  async skip(id: string, reason: string): Promise<void> {
    await D1().prepare("UPDATE email_program_sends SET status = 'skipped', reason = ?, updated_at = ? WHERE id = ? AND status = 'pending'").bind(reason.slice(0, 500), nowIso(), id).run();
  },
  /** The send a provider webhook is about (by the provider's message id). */
  async findByProviderMessageId(messageId: string): Promise<{ id: string; userId: string } | null> {
    const row = await D1().prepare("SELECT id, user_id FROM email_program_sends WHERE provider_message_id = ?").bind(messageId).first();
    return row ? { id: String((row as any).id), userId: String((row as any).user_id) } : null;
  },

  /** Figures for every programme. One grouped query. */
  async stats(): Promise<Map<string, ProgramStats>> {
    const result = await D1().prepare(
      `SELECT program_id, step_id, status, COUNT(*) AS n, COUNT(DISTINCT user_id) AS people, MIN(CASE WHEN status = 'pending' THEN due_at END) AS next_due
         FROM email_program_sends GROUP BY program_id, step_id, status`
    ).all();
    const members = await D1().prepare("SELECT program_id, COUNT(DISTINCT user_id) AS n FROM email_program_sends GROUP BY program_id").all();
    const map = new Map<string, ProgramStats>();
    const get = (id: string) => {
      if (!map.has(id)) map.set(id, { members: 0, sent: 0, waiting: 0, skipped: 0, failed: 0, nextDueAt: null, sentByStep: {} });
      return map.get(id)!;
    };
    for (const row of (result.results || []) as any[]) {
      const stats = get(String(row.program_id));
      const n = Number(row.n) || 0;
      if (row.status === "sent") { stats.sent += n; stats.sentByStep[String(row.step_id)] = (stats.sentByStep[String(row.step_id)] || 0) + n; }
      else if (row.status === "pending" || row.status === "sending") stats.waiting += n;
      else if (row.status === "skipped") stats.skipped += n;
      else if (row.status === "failed") stats.failed += n;
      if (row.next_due && (!stats.nextDueAt || String(row.next_due) < stats.nextDueAt)) stats.nextDueAt = String(row.next_due);
    }
    for (const row of (members.results || []) as any[]) get(String(row.program_id)).members = Number(row.n) || 0;
    return map;
  },

  async activity(programId: string, limit = 50): Promise<ProgramActivity[]> {
    const result = await D1().prepare(
      `SELECT s.id, s.user_id, s.step_id, s.status, s.reason, s.due_at, s.sent_at, u.email, u.display_name
         FROM email_program_sends s LEFT JOIN users u ON u.id = s.user_id
        WHERE s.program_id = ?
        ORDER BY COALESCE(s.sent_at, s.updated_at) DESC, s.due_at ASC
        LIMIT ?`
    ).bind(programId, limit).all();
    return (result.results || []).map((row: any) => ({
      id: String(row.id), userId: String(row.user_id), email: String(row.email || ""), displayName: String(row.display_name || ""), stepId: String(row.step_id),
      status: String(row.status), reason: row.reason ? String(row.reason) : null, dueAt: String(row.due_at), sentAt: row.sent_at ? String(row.sent_at) : null,
    }));
  },
};
