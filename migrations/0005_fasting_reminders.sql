-- Intermittent fasting notifications (Macros tab).
--
-- One row per member who switched them on; turning them off deletes the row.
-- The Worker's one-minute scheduler reads this table and sends a Whop
-- notification when a member's eating window opens and when it closes, in
-- their own time zone. Validated by validateReminderRequest() in
-- src/lib/fasting.ts.

CREATE TABLE fasting_reminders (
  user_id        TEXT PRIMARY KEY,
  experience_id  TEXT NOT NULL,        -- the Whop experience to notify them in
  time_zone      TEXT NOT NULL,        -- IANA, e.g. America/New_York
  open_minute    INTEGER NOT NULL,     -- local minutes after midnight
  close_minute   INTEGER NOT NULL,
  first_label    TEXT NOT NULL,
  first_time     TEXT NOT NULL,        -- "HH:MM"
  last_label     TEXT NOT NULL,
  last_time      TEXT NOT NULL,
  meal_count     INTEGER NOT NULL,
  open_sent_on   TEXT,                 -- local date the last "open" went out
  close_sent_on  TEXT,
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
