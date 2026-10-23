-- Coach–member chat, announcements, the member's notification bell and the
-- coach's daily digest. See worker/messages.ts, worker/notifications.ts and
-- worker/digest.ts. "Delete all my data" removes a member's rows.

-- One thread per member per whop. `from_coach` = 1 when an admin wrote it;
-- `read_at` is when the other side opened the chat after it arrived.
CREATE TABLE coach_messages (
  id          TEXT PRIMARY KEY,               -- 32 hex characters
  company_id  TEXT NOT NULL,                  -- biz_…
  member_id   TEXT NOT NULL,                  -- user_…
  from_coach  INTEGER NOT NULL,
  sender_id   TEXT NOT NULL,                  -- who wrote it (the member, or the coach's user id)
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  read_at     TEXT
);
CREATE INDEX coach_messages_thread ON coach_messages (company_id, member_id, created_at);
CREATE INDEX coach_messages_member ON coach_messages (member_id, created_at);

-- Which whop an experience (the app inside a community) belongs to, from
-- Whop, so a member's messages and announcements find their coach.
CREATE TABLE experience_companies (
  experience_id TEXT PRIMARY KEY,             -- exp_…
  company_id    TEXT NOT NULL,                -- biz_…
  checked_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Announcements a coach posts to everyone, or to members with one tag.
CREATE TABLE announcements (
  id          TEXT PRIMARY KEY,               -- 32 hex characters
  company_id  TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  tag_id      TEXT,                           -- null = everyone
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX announcements_company ON announcements (company_id, created_at);

-- When the member last opened their notifications; newer ones count as unread.
CREATE TABLE notification_seen (
  user_id  TEXT PRIMARY KEY,
  seen_at  TEXT NOT NULL
);

-- A coach's daily digest: on or off, their time zone, and the day it last went out.
CREATE TABLE coach_digests (
  company_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,                  -- the coach
  enabled     INTEGER NOT NULL DEFAULT 0,
  time_zone   TEXT NOT NULL,
  sent_on     TEXT,                           -- yyyy-mm-dd in their time zone
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (company_id, user_id)
);
