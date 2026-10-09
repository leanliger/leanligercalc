-- Coach assignments (src/lib/assignments.ts): programs or habit sets a coach
-- sends to everyone, a saved group, or one member. One row per assignment,
-- one target row per member it went to (with their answer), and the coach's
-- saved groups.

CREATE TABLE assignments (
  id            TEXT PRIMARY KEY,                 -- 32 hex characters
  company_id    TEXT NOT NULL,                    -- biz_…
  created_by    TEXT NOT NULL,                    -- the coach
  kind          TEXT NOT NULL,                    -- program | habits
  title         TEXT NOT NULL,
  payload       TEXT NOT NULL,                    -- JSON: the program, or the habit list
  note          TEXT NOT NULL DEFAULT '',
  audience      TEXT NOT NULL,                    -- "Everyone", a group's name, or a member's name
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  cancelled_at  TEXT
);
CREATE INDEX assignments_company ON assignments (company_id, created_at);

CREATE TABLE assignment_targets (
  assignment_id TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | declined
  responded_at  TEXT,
  PRIMARY KEY (assignment_id, user_id)
);
CREATE INDEX assignment_targets_user ON assignment_targets (user_id, status);

CREATE TABLE coach_groups (
  id          TEXT PRIMARY KEY,                   -- 32 hex characters
  company_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  member_ids  TEXT NOT NULL,                      -- JSON array of user ids
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX coach_groups_company ON coach_groups (company_id);
