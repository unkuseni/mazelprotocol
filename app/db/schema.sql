-- MazelProtocol Syndicate Chat — D1 Database Schema
--
-- Create the database in Cloudflare Dashboard, then run:
--   npx wrangler d1 execute mazel-chat --file=./db/schema.sql

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  syndicate_id TEXT    NOT NULL,
  sender       TEXT    NOT NULL,
  sender_short TEXT    NOT NULL,
  text         TEXT    NOT NULL,
  type         TEXT    NOT NULL DEFAULT 'message',  -- 'message' | 'system' | 'announcement'
  role         TEXT,                                -- 'manager' | 'member' | NULL
  is_pinned    INTEGER NOT NULL DEFAULT 0,
  reply_to     TEXT,
  created_at   INTEGER NOT NULL                     -- Unix milliseconds
);

CREATE TABLE IF NOT EXISTS reactions (
  message_id TEXT NOT NULL,
  emoji      TEXT NOT NULL,
  sender     TEXT NOT NULL,
  PRIMARY KEY (message_id, emoji, sender),
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- Index for fetching messages by syndicate, newest first
CREATE INDEX IF NOT EXISTS idx_messages_syndicate
  ON messages(syndicate_id, created_at DESC);

-- Index for fetching reactions for a message
CREATE INDEX IF NOT EXISTS idx_reactions_message
  ON reactions(message_id);
