-- Lift leaderboard (Leaderboard tab → Lifts): verified squat, bench press and
-- deadlift singles, ranked by weight ÷ bodyweight. See src/lib/lift-board.ts.
--
-- One row per submission. A submission is only shown to other members of its
-- community once an admin approves it. name / username / avatar_url are the
-- member's public Whop profile when they submitted, so the board shows the
-- same name and photo they use in the community.

CREATE TABLE lift_submissions (
  id             TEXT PRIMARY KEY,           -- 32 hex characters
  experience_id  TEXT NOT NULL,              -- exp_… (the community)
  user_id        TEXT NOT NULL,
  lift           TEXT NOT NULL,              -- squat | bench | deadlift
  weight_lb      REAL NOT NULL,
  bodyweight_lb  REAL NOT NULL,
  ratio          REAL NOT NULL,              -- weight_lb / bodyweight_lb
  lifted_on      TEXT NOT NULL,              -- ISO yyyy-mm-dd
  video_url      TEXT NOT NULL,              -- https link the member gave
  note           TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  review_note    TEXT,
  reviewed_by    TEXT,
  reviewed_at    TEXT,
  name           TEXT,
  username       TEXT,
  avatar_url     TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX lift_submissions_board ON lift_submissions (experience_id, status, lift);
CREATE INDEX lift_submissions_user ON lift_submissions (user_id, experience_id);
