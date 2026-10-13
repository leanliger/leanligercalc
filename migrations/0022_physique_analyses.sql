-- Physique analyses (Photos tab): a member's front, side and back photos are
-- read by a vision model, which returns a coaching breakdown. See
-- src/lib/physique.ts and worker/physique.ts.
--
-- Private to the member. The photos themselves are not sent anywhere else and
-- are not copied here; only the text that comes back is kept, so a member can
-- re-read an earlier breakdown without spending another analysis.
--
-- physique_usage caps how many a member can run in one UTC day, counted before
-- the model is called so retries cannot run up the bill. Same approach as
-- meal_photo_usage (0020_tags_meal_photos.sql).

CREATE TABLE physique_usage (
  user_id TEXT NOT NULL,
  day     TEXT NOT NULL,                            -- YYYY-MM-DD (UTC)
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE physique_analyses (
  id         TEXT PRIMARY KEY,                      -- 32 hex characters
  user_id    TEXT NOT NULL,
  source     TEXT NOT NULL,                         -- saved | upload
  photo_date TEXT,                                  -- date of the saved set, when source = saved
  analysis   TEXT NOT NULL,                         -- the model's reply, verbatim
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX physique_analyses_user ON physique_analyses (user_id, created_at);
