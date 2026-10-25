-- Accountability checks (src/lib/accountability.ts, worker/accountability.ts).

-- Per whop: on or off, sent automatically or approved by a coach first, which
-- slips send one, and the question. `coach_id` is the coach who last saved it:
-- the hourly run reads members as them (so it stops if they lose admin), and
-- `time_zone` (theirs) keeps checks to daytime.
CREATE TABLE accountability_settings (
  company_id  TEXT PRIMARY KEY,
  enabled     INTEGER NOT NULL DEFAULT 0,
  mode        TEXT NOT NULL DEFAULT 'approve',   -- approve | auto
  triggers    TEXT NOT NULL,                     -- JSON TriggerId[]
  question    TEXT NOT NULL,
  coach_id    TEXT NOT NULL,
  time_zone   TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One check to one member: waiting for approval, sent, answered or skipped.
CREATE TABLE accountability_checks (
  id           TEXT PRIMARY KEY,                 -- 32 hex characters
  company_id   TEXT NOT NULL,
  member_id    TEXT NOT NULL,
  status       TEXT NOT NULL,                    -- pending | sent | answered | skipped
  triggers     TEXT NOT NULL,                    -- JSON string[]: why, in words
  question     TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sent_at      TEXT,
  answer       TEXT,                             -- on-track | busy | struggling | help
  note         TEXT,
  choice       TEXT,                             -- two-things | pause | keep
  answered_at  TEXT
);
CREATE INDEX accountability_checks_member ON accountability_checks (member_id, created_at);
CREATE INDEX accountability_checks_company ON accountability_checks (company_id, created_at);
