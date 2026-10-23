-- A coach's comment on a member's monthly photo comparison (worker/physique-focus.ts).
-- The member sees it under the comparison and gets a notification. "Delete
-- all my data" removes the comparison rows, and the comment with them.
ALTER TABLE physique_analyses ADD COLUMN coach_comment TEXT;
ALTER TABLE physique_analyses ADD COLUMN coach_comment_by TEXT;
ALTER TABLE physique_analyses ADD COLUMN coach_comment_at TEXT;
