-- AI check-in reply drafts, nutrition label photos, and the monthly photo-day
-- reminder. See worker/gemini.ts, worker/checkin-drafts.ts,
-- worker/label-photo.ts and worker/photo-day.ts.

-- Daily caps for the newer AI features, one counter per person, feature and
-- UTC day, counted before the model is called (like meal_photo_usage).
CREATE TABLE ai_usage (
  user_id TEXT NOT NULL,
  kind    TEXT NOT NULL,                 -- checkin-draft | label-photo
  day     TEXT NOT NULL,                 -- YYYY-MM-DD (UTC)
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, kind, day)
);

-- The member's switch for "It's photo day" (on unless they turn it off; no
-- row means on).
ALTER TABLE photo_settings ADD COLUMN photo_day INTEGER NOT NULL DEFAULT 1;

-- The newest photo date a photo-day reminder was sent for, so each four-week
-- gap gets one reminder.
CREATE TABLE photo_day_nudges (
  user_id    TEXT PRIMARY KEY,
  photo_date TEXT NOT NULL,
  sent_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
