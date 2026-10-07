-- Community streak leaderboard (opt-in).
--
-- One row per member per Whop experience they chose to join; leaving deletes
-- the row. Only these members appear on that experience's leaderboard, and
-- only their name, photo and habit-streak stats are shown — computed from
-- habit_logs when the leaderboard is viewed, never weights or food.

CREATE TABLE leaderboard (
  user_id        TEXT NOT NULL,
  experience_id  TEXT NOT NULL,        -- the Whop experience (community) they joined in
  time_zone      TEXT NOT NULL,        -- IANA; "today" for their streak is their own day
  name           TEXT,                 -- from their public Whop profile at join time
  username       TEXT,
  avatar_url     TEXT,
  joined_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, experience_id)
);

CREATE INDEX leaderboard_by_experience ON leaderboard (experience_id);
