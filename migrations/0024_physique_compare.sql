-- Monthly physique comparison (Progress → Photos): the newest front / side /
-- back photos are compared with the set from about a month earlier. Stored in
-- physique_analyses with source = 'compare'; photo_date is the newer set's
-- date, before_date the older set's, and photo_ids which photos were used
-- ({"before": {"front": id, …}, "after": {…}}), so both sides can be shown
-- again (a photo deleted since just shows as missing). See worker/physique.ts.

ALTER TABLE physique_analyses ADD COLUMN before_date TEXT;
ALTER TABLE physique_analyses ADD COLUMN photo_ids TEXT;
