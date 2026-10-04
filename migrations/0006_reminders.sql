-- Check-in reminders (weigh-in, habits, Sunday recap), sent as Whop
-- notifications by the Worker's one-minute scheduler.
--
-- One row per member with at least one reminder on; turning them all off
-- deletes the row. A NULL minute means that reminder is off. Validated by
-- validateRemindersRequest() in src/lib/reminders.ts.

CREATE TABLE reminders (
  user_id          TEXT PRIMARY KEY,
  experience_id    TEXT NOT NULL,        -- the Whop experience to notify them in
  time_zone        TEXT NOT NULL,        -- IANA, e.g. America/New_York
  weighin_minute   INTEGER,              -- local minutes after midnight, or NULL
  habits_minute    INTEGER,
  recap_minute     INTEGER,              -- Sundays only
  weighin_sent_on  TEXT,                 -- local date each one last went out
  habits_sent_on   TEXT,
  recap_sent_on    TEXT,
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
