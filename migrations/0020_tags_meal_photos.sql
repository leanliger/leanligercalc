-- Member tags (src/lib/member-tags.ts, worker/coaching.ts): each whop's list of
-- tags (name and colour), editable on the coach dashboard, and which tags each
-- member has. Only the whop's admins see them.
CREATE TABLE coach_tags (
  company_id  TEXT PRIMARY KEY,               -- biz_…
  tags        TEXT NOT NULL,                  -- JSON MemberTag[]
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE member_tags (
  company_id  TEXT NOT NULL,
  member_id   TEXT NOT NULL,
  tag_ids     TEXT NOT NULL,                  -- JSON string[]
  PRIMARY KEY (company_id, member_id)
);

-- Meal photo estimates (worker/meal-photo.ts): how many each member used per
-- day, to cap the AI cost. The photos themselves are never stored.
CREATE TABLE meal_photo_usage (
  user_id  TEXT NOT NULL,
  day      TEXT NOT NULL,                     -- UTC yyyy-mm-dd
  n        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
