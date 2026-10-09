-- Coach program library (src/lib/assignments.ts): programs a coach builds in
-- the dashboard and saves to reuse when assigning, with the training days and
-- number of weeks they usually run for. One row per program, per whop.

CREATE TABLE coach_programs (
  id          TEXT PRIMARY KEY,                  -- 32 hex characters
  company_id  TEXT NOT NULL,                     -- biz_…
  name        TEXT NOT NULL,
  program     TEXT NOT NULL,                     -- JSON: the program (days and exercises)
  weekdays    TEXT,                              -- JSON array, 0 = Monday … 6 = Sunday, or NULL
  weeks       INTEGER,                           -- usual length, or NULL
  created_by  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX coach_programs_company ON coach_programs (company_id, updated_at);
