-- FastSpring billing schema migration.
--
-- Two things change in the billing tables:
--
--   * `subscriptions.provider` defaults to 'fastspring'.
--   * `provider_variant_id` becomes `provider_price_id`, storing the FastSpring
--     product path (`sceneflow-monthly`, `sceneflow-yearly`,
--     `sceneforge-monthly`, `sceneforge-yearly`).
--   * `provider_event_occurred_at` tracks the ISO-8601 timestamp of the newest
--     FastSpring event applied to a subscription row so out-of-order
--     redeliveries are dropped rather than overwriting newer state.
--   * `billing_customers` maps a FastSpring account id (`acct…`) to a
--     Scenering user id and email address.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS subscriptions_fastspring (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'fastspring',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  provider_product_id TEXT,
  provider_price_id TEXT,
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
  provider_event_occurred_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO subscriptions_fastspring (
  id, user_id, provider, provider_customer_id, provider_subscription_id, provider_product_id, provider_price_id,
  plan_id, billing_interval, status, current_period_start, current_period_end, cancel_at_period_end, cancelled_at,
  expires_at, customer_portal_url, update_payment_url, card_brand, card_last_four, renewal_price,
  provider_event_occurred_at, created_at, updated_at
)
SELECT
  id, user_id, provider, provider_customer_id, provider_subscription_id, provider_product_id, provider_variant_id,
  plan_id, billing_interval, status, current_period_start, current_period_end, cancel_at_period_end, cancelled_at,
  expires_at, customer_portal_url, update_payment_url, card_brand, card_last_four, renewal_price,
  NULL, created_at, updated_at
FROM subscriptions;

DROP TABLE IF EXISTS subscriptions;

ALTER TABLE subscriptions_fastspring RENAME TO subscriptions;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_sub_id ON subscriptions(provider_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_customer_id ON subscriptions(provider_customer_id);

CREATE TABLE IF NOT EXISTS billing_customers (
  provider TEXT NOT NULL DEFAULT 'fastspring',
  provider_customer_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  last_event_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, provider_customer_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_billing_customers_user ON billing_customers(user_id);

PRAGMA foreign_keys = ON;
