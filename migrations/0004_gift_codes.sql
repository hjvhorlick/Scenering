-- Scenering gift codes (Email Centre, Gifts).
--
-- Codes the owner makes to give free time on SceneFlow or SceneForge. One
-- code can be shared with many people; each use is a complimentary_grants
-- row whose access_code_id is the code's id, so access works like every
-- other gift and the grants record who used which code.
--
-- These statements are identical to GIFT_SCHEMA_STATEMENTS in
-- src/gifts-schema.ts (tests/members-gifts.test.ts keeps them in step). The
-- Worker also runs them itself the first time gift codes are used, because
-- production migrations are applied by hand; every statement is idempotent.
--
-- Timestamps follow the app-wide convention: ISO-8601 strings written by the
-- application, compared as text.

CREATE TABLE IF NOT EXISTS gift_codes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  plan_id TEXT NOT NULL,
  period TEXT NOT NULL,
  max_uses INTEGER,
  new_members_only INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gift_codes_created ON gift_codes(created_at);
CREATE INDEX IF NOT EXISTS idx_complimentary_grants_code ON complimentary_grants(access_code_id);
