-- Automatic nudges: rules a coach switches on per whop, and what was sent.
-- See src/lib/nudges.ts and worker/nudges.ts.

-- One row per whop and rule (no_food | no_weighin | no_workout | no_checkin).
CREATE TABLE coach_nudge_rules (
  company_id TEXT NOT NULL,
  kind       TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 0,
  days       INTEGER NOT NULL,          -- days without it before the nudge goes out
  message    TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (company_id, kind)
);

-- Each nudge sent. `anchor` is the start of the gap it was about (the last
-- day they logged it, or when they started sharing), so a gap gets one nudge.
CREATE TABLE coach_nudges_sent (
  company_id TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  anchor     TEXT NOT NULL,
  sent_on    TEXT NOT NULL,             -- yyyy-mm-dd (UTC)
  sent_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (company_id, user_id, kind, anchor)
);
CREATE INDEX coach_nudges_sent_recent ON coach_nudges_sent (company_id, sent_at);
CREATE INDEX coach_nudges_sent_user ON coach_nudges_sent (user_id, sent_on);

-- The daily check per whop: which day it last finished, so later runs that
-- day skip it.
CREATE TABLE coach_nudge_runs (
  company_id TEXT PRIMARY KEY,
  done_on    TEXT NOT NULL
);
