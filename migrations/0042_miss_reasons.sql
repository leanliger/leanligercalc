-- "What made yesterday's calorie target difficult?" (src/lib/miss-reasons.ts):
-- a member's answer for a day they logged fully and missed their calories by
-- more than 10%, shown to their coach. One row per member, day and kind; a
-- NULL reason is a skip, so the question isn't asked again.
CREATE TABLE miss_reasons (
  user_id     TEXT NOT NULL,
  date        TEXT NOT NULL,               -- yyyy-mm-dd: the day missed
  kind        TEXT NOT NULL,               -- calories
  reason      TEXT,                        -- busy | hunger | energy | travel | social | forgot | other; NULL = skipped
  note        TEXT NOT NULL DEFAULT '',
  kcal        INTEGER NOT NULL,            -- what they ate that day
  target      INTEGER NOT NULL,            -- the day's calorie target
  answered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, date, kind)
);
