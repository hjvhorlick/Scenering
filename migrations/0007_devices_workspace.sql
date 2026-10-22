-- 0007 — one membership, many devices.
--
-- Two things were missing from the account system:
--
--   1. A session carried no idea which machine it belonged to, so a plan's
--      "how many devices at once" benefit could not be enforced, and an
--      account could be signed in on unlimited browsers at once.
--   2. A project lived only in the browser that created it. Nothing was
--      stored server-side, so a member who opened Scenering on a second
--      computer saw an empty workspace and could work — and download —
--      independently on each machine.
--
-- Sessions gain the device that opened them (a random id the browser keeps,
-- plus a friendly label and a mobile/tablet/desktop class so a phone is
-- counted like any other device). `last_seen_at` makes the "least recently
-- used" eviction in server/platform.ts honest.
ALTER TABLE sessions ADD COLUMN device_id TEXT;
ALTER TABLE sessions ADD COLUMN device_label TEXT;
ALTER TABLE sessions ADD COLUMN platform TEXT;
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_user_device ON sessions(user_id, device_id);

-- The workspace: every `scenering_*` browser key that belongs to the craft
-- work (projects, scenes, settings, inserts, scene metadata, commit history,
-- section memory, script and title drafts) is mirrored here as one document
-- per key. The browser keeps writing localStorage exactly as before, so the
-- studio stays offline-first and instant; sync is a background conversation.
--
-- `revision` is the concurrency control: a client pushes with the revision it
-- last saw, and the server refuses (409 + current body) if someone else wrote
-- in between. That avoids trusting device clocks, which are not comparable.
-- `deleted` rows are tombstones — without them a delete on one device would
-- be trumped by the stale copy on another.
CREATE TABLE IF NOT EXISTS workspace_documents (
  user_id TEXT NOT NULL,
  doc_key TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  device_id TEXT,
  PRIMARY KEY (user_id, doc_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_workspace_documents_user ON workspace_documents(user_id);
