-- Workout logs (the Training tab).
--
-- workouts: one row per workout. `data` is a JSON Workout (sets, reps and
--   weights in pounds), validated by validateWorkout() in src/lib/training.ts
--   before it is written. `date` is copied out for ordering.
--
-- Programs and a member's own exercises are small definitions and live in the
-- plan document (plans.state), next to their habits.

CREATE TABLE workouts (
  user_id    TEXT NOT NULL,
  id         TEXT NOT NULL,
  date       TEXT NOT NULL,          -- ISO yyyy-mm-dd, the user's local day
  data       TEXT NOT NULL,          -- JSON Workout
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX workouts_by_date ON workouts (user_id, date);
