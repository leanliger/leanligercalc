-- Coach edits to a member's own workout program (src/lib/program-edits.ts).
-- The member's app saves its whole plan in one piece, so the coach never
-- writes into it directly (the member's next save could overwrite the edit).
-- The edit waits here; the member's app applies it the next time it opens and
-- sets applied_at. At most one waiting edit per member and program: saving
-- again replaces it. "Delete all my data" removes a member's rows.

CREATE TABLE coach_program_edits (
  id          TEXT PRIMARY KEY,               -- 32 hex characters
  company_id  TEXT NOT NULL,                  -- biz_… the coach edited from
  member_id   TEXT NOT NULL,                  -- user_…
  program_id  TEXT NOT NULL,                  -- the member's program it replaces
  program     TEXT NOT NULL,                  -- JSON: the edited program
  created_by  TEXT NOT NULL,                  -- the coach's user id
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  applied_at  TEXT                            -- when the member's app applied it
);

CREATE INDEX coach_program_edits_member ON coach_program_edits (member_id, applied_at);
