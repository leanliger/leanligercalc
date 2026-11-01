/**
 * Recipes (Nutrition → Meal prep): ingredients with their amounts, and how
 * many servings it makes, so a home-cooked dish logs as "1 serving" with the
 * right calories and macros. Kept in the plan document (tracking.recipes),
 * so they sync like saved meals; each ingredient is re-validated like any
 * food log entry.
 */

import { roundMacros, scaleMacros, sumMacros, validateFoodEntry, type FoodEntry, type Macros, type MealId } from "./food";

export const MAX_RECIPES = 30;
export const MAX_RECIPE_ITEMS = 30;
export const RECIPE_NAME_MAX = 50;
export const MAX_SERVINGS = 50;

/** An ingredient: a log entry without its id and meal slot (its macros are for the amount used). */
export type RecipeItem = Omit<FoodEntry, "id" | "meal">;

export interface Recipe {
  id: string;
  name: string;
  /** How many servings the whole recipe makes. */
  servings: number;
  items: RecipeItem[];
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

function cleanItem(raw: unknown): RecipeItem | null {
  const v = validateFoodEntry({ ...(typeof raw === "object" && raw !== null ? raw : {}), id: "x", meal: "dinner" });
  if (!v.ok) return null;
  const { id: _id, meal: _meal, ...item } = v.value;
  return item;
}

export const cleanServings = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(MAX_SERVINGS, Math.max(1, Math.round(n * 2) / 2)) : 1);

export function sanitizeRecipes(raw: unknown): Recipe[] {
  if (!Array.isArray(raw)) return [];
  const out: Recipe[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as Record<string, unknown>;
    const id = typeof o.id === "string" && ID_PATTERN.test(o.id) ? o.id : null;
    const name = typeof o.name === "string" ? o.name.replace(/\s+/g, " ").trim().slice(0, RECIPE_NAME_MAX) : "";
    if (!id || !name || seen.has(id) || !Array.isArray(o.items)) continue;
    const items = o.items.map(cleanItem).filter((x): x is RecipeItem => x !== null).slice(0, MAX_RECIPE_ITEMS);
    if (items.length === 0) continue;
    seen.add(id);
    out.push({ id, name, servings: cleanServings(o.servings), items });
    if (out.length >= MAX_RECIPES) break;
  }
  return out;
}

export const recipeTotals = (r: Pick<Recipe, "items">): Macros => roundMacros(sumMacros(r.items));

export const perServing = (r: Pick<Recipe, "items" | "servings">): Macros => roundMacros(scaleMacros(sumMacros(r.items), 1 / r.servings));

/** Add, or replace the one with the same id: newest first, within the limit. */
export function saveRecipe(list: readonly Recipe[], recipe: Recipe): Recipe[] {
  return [recipe, ...list.filter((r) => r.id !== recipe.id)].slice(0, MAX_RECIPES);
}

/** `servings` of a recipe as one food log entry. */
export function recipeEntry(r: Recipe, servings: number, meal: MealId, id: string): FoodEntry {
  const m = roundMacros(scaleMacros(perServing(r), servings));
  return {
    id,
    meal,
    name: r.name,
    brand: null,
    barcode: null,
    quantity: servings,
    unit: "serving",
    servingLabel: `1 of ${r.servings} servings`,
    ...m,
  };
}
