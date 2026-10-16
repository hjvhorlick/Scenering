-- Paddle replaces Lemon Squeezy as the payment provider.
--
-- Two things change in the billing tables, and both are about naming rather
-- than behaviour:
--
--   * `subscriptions.provider` defaults to 'paddle'. The default never decides
--     anything (src/db.ts always writes the provider explicitly), but a schema
--     that says 'lemonsqueezy' is a schema that lies about which company holds
--     the money.
--   * `provider_variant_id` becomes `provider_price_id`. "Variant" is a Lemon
--     Squeezy word for the monthly/yearly edition of a product; Paddle's
--     equivalent is a *price* (`pri_…`) under a product. Same job — it is the
--     identifier a webhook maps back to a Scenering plan — new vocabulary.
--
-- SQLite cannot change a column default or rename a column in place in the way
-- this needs, so the table is rebuilt the standard way: create the new shape,
-- copy every row across, drop the old table, rename. Nothing is lost and the
-- sequence is safe to run again (the copy source is the renamed table, so a
-- second run rebuilds an identical table).
--
-- `billing_customers` is new. Paddle's subscription webhooks carry a customer
-- id (`ctm_…`) but no email address, while its customer webhooks carry both.
-- Storing the pair when a customer event arrives gives the subscription
-- handler a second way to match a payment to a Scenering account when the
-- checkout did not tag the purchase with `custom_data.user_id` — see
-- PADDLE.md. It never grants access by itself: it only says which account a
-- Paddle customer is.
--
-- Timestamps follow the app-wide convention: ISO-8601 strings written by the
-- application, compared as text.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS subscriptions_paddle (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'paddle',
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
  -- `occurred_at` of the newest Paddle event applied to this row. Paddle
  -- guarantees nothing about delivery order — a retry or a replay can land
  -- after a newer event — so an event older than this is logged and dropped
  -- rather than resurrecting state the customer has already moved past.
  -- Compared as text: Paddle sends UTC ISO-8601, which sorts correctly.
  provider_event_occurred_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO subscriptions_paddle (
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

ALTER TABLE subscriptions_paddle RENAME TO subscriptions;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_sub_id ON subscriptions(provider_subscription_id);
-- New: the webhook resolves an account from a Paddle customer id, so that
-- lookup has to be indexed rather than a scan.
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_customer_id ON subscriptions(provider_customer_id);

CREATE TABLE IF NOT EXISTS billing_customers (
  provider TEXT NOT NULL DEFAULT 'paddle',
  provider_customer_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  -- As above: the newest customer event applied, so a late redelivery cannot
  -- overwrite the mapping with an older email address.
  last_event_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (provider, provider_customer_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_billing_customers_user ON billing_customers(user_id);

PRAGMA foreign_keys = ON;
