-- Scenering email programmes (Email Centre, Programmes).
--
-- Emails that go out by themselves, to each member at their own moment:
-- when they join, or before their gift ends. email_programs holds each
-- programme; email_program_sends holds one row per member per step, and its
-- UNIQUE key guarantees nobody gets the same step twice.
--
-- These statements are identical to PROGRAM_SCHEMA_STATEMENTS in
-- src/programs-schema.ts (tests/programs.test.ts keeps them in step). The
-- Worker also runs them itself the first time programmes are used, because
-- production migrations are applied by hand; every statement is idempotent.
--
-- Timestamps follow the app-wide convention: ISO-8601 strings written by the
-- application, compared as text.

CREATE TABLE IF NOT EXISTS email_programs (
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
);
CREATE TABLE IF NOT EXISTS email_program_sends (
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
);
CREATE INDEX IF NOT EXISTS idx_program_sends_due ON email_program_sends(status, due_at);
CREATE INDEX IF NOT EXISTS idx_program_sends_program ON email_program_sends(program_id, created_at);
