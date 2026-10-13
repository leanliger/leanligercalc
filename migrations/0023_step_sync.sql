-- iPhone step sync (Progress → Habits → Step sync). An Apple Shortcut posts
-- the day's step count to /api/steps-sync with a personal key, since a web
-- app can't read Apple Health itself. See worker/steps-sync.ts.
--
-- Only a SHA-256 hash of the key is stored; the key itself is shown to the
-- member once. One key per member: making a new one replaces the old, and
-- the key can do nothing but save a step count.

CREATE TABLE step_tokens (
  user_id      TEXT PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT,
  last_steps   INTEGER,
  last_date    TEXT                                  -- the day those steps were for
);
