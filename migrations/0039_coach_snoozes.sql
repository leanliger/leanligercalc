-- Today's queue (coach-today.tsx): a row a coach marked "Done for today" or
-- snoozed, hidden for them until `until` (yyyy-mm-dd, exclusive). Per coach,
-- per member, per reason, so a new reason for the same member still shows.

CREATE TABLE coach_snoozes (
  company_id  TEXT NOT NULL,
  coach_id    TEXT NOT NULL,
  member_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,
  until       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (company_id, coach_id, member_id, kind)
);
