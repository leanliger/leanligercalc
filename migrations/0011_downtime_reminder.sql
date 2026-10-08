-- Downtime reminder: a nudge to wind down 15, 20 or 30 minutes before the
-- member's bedtime, sent by the same scheduler as the other check-in
-- reminders. A NULL bedtime means it's off. Validated by
-- validateRemindersRequest() in src/lib/reminders.ts.

ALTER TABLE reminders ADD COLUMN downtime_minute INTEGER;   -- bedtime, local minutes after midnight, or NULL
ALTER TABLE reminders ADD COLUMN downtime_lead INTEGER;     -- minutes before bedtime: 15, 20 or 30
ALTER TABLE reminders ADD COLUMN downtime_sent_on TEXT;     -- local date it last went out
