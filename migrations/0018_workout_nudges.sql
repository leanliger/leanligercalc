-- Reminders to finish a workout left open (worker/workout-nudges.ts,
-- src/lib/workout-nudge.ts). The minute scheduler finds in-progress workouts
-- with no change for 10 minutes and sends a Whop notification, then another
-- every 5 minutes while nothing changes, up to a limit. One row per workout
-- it has reminded about: when the last one went out and how many so far.
-- Deleting a workout, or "Delete all my data", removes its rows; rows older
-- than two days are cleared by the scheduler.

CREATE TABLE workout_nudges (
  user_id    TEXT NOT NULL,
  workout_id TEXT NOT NULL,
  sent_at    TEXT NOT NULL,              -- the last reminder, ISO UTC
  sent_count INTEGER NOT NULL DEFAULT 1, -- reminders since the last change to the workout
  PRIMARY KEY (user_id, workout_id)
);

-- The scheduler looks for workouts changed in the last hour or so.
CREATE INDEX workouts_by_updated ON workouts (updated_at);
