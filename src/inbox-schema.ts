/**
 * Inbox schema: the owner's conversations with customers, kept in D1.
 *
 * Two kinds of message arrive here:
 *   - contact-form messages (the public /contact page), and
 *   - email sent to the Scenering address (Cloudflare Email Routing hands
 *     each message to the Worker's email() handler; see server/inbox-core.ts).
 * Replies written in the Email Centre go out through the existing email
 * provider (Resend) and are stored in the same conversation.
 *
 * The statements below are ALSO in migrations/0003_inbox.sql, and a test
 * keeps the two identical. The Worker runs them itself the first time the
 * inbox is used (ensureInboxSchema) because production migrations are
 * applied by hand: a deploy that lands before `wrangler d1 migrations apply`
 * must not break the public contact form or the email handler. Every
 * statement is idempotent, so running them again is harmless.
 */
export const INBOX_SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS inbox_threads (
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
)`,
  `CREATE INDEX IF NOT EXISTS idx_inbox_threads_status ON inbox_threads(status, last_message_at)`,
  `CREATE INDEX IF NOT EXISTS idx_inbox_threads_contact ON inbox_threads(contact_email, last_message_at)`,
  `CREATE TABLE IF NOT EXISTS inbox_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT NOT NULL DEFAULT '',
  to_email TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL DEFAULT '',
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
)`,
  `CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread ON inbox_messages(thread_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_inbox_messages_message_id ON inbox_messages(message_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inbox_messages_provider ON inbox_messages(provider_message_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inbox_messages_inbound ON inbox_messages(direction, created_at)`,
  `CREATE TABLE IF NOT EXISTS inbox_saved_replies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
];

/** Conversation states. `spam` is kept out of every normal view. */
export const INBOX_STATUSES = ["new", "open", "resolved", "closed", "spam"] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];
