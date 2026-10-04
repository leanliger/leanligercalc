-- Food logging (the Macros tab).
--
-- food_logs: one row per user per day. `entries` is a JSON array of foods,
--   validated by validateFoodLog() in src/lib/food.ts before it is written.
--
-- my_foods: foods a member typed in themselves, e.g. a product the barcode
--   database didn't have. `data` is a FoodProduct validated by validateMyFood().
--   `barcode` is copied out so a scan can find it.
--
-- food_cache: barcode and search results from Open Food Facts / USDA, shared
--   by everyone, so the same product isn't fetched again for every member. No
--   personal data: keys are barcodes and search phrases.

CREATE TABLE food_logs (
  user_id    TEXT NOT NULL,
  date       TEXT NOT NULL,          -- ISO yyyy-mm-dd, the user's local day
  entries    TEXT NOT NULL,          -- JSON array
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, date)
);

CREATE TABLE my_foods (
  user_id    TEXT NOT NULL,
  id         TEXT NOT NULL,
  barcode    TEXT,
  data       TEXT NOT NULL,          -- JSON FoodProduct
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE food_cache (
  key        TEXT PRIMARY KEY,       -- "bc:<barcode>" or "q:<search phrase>"
  data       TEXT NOT NULL,          -- JSON
  fetched_at INTEGER NOT NULL        -- unix seconds
);
