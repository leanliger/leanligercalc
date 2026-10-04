-- Weekly self-audit (scorecard page two): one row per user per Mon–Sun week.
-- Validated by validateReview() in src/lib/reviews.ts before it is written.

CREATE TABLE weekly_reviews (
  user_id    TEXT NOT NULL,
  week_start TEXT NOT NULL,          -- ISO yyyy-mm-dd, always a Monday
  wins       TEXT NOT NULL,          -- JSON array of 3 strings
  friction   TEXT NOT NULL,
  rule       TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, week_start)
);
