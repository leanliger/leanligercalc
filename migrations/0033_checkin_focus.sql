-- Focus items a coach sends with a check-in reply (src/lib/checkin-report.ts):
-- up to three things for the member to do that week, shown on their Today
-- page until their next check-in. JSON string[]; null when none were sent.
ALTER TABLE checkins ADD COLUMN coach_focus TEXT;
