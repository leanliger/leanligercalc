-- Progress photo uploads per member per day (UTC), for the daily upload limit
-- (MAX_PHOTO_UPLOADS_PER_DAY in src/lib/photos.ts). Counts every upload,
-- including photos deleted afterwards, so deleting and re-uploading can't get
-- around the limit. Only today's row is kept; older days are cleared on the
-- next upload, and "Delete all my data" removes them.

CREATE TABLE photo_uploads (
  user_id TEXT NOT NULL,
  day     TEXT NOT NULL,      -- YYYY-MM-DD, UTC
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
