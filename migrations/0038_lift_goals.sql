-- Lift goals (src/lib/lift-goals.ts, worker/lift-goals.ts): up to five per
-- member, set by the member or by a coach of their whop. Hold goals keep a
-- lift at or above a number; Build goals reach one, optionally by a date.

CREATE TABLE lift_goals (
  id            TEXT PRIMARY KEY,                -- 32 hex characters
  user_id       TEXT NOT NULL,                   -- the member
  exercise_id   TEXT NOT NULL,
  name          TEXT NOT NULL,                   -- the exercise's name when set
  bodyweight    INTEGER NOT NULL DEFAULT 0,      -- 1: the target is reps
  kind          TEXT NOT NULL,                   -- hold | build
  target        REAL NOT NULL,                   -- estimated max in lb, or reps
  start_value   REAL,                            -- their value when it was set
  deadline      TEXT,                            -- build only, yyyy-mm-dd
  created_on    TEXT NOT NULL,                   -- yyyy-mm-dd
  set_by        TEXT NOT NULL,                   -- who set it (the member, or the coach's user id)
  set_by_coach  INTEGER NOT NULL DEFAULT 0,
  company_id    TEXT,                            -- the coach's whop, when a coach set it
  achieved_on   TEXT,                            -- build only: the day a workout first reached it
  achieved_value REAL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX lift_goals_user ON lift_goals (user_id);
