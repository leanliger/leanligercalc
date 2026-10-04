-- Prep Calculator — check-in storage.
--
-- Every row is keyed by the Whop user id taken from a verified
-- x-whop-user-token. The id is never accepted from a request body, so one user
-- cannot read or write another's rows.

-- One weigh-in per user per calendar day. Logging the same day again replaces
-- the earlier entry rather than duplicating it.
CREATE TABLE weigh_ins (
  user_id    TEXT    NOT NULL,
  date       TEXT    NOT NULL,          -- ISO yyyy-mm-dd, the user's local day
  weight_lb  REAL    NOT NULL,          -- always pounds; converted at the edge
  calories   INTEGER,                   -- optional: what they actually ate
  note       TEXT,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, date)
);

-- The user's whole calculator setup (profile, timeline, carb settings, applied
-- calorie adjustments) as one JSON document. The predicted-vs-actual
-- comparison is only meaningful against a stable plan, and browser storage
-- inside the Whop iframe is not stable — Safari partitions or blocks it.
CREATE TABLE plans (
  user_id    TEXT PRIMARY KEY,
  state      TEXT NOT NULL,             -- JSON; re-sanitised by the client on load
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
