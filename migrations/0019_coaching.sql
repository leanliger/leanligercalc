-- Coaching tools (worker/coaching.ts, src/lib/checkins.ts, src/lib/coach-macros.ts,
-- src/lib/challenges.ts). "Delete all my data" removes a member's rows from
-- every table here.

-- Private notes a coach keeps on a member, one per member per whop. Only the
-- whop's admins see them; the member never does.
CREATE TABLE coach_notes (
  company_id  TEXT NOT NULL,                 -- biz_…
  member_id   TEXT NOT NULL,                 -- user_…
  note        TEXT NOT NULL,
  updated_by  TEXT NOT NULL,                 -- the coach who last saved it
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (company_id, member_id)
);

-- Weekly check-ins: one per member per week (Monday). The member's answers,
-- the numbers filled in from their logs when they sent it, and the coach's reply.
CREATE TABLE checkins (
  user_id       TEXT NOT NULL,
  week_start    TEXT NOT NULL,               -- Monday of the week, yyyy-mm-dd
  answers       TEXT NOT NULL,               -- JSON CheckinAnswers
  stats         TEXT NOT NULL,               -- JSON CheckinStats
  submitted_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reply         TEXT,
  replied_by    TEXT,
  replied_at    TEXT,
  PRIMARY KEY (user_id, week_start)
);

-- Calories and macros a coach set for a member. While a row exists they are the
-- member's daily targets everywhere in the app, in place of their plan's.
CREATE TABLE coach_macros (
  user_id     TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL,
  kcal        INTEGER NOT NULL,
  protein     INTEGER NOT NULL,
  carbs       INTEGER NOT NULL,
  fat         INTEGER NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  set_by      TEXT NOT NULL,
  set_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Challenges: a scheduled program assignment with a leaderboard. Members who
-- join are entrants; their name and photo are taken from Whop when they join.
ALTER TABLE assignments ADD COLUMN challenge INTEGER NOT NULL DEFAULT 0;

CREATE TABLE challenge_entrants (
  assignment_id  TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  name           TEXT NOT NULL,
  avatar_url     TEXT,
  joined_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (assignment_id, user_id)
);
CREATE INDEX challenge_entrants_user ON challenge_entrants (user_id);
