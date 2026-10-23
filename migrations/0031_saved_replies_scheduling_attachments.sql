-- Saved replies, scheduled chat messages and announcements, and photos and
-- voice notes in chat. See worker/saved-replies.ts and worker/messages.ts.

-- Reusable answers for check-in replies and chat, shared by a whop's admins.
CREATE TABLE coach_saved_replies (
  id          TEXT PRIMARY KEY,               -- 32 hex characters
  company_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX coach_saved_replies_company ON coach_saved_replies (company_id, created_at);

-- A coach message written now and delivered later: pending = 1 until send_at,
-- when the cron delivers it (created_at becomes send_at) and notifies them.
ALTER TABLE coach_messages ADD COLUMN pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE coach_messages ADD COLUMN send_at TEXT;
-- A photo or voice note with the message, stored privately in R2.
ALTER TABLE coach_messages ADD COLUMN attachment TEXT;          -- photo | voice
ALTER TABLE coach_messages ADD COLUMN attachment_key TEXT;      -- R2 object key
ALTER TABLE coach_messages ADD COLUMN attachment_type TEXT;     -- content type
ALTER TABLE coach_messages ADD COLUMN attachment_seconds REAL;  -- voice length
ALTER TABLE coach_messages ADD COLUMN attachment_bytes INTEGER; -- counts toward the app's file storage cap
CREATE INDEX coach_messages_pending ON coach_messages (pending, send_at);

-- An announcement posted for later: shown and sent from send_at (null = at
-- created_at). notified_at is when its Whop notification went out.
ALTER TABLE announcements ADD COLUMN send_at TEXT;
ALTER TABLE announcements ADD COLUMN notified_at TEXT;
