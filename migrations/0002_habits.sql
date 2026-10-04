-- Daily habit logs: one row per user per day.
--
-- `entries` is a small JSON object keyed by habit id, e.g.
--   {"training": true, "water": 2.5, "steps": 11200}
-- validated by validateHabitEntries() in src/lib/habits.ts before it is
-- written. Habit *definitions* live in the plan document (plans.state).

CREATE TABLE habit_logs (
  user_id    TEXT NOT NULL,
  date       TEXT NOT NULL,          -- ISO yyyy-mm-dd, the user's local day
  entries    TEXT NOT NULL,          -- JSON object
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, date)
);
