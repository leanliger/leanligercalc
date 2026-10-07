-- Body measurements and (optional) progress photos.
--
-- measurements: one row per user per day, in inches; NULL = not measured.
--   Validated by validateMeasurement() in src/lib/measurements.ts.
--
-- progress_photos: metadata only. The image itself lives in the private R2
--   bucket under u/<user_id>/<id>.jpg; there are no public URLs.
--
-- photo_settings: whether the member lets their coach see their photos.
--   Off unless they switch it on.

CREATE TABLE measurements (
  user_id    TEXT NOT NULL,
  date       TEXT NOT NULL,
  waist      REAL,
  hips       REAL,
  chest      REAL,
  arms       REAL,
  thighs     REAL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, date)
);

CREATE TABLE progress_photos (
  user_id    TEXT NOT NULL,
  id         TEXT NOT NULL,
  date       TEXT NOT NULL,
  pose       TEXT NOT NULL,           -- front | side | back
  bytes      INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE photo_settings (
  user_id          TEXT PRIMARY KEY,
  share_with_coach INTEGER NOT NULL DEFAULT 0
);
