-- Every time a coach sets a member's macros (coach_macros keeps only the
-- latest), for "What moved the needle" (src/lib/needle.ts). From this
-- migration on; earlier changes only show as the current macros.
-- "Delete all my data" removes a member's rows.
CREATE TABLE coach_macro_history (
  user_id    TEXT NOT NULL,
  company_id TEXT NOT NULL,
  kcal       INTEGER NOT NULL,
  protein    INTEGER NOT NULL,
  carbs      INTEGER NOT NULL,
  fat        INTEGER NOT NULL,
  set_by     TEXT NOT NULL,
  set_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX coach_macro_history_user ON coach_macro_history (user_id, set_at);
