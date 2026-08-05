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

-- Index for global message queries (moderation, admin dashboards)
CREATE INDEX IF NOT EXISTS idx_messages_created_at
  ON messages(created_at DESC);

-- Index for filtering system/announcement messages across syndicates
CREATE INDEX IF NOT EXISTS idx_messages_type_created
  ON messages(type, created_at DESC);

-- ============================================================================
-- Prelaunch Waitlist
-- ============================================================================

CREATE TABLE IF NOT EXISTS waitlist_entries (
  email      TEXT PRIMARY KEY,               -- normalized lowercase email
  wallet     TEXT,                           -- optional Solana address (base58)
  source     TEXT    NOT NULL DEFAULT 'landing', -- acquisition source
  referrer   TEXT,                           -- utm_source / campaign / referrer
  ip_hash    TEXT,                           -- SHA-256 hash of client IP (rate limiting)
  last_signup_at INTEGER NOT NULL,           -- Unix ms (rate limiting + re-signup)
  created_at INTEGER NOT NULL                -- Unix ms (original signup)
);

-- Lookup by join date (leaderboard / stats)
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at
  ON waitlist_entries(created_at ASC);

-- Rate-limit lookups per client
CREATE INDEX IF NOT EXISTS idx_waitlist_ip_hash
  ON waitlist_entries(ip_hash);
