-- The mid-week check on a check-in's focus items (worker/focus-nudges.ts).
-- coach_focus_kinds: what each focus item is about (weigh-ins, food-days,
-- protein, steps, workouts, …; src/lib/checkin-report.ts), JSON string[],
-- so progress can be counted. focus_nudge: 'pending' until it goes out,
-- 'off' when the coach unticked it, else when it was sent.
ALTER TABLE checkins ADD COLUMN coach_focus_kinds TEXT;
ALTER TABLE checkins ADD COLUMN focus_nudge TEXT;
CREATE INDEX checkins_focus_nudge ON checkins (focus_nudge, replied_at);
