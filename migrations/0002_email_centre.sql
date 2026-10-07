-- Scenering Admin Email Centre.
--
-- Marketing email infrastructure for the owner administrator: reusable
-- branded templates, campaigns with consented-audience selection, and a
-- per-recipient delivery ledger that backs campaign history and provider
-- (Resend) delivery callbacks.
--
-- Kept strictly separate from transactional mail (verification, password
-- resets, security notices, billing): nothing in these tables is read or
-- written by the transactional email paths, and nothing here can send a
-- transactional message. Audience selection joins email_preferences and
-- only ever includes accounts with marketing_consent = 1 — consent is the
-- gate for everything in this file.
--
-- Timestamps follow the app-wide convention: full ISO-8601 strings written
-- by the application (toISOString), compared as text (see src/db.ts's
-- nowSql note), never SQLite datetime('now') which formats differently.

CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'announcement', -- welcome | getting_started | training | product_update | announcement | promotion | newsletter | re_engagement
  subject TEXT NOT NULL,
  preheader TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL DEFAULT '',
  hero_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'archived'
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_templates_status ON email_templates(status, updated_at);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_id TEXT NOT NULL,
  subject TEXT NOT NULL, -- campaign override; falls back to the template subject when left empty
  audience_type TEXT NOT NULL, -- all_consented | free_plan | paid_plan | registered_range | training_step | manual | test_recipient
  audience_filter TEXT NOT NULL DEFAULT '{}', -- JSON: registeredFrom/registeredTo/trainingStep/userIds/testEmail
  status TEXT NOT NULL DEFAULT 'draft', -- draft | scheduled | sending | sent | completed | partially_failed | failed | cancelled
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  unsubscribed_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (template_id) REFERENCES email_templates(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status, created_at);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_template ON email_campaigns(template_id);

-- One row per intended recipient per campaign. Rows are created 'pending'
-- when a campaign is queued and are advanced by the batch sender
-- (pending -> sent/failed) and by Resend delivery webhooks
-- (sent -> delivered/bounced/unsubscribed). A row's status is only ever
-- moved forwards, which is what makes re-running the sender idempotent.
CREATE TABLE IF NOT EXISTS email_deliveries (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  user_id TEXT, -- null for test-recipient-only audiences (no account row)
  email TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | delivered | bounced | failed | unsubscribed
  failure_reason TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_campaign ON email_deliveries(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_message_id ON email_deliveries(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_user ON email_deliveries(user_id);
