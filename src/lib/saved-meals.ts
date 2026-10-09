/**
 * Saved meals: a group of foods logged together ("my usual breakfast"), saved
 * from a meal in the day's log and logged again in one tap. Kept in the plan
 * document (tracking.savedMeals), so they sync like the rest of the plan.
 * Each item is re-validated like any food log entry.
 */

import { sumMacros, validateFoodEntry, type FoodEntry, type Macros, type MealId } from "./food";

export const MAX_SAVED_MEALS = 20;
export const MAX_SAVED_MEAL_ITEMS = 15;
export const SAVED_MEAL_NAME_MAX = 40;

/** A food in a saved meal: a log entry without its id and meal slot. */
export type SavedMealItem = Omit<FoodEntry, "id" | "meal">;

export interface SavedMeal {
  id: string;
  name: string;
  items: SavedMealItem[];
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

function cleanItem(raw: unknown): SavedMealItem | null {
  const v = validateFoodEntry({ ...(typeof raw === "object" && raw !== null ? raw : {}), id: "x", meal: "breakfast" });
  if (!v.ok) return null;
  const { id: _id, meal: _meal, ...item } = v.value;
  return item;
}

export function sanitizeSavedMeals(raw: unknown): SavedMeal[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedMeal[] = [];
  const seen = new Set<string>();
  for (const m of raw) {
    if (typeof m !== "object" || m === null) continue;
    const r = m as Record<string, unknown>;
    const id = typeof r.id === "string" && ID_PATTERN.test(r.id) ? r.id : null;
    const name = typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim().slice(0, SAVED_MEAL_NAME_MAX) : "";
    if (!id || !name || seen.has(id) || !Array.isArray(r.items)) continue;
    const items = r.items.map(cleanItem).filter((x): x is SavedMealItem => x !== null).slice(0, MAX_SAVED_MEAL_ITEMS);
    if (items.length === 0) continue;
    seen.add(id);
    out.push({ id, name, items });
    if (out.length >= MAX_SAVED_MEALS) break;
  }
  return out;
}

/** A saved meal from some of the day's entries. */
export function mealFromEntries(id: string, name: string, entries: readonly FoodEntry[]): SavedMeal {
  return {
    id,
    name: name.replace(/\s+/g, " ").trim().slice(0, SAVED_MEAL_NAME_MAX),
    items: entries.slice(0, MAX_SAVED_MEAL_ITEMS).map(({ id: _id, meal: _meal, ...item }) => item),
  };
}

/** Add (or replace one with the same name) — newest first, within the limit. */
export function addSavedMeal(list: readonly SavedMeal[], meal: SavedMeal): SavedMeal[] {
  const key = meal.name.toLowerCase();
  return [meal, ...list.filter((m) => m.id !== meal.id && m.name.toLowerCase() !== key)].slice(0, MAX_SAVED_MEALS);
}

/** The meal's foods as new log entries in one meal slot. */
export function entriesFromMeal(meal: SavedMeal, slot: MealId, newId: () => string): FoodEntry[] {
  return meal.items.map((item) => ({ ...item, id: newId(), meal: slot }));
}

export function mealTotals(meal: SavedMeal): Macros {
  return sumMacros(meal.items);
}
