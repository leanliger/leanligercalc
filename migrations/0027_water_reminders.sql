-- Hydration reminders (Food → Water; worker/water-reminders.ts and
-- src/lib/water-reminders.ts): a Whop notification at start_min, then every
-- every_min, up to end_min, in the member's time zone, until the day's six
-- bottles are ticked. sent_date / sent_slot remember the last one sent, so
-- each slot goes out once.

CREATE TABLE water_reminders (
  user_id       TEXT PRIMARY KEY,
  experience_id TEXT NOT NULL,
  time_zone     TEXT NOT NULL,
  start_min     INTEGER NOT NULL,
  end_min       INTEGER NOT NULL,
  every_min     INTEGER NOT NULL,
  sent_date     TEXT,
  sent_slot     INTEGER,
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
