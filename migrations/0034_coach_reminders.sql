-- On-demand reminders a coach sends (src/lib/coach-reminders.ts,
-- worker/coach-reminders.ts): what went to whom and when, for the 12-hour
-- wait per reminder, the daily cap per member, the member's bell and the
-- Timeline. "Delete all my data" removes a member's rows.
CREATE TABLE coach_reminders (
  id          TEXT PRIMARY KEY,               -- 32 hex characters
  company_id  TEXT NOT NULL,
  member_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,                  -- checkin | weigh-in | food | habits | workout | steps | photos | measurements | water
  sent_by     TEXT NOT NULL,
  sent_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX coach_reminders_member ON coach_reminders (member_id, sent_at);
CREATE INDEX coach_reminders_company ON coach_reminders (company_id, sent_at);
