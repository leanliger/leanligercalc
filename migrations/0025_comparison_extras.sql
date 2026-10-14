-- Monthly comparison extras (see worker/physique.ts and worker/compare-nudges.ts).
--
-- stats: the measured numbers a comparison was given (weight, measurements,
-- lifts, habit logging), as JSON, so the card and the share image can show
-- them next to the photos.
ALTER TABLE physique_analyses ADD COLUMN stats TEXT;

-- A member's yes to their coach using their comparisons as testimonials.
-- Only a yes plus photo sharing puts a member on the coach's Testimonials list.
CREATE TABLE testimonial_consent (
  user_id    TEXT PRIMARY KEY,
  allowed    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- "Your monthly comparison is ready": the newest photo date we last told a
-- member about, so each new set is announced once.
CREATE TABLE compare_nudges (
  user_id    TEXT PRIMARY KEY,
  photo_date TEXT NOT NULL,
  sent_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
