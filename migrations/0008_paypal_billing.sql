-- PayPal subscription checkout intents.
-- The intent binds an authenticated Scenering user and a fixed plan/interval
-- to the PayPal subscription's custom_id before approval. The raw random token
-- is never stored; only its SHA-256 hash is kept in D1.
CREATE TABLE IF NOT EXISTS paypal_checkout_intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  intent_hash TEXT UNIQUE NOT NULL,
  plan_id TEXT NOT NULL,
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'yearly')),
  paypal_plan_id TEXT NOT NULL,
  paypal_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'created',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_paypal_checkout_intents_user ON paypal_checkout_intents(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paypal_checkout_intents_expiry ON paypal_checkout_intents(expires_at);
-- Prevent duplicate concurrent server-side subscription creation for one user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_paypal_checkout_intents_one_create_per_user
  ON paypal_checkout_intents(user_id) WHERE status IN ('created', 'approved');
