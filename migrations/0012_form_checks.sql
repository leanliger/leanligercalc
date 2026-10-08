-- Form checks (Training tab): a member sends a video link of a set with a
-- question, and an admin of their community replies with feedback. See
-- src/lib/form-checks.ts.
--
-- Private to the member and their community's admins; never shown to other
-- members. name / username / avatar_url are the member's Whop profile when
-- they sent it, so the coach's queue shows who's asking.

CREATE TABLE form_checks (
  id             TEXT PRIMARY KEY,                  -- 32 hex characters
  experience_id  TEXT NOT NULL,                     -- exp_… (the community)
  user_id        TEXT NOT NULL,
  exercise_id    TEXT NOT NULL,
  exercise_name  TEXT NOT NULL,
  video_url      TEXT NOT NULL,                     -- https link the member gave
  question       TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pending',   -- pending | reviewed
  feedback       TEXT,
  reviewed_by    TEXT,
  reviewed_at    TEXT,
  name           TEXT,
  username       TEXT,
  avatar_url     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX form_checks_queue ON form_checks (experience_id, status, created_at);
CREATE INDEX form_checks_user ON form_checks (user_id, experience_id, created_at);
