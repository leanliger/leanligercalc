-- Milestone celebrations and the monthly measurement reminder.
-- See worker/milestones.ts and worker/measure-day.ts.

-- The highest milestone reached per member and kind (weight: lb lost in
-- 5 lb steps; waist: inches off in 1 in steps). Only ever goes up, so a
-- regain and re-loss doesn't celebrate the same level twice.
CREATE TABLE milestones (
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,              -- weight | waist
  level      REAL NOT NULL,
  reached_on TEXT NOT NULL,              -- the weigh-in / measurement day, yyyy-mm-dd
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, kind)
);
CREATE INDEX milestones_reached ON milestones (reached_on);

-- The member's switch for "Time to measure" (on unless they turn it off; no
-- row means on).
CREATE TABLE measurement_settings (
  user_id  TEXT PRIMARY KEY,
  reminder INTEGER NOT NULL DEFAULT 1
);

-- The newest measurement date a reminder was sent for, so each four-week gap
-- gets one reminder.
CREATE TABLE measure_day_nudges (
  user_id       TEXT PRIMARY KEY,
  measured_date TEXT NOT NULL,
  sent_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Finding members who just logged a weigh-in or measurement.
CREATE INDEX IF NOT EXISTS weigh_ins_updated ON weigh_ins (updated_at);
CREATE INDEX IF NOT EXISTS measurements_updated ON measurements (updated_at);
