/**
 * Email programmes: emails that go out by themselves, to each member at
 * their own moment (when they join, or before their gift ends), instead of
 * to a whole group at once like a campaign.
 *
 * email_programs holds each programme: what starts it, when it stops for a
 * member, its steps (a template and a number of days each, as JSON with a
 * stable id per step) and whether it is switched on. email_program_sends
 * holds one row per member per step: when it is due and what happened.
 * The UNIQUE key is what guarantees a member never gets the same step of
 * the same programme twice for the same moment.
 *
 * The statements below are ALSO in migrations/0005_programs.sql, and a test
 * keeps the two identical. The Worker runs them itself the first time
 * programmes are used, because production migrations are applied by hand.
 * Every statement is idempotent.
 */
export const PROGRAM_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS email_programs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  stop_rule TEXT NOT NULL DEFAULT 'none',
  steps TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'off',
  started_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS email_program_sends (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  anchor_key TEXT NOT NULL,
  anchor_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reason TEXT,
  provider_message_id TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (program_id, user_id, anchor_key, step_id),
  FOREIGN KEY (program_id) REFERENCES email_programs(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`,
  `CREATE INDEX IF NOT EXISTS idx_program_sends_due ON email_program_sends(status, due_at)`,
  `CREATE INDEX IF NOT EXISTS idx_program_sends_program ON email_program_sends(program_id, created_at)`,
];

/** joined: from the day a member joins (once their email is confirmed). gift_ending: counting back from the end of a gift. */
export const PROGRAM_TRIGGERS = ["joined", "gift_ending"] as const;
export type ProgramTrigger = (typeof PROGRAM_TRIGGERS)[number];
/** When a member stops getting a programme's emails. */
export const PROGRAM_STOP_RULES = ["none", "made_video", "paying"] as const;
export type ProgramStopRule = (typeof PROGRAM_STOP_RULES)[number];
