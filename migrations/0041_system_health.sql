-- System health (coach dashboard → System health; worker/health.ts).

-- Each scheduled job's latest run: when it last ran, last finished cleanly or
-- failed, and what it did (counts only, as JSON). App-wide, no member data.
CREATE TABLE job_runs (
  job          TEXT PRIMARY KEY,
  last_run_at  TEXT NOT NULL,
  last_ok_at   TEXT,
  last_error_at TEXT,
  last_error   TEXT,               -- the error message, never a key or member data
  last_result  TEXT                -- JSON counts, e.g. {"due":3,"sent":3}
);

-- Every Whop notification the app sends and whether Whop took it: who it went
-- to only as the community (exp_…) or whop (biz_…), never the member. Kept 14
-- days.
CREATE TABLE notification_log (
  at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  target    TEXT NOT NULL,         -- exp_… (members) or biz_… (the whop's team)
  ok        INTEGER NOT NULL,
  status    INTEGER NOT NULL,      -- Whop's HTTP status; 0 when it didn't answer
  reason    TEXT                   -- Whop's reason when refused, never the API key
);
CREATE INDEX notification_log_by_target ON notification_log (target, at);
CREATE INDEX notification_log_by_at ON notification_log (at);
