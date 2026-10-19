-- Scenering Inbox (Email Centre).
--
-- The owner's conversations with customers: contact-form messages and email
-- sent to the Scenering address (Cloudflare Email Routing -> the Worker's
-- email() handler), plus the replies written in the Email Centre.
--
-- These statements are identical to INBOX_SCHEMA_STATEMENTS in
-- src/inbox-schema.ts (tests/inbox.test.ts keeps them in step). The Worker
-- also runs them itself the first time the inbox is used, because
-- production migrations are applied by hand; every statement is idempotent.
--
-- Timestamps follow the app-wide convention: ISO-8601 strings written by the
-- application, compared as text.

CREATE TABLE IF NOT EXISTS inbox_threads (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  user_id TEXT,
  mailbox TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'email',
  category TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',
  unread INTEGER NOT NULL DEFAULT 1,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT NOT NULL,
  last_direction TEXT NOT NULL DEFAULT 'in',
  last_preview TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inbox_threads_status ON inbox_threads(status, last_message_at);

CREATE INDEX IF NOT EXISTS idx_inbox_threads_contact ON inbox_threads(contact_email, last_message_at);

CREATE TABLE IF NOT EXISTS inbox_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT '',
  to_email TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  message_id TEXT,
  in_reply_to TEXT,
  references_header TEXT,
  provider_message_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'received',
  failure_reason TEXT,
  attachments TEXT NOT NULL DEFAULT '[]',
  auth_summary TEXT NOT NULL DEFAULT '',
  automated INTEGER NOT NULL DEFAULT 0,
  sent_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thread_id) REFERENCES inbox_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread ON inbox_messages(thread_id, created_at);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_message_id ON inbox_messages(message_id);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_provider ON inbox_messages(provider_message_id);

CREATE INDEX IF NOT EXISTS idx_inbox_messages_inbound ON inbox_messages(direction, created_at);

CREATE TABLE IF NOT EXISTS inbox_saved_replies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
