-- Scenering D1 schema.
--
-- Extends the originally-drafted schema to cover every entity the app
-- actually persists today in `.data/platform.json`: plan slugs match
-- src/config/plans.ts ("free" | "sceneflow" | "sceneforge"), complimentary
-- codes are stored hashed (never in plaintext — same principle as password
-- hashing), and there are tables for email preferences, export
-- reservations, and the webhook/billing event logs the admin panel reads.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Email-verification and password-reset tokens (distinguished by `type`).
CREATE TABLE IF NOT EXISTS verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL, -- 'verify' | 'reset'
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_verification_token ON verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_verification_user_type ON verification_tokens(user_id, type);

-- plan: 'free' | 'sceneflow' | 'sceneforge' (src/config/plans.ts PlanSlug)
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'inactive'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'lemonsqueezy',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  provider_product_id TEXT,
  provider_variant_id TEXT,
  plan_id TEXT NOT NULL,
  billing_interval TEXT NOT NULL, -- 'monthly' | 'yearly'
  status TEXT NOT NULL,
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  cancelled_at TEXT,
  expires_at TEXT,
  customer_portal_url TEXT,
  update_payment_url TEXT,
  card_brand TEXT,
  card_last_four TEXT,
  renewal_price TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_sub_id ON subscriptions(provider_subscription_id);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'final_export',
  duration_minutes REAL NOT NULL,
  format TEXT, -- 'short' | 'long'
  project_id TEXT,
  reservation_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_usage_user_created ON usage_records(user_id, created_at);

CREATE TABLE IF NOT EXISTS export_reservations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  duration_minutes REAL NOT NULL,
  format TEXT NOT NULL, -- 'short' | 'long'
  creative_manifest TEXT, -- JSON
  status TEXT NOT NULL DEFAULT 'reserved', -- 'reserved' | 'completed' | 'cancelled'
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_export_reservations_user ON export_reservations(user_id, created_at);

-- Complimentary ("comped") access grants — renamed from the originally
-- drafted `complimentary_memberships` to also carry period/status/reason,
-- matching what the admin panel actually reads and writes.
CREATE TABLE IF NOT EXISTS complimentary_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL, -- 'sceneflow' | 'sceneforge'
  period TEXT NOT NULL, -- 'month' | 'year'
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'revoked' | 'expired'
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  reason TEXT,
  access_code_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_complimentary_grants_user ON complimentary_grants(user_id, status);

-- Redeemable codes. Only a salted HMAC of the code is stored (same principle
-- as password hashing) so a database read can never hand out a usable code —
-- `code_prefix` (e.g. "SCN-A1B2C3D4…EF01") is kept only for display in the
-- admin panel.
CREATE TABLE IF NOT EXISTS complimentary_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT UNIQUE NOT NULL,
  code_prefix TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'redeemed' | 'revoked' | 'expired'
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  redeemed_by TEXT,
  redeemed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_complimentary_codes_hash ON complimentary_codes(code_hash);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  provider_event_id TEXT UNIQUE NOT NULL,
  event_name TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT, -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at);

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  subscription_id TEXT,
  event_name TEXT NOT NULL,
  from_provider INTEGER NOT NULL DEFAULT 0,
  extra TEXT, -- JSON catch-all (code_id, plan_id, period, ends_at, reason, granted_by, grant_id, ...)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_billing_events_user ON billing_events(user_id);

CREATE TABLE IF NOT EXISTS contact_submissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_created ON contact_submissions(created_at);

CREATE TABLE IF NOT EXISTS email_preferences (
  user_id TEXT PRIMARY KEY,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  consent_timestamp TEXT NOT NULL,
  consent_source TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  training_step INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Generic key/value settings store (e.g. key='social_links' -> JSON value).
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Metadata for audio blobs stored in R2 (imported voice clips, uploaded by
-- the user). The actual bytes live in the AUDIO_BUCKET R2 bucket.
CREATE TABLE IF NOT EXISTS audio_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_audio_user ON audio_files(user_id);
