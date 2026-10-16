/**
 * Gift codes: codes the owner makes in the Email Centre that give free time
 * on SceneFlow or SceneForge. Unlike the one-time codes in
 * complimentary_codes, one gift code can be shared with many people (a
 * campaign, a partner's channel, a post), so it carries how many people may
 * use it, who may use it and until when.
 *
 * Each use is an ordinary complimentary_grants row whose access_code_id is
 * the gift code's id: access works exactly like every other gift, and the
 * grants are also the record of who used which code.
 *
 * The code text is kept as written, not hashed like the one-time codes: a
 * gift code is meant to be printed in emails and handed to partners, so the
 * owner has to be able to read it again later, and its reach is limited by
 * its use limit and claim-by date instead.
 *
 * The statements below are ALSO in migrations/0004_gift_codes.sql, and a
 * test keeps the two identical. The Worker runs them itself the first time
 * gift codes are used (ensureGiftSchema) because production migrations are
 * applied by hand: a deploy that lands before the migration must not break
 * code redemption. Every statement is idempotent.
 */
export const GIFT_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS gift_codes (
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
)`,
  `CREATE INDEX IF NOT EXISTS idx_gift_codes_created ON gift_codes(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_complimentary_grants_code ON complimentary_grants(access_code_id)`,
];

/** active: can be used. paused: stopped for now. ended: stopped for good. */
export const GIFT_CODE_STATUSES = ["active", "paused", "ended"] as const;
export type GiftCodeStatus = (typeof GIFT_CODE_STATUSES)[number];
