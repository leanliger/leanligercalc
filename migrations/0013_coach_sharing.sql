-- Coach access (src/lib/sharing.ts): a member's progress appears in the coach
-- dashboard only while they share it. No row = not shared (the default for
-- everyone, including existing members).
--
-- experience_id is the community they last opened the app in, so a coach's
-- request can reach them as a Whop notification.

CREATE TABLE coach_sharing (
  user_id        TEXT PRIMARY KEY,
  shared         INTEGER NOT NULL DEFAULT 0,  -- 1 while they share their progress
  shared_at      TEXT,
  requested_at   TEXT,                        -- a coach's request waiting for an answer
  requested_by   TEXT,                        -- the coach who asked
  declined_at    TEXT,                        -- last "Not now"
  experience_id  TEXT,
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
