/**
 * Nutrition → Meal prep → Grocery list: a shop for the next few days, sized
 * to the member's macro targets from foods they pick.
 *
 * Vegetables and fruit come first at fixed daily amounts; then protein foods
 * cover the protein left, carb foods the carbs and fat foods the fat, each
 * shared evenly between the foods picked in that group (no food past a normal
 * day's amount while another can take more). Every food counts all
 * three macros, so the amounts are settled together (a few rounds of each
 * group filling what the others leave). Nutrition per 100 g is from USDA
 * FoodData Central (raw or dry weight, as bought).
 */

import type { Macros } from "./food";

export type GroceryGroup = "protein" | "carbs" | "fats" | "veg" | "fruit";

export interface Staple {
  id: string;
  name: string;
  group: GroceryGroup;
  /** As bought: raw meat, dry rice and oats. */
  per100: Macros;
  /** Counted in pieces when it's sold that way, e.g. eggs at 50 g. */
  pieceG?: number;
  piece?: string;
  /** "dry", "raw": shown with the amount. */
  as?: string;
  /** The most a day that's still a normal amount to eat (grams); the other foods in the group take the rest. */
  maxDailyG?: number;
}

export const STAPLES: Staple[] = [
  { id: "chicken", name: "Chicken breast", group: "protein", per100: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6 }, as: "raw" },
  { id: "beef93", name: "Lean ground beef (93%)", group: "protein", per100: { kcal: 152, protein: 20.9, carbs: 0, fat: 7 }, as: "raw" },
  { id: "turkey", name: "Ground turkey (93%)", group: "protein", per100: { kcal: 150, protein: 18.7, carbs: 0, fat: 8.3 }, as: "raw" },
  { id: "salmon", name: "Salmon", group: "protein", per100: { kcal: 208, protein: 20, carbs: 0, fat: 13 }, as: "raw" },
  { id: "tuna", name: "Tuna (canned in water)", group: "protein", per100: { kcal: 116, protein: 25.5, carbs: 0, fat: 0.8 }, as: "drained", maxDailyG: 150 },
  { id: "eggs", name: "Eggs", group: "protein", per100: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5 }, pieceG: 50, piece: "egg", maxDailyG: 150 },
  { id: "yogurt", name: "Greek yogurt (0%)", group: "protein", per100: { kcal: 59, protein: 10.2, carbs: 3.6, fat: 0.4 }, maxDailyG: 300 },
  { id: "cottage", name: "Cottage cheese (low fat)", group: "protein", per100: { kcal: 82, protein: 11, carbs: 3.4, fat: 2.3 }, maxDailyG: 250 },
  { id: "tofu", name: "Firm tofu", group: "protein", per100: { kcal: 144, protein: 17.3, carbs: 2.8, fat: 8.7 }, maxDailyG: 250 },
  { id: "whey", name: "Whey protein", group: "protein", per100: { kcal: 400, protein: 80, carbs: 8, fat: 6 }, pieceG: 30, piece: "scoop", maxDailyG: 60 },

  { id: "rice", name: "White rice", group: "carbs", per100: { kcal: 365, protein: 7.1, carbs: 80, fat: 0.7 }, as: "dry" },
  { id: "oats", name: "Rolled oats", group: "carbs", per100: { kcal: 389, protein: 16.9, carbs: 66.3, fat: 6.9 }, as: "dry" },
  { id: "potato", name: "Potatoes", group: "carbs", per100: { kcal: 77, protein: 2, carbs: 17.5, fat: 0.1 }, as: "raw" },
  { id: "sweetpotato", name: "Sweet potatoes", group: "carbs", per100: { kcal: 86, protein: 1.6, carbs: 20.1, fat: 0.1 }, as: "raw" },
  { id: "pasta", name: "Pasta", group: "carbs", per100: { kcal: 371, protein: 13, carbs: 74.7, fat: 1.5 }, as: "dry" },
  { id: "bread", name: "Whole wheat bread", group: "carbs", per100: { kcal: 247, protein: 13, carbs: 41, fat: 3.4 }, pieceG: 32, piece: "slice", maxDailyG: 128 },
  { id: "tortillas", name: "Flour tortillas", group: "carbs", per100: { kcal: 304, protein: 8.2, carbs: 50, fat: 7.7 }, pieceG: 45, piece: "tortilla", maxDailyG: 135 },

  { id: "oliveoil", name: "Olive oil", group: "fats", per100: { kcal: 884, protein: 0, carbs: 0, fat: 100 }, maxDailyG: 30 },
  { id: "avocado", name: "Avocados", group: "fats", per100: { kcal: 160, protein: 2, carbs: 8.5, fat: 14.7 }, pieceG: 150, piece: "avocado", maxDailyG: 150 },
  { id: "almonds", name: "Almonds", group: "fats", per100: { kcal: 579, protein: 21.2, carbs: 21.6, fat: 49.9 }, maxDailyG: 40 },
  { id: "pb", name: "Peanut butter", group: "fats", per100: { kcal: 588, protein: 25.1, carbs: 20, fat: 50.4 }, maxDailyG: 40 },
  { id: "cheese", name: "Cheddar cheese", group: "fats", per100: { kcal: 403, protein: 24.9, carbs: 1.3, fat: 33.1 }, maxDailyG: 40 },

  { id: "broccoli", name: "Broccoli", group: "veg", per100: { kcal: 34, protein: 2.8, carbs: 6.6, fat: 0.4 } },
  { id: "spinach", name: "Spinach", group: "veg", per100: { kcal: 23, protein: 2.9, carbs: 3.6, fat: 0.4 } },
  { id: "greenbeans", name: "Green beans", group: "veg", per100: { kcal: 31, protein: 1.8, carbs: 7, fat: 0.2 } },
  { id: "peppers", name: "Bell peppers", group: "veg", per100: { kcal: 26, protein: 1, carbs: 6, fat: 0.3 } },
  { id: "mixedveg", name: "Frozen mixed vegetables", group: "veg", per100: { kcal: 65, protein: 2.9, carbs: 13.1, fat: 0.5 } },

  { id: "banana", name: "Bananas", group: "fruit", per100: { kcal: 89, protein: 1.1, carbs: 22.8, fat: 0.3 }, pieceG: 120, piece: "banana" },
  { id: "berries", name: "Berries (frozen)", group: "fruit", per100: { kcal: 57, protein: 0.7, carbs: 14.5, fat: 0.3 } },
  { id: "apples", name: "Apples", group: "fruit", per100: { kcal: 52, protein: 0.3, carbs: 13.8, fat: 0.2 }, pieceG: 180, piece: "apple" },
];

/** Daily vegetables and fruit, grams, before the macro foods fill the rest. */
export const VEG_G_A_DAY = 300;
export const FRUIT_G_A_DAY = 150;

export const GROUPS: { id: GroceryGroup; label: string; hint: string }[] = [
  { id: "protein", label: "Protein", hint: "Covers the protein the rest doesn't" },
  { id: "carbs", label: "Carbs", hint: "The rest of your carbs" },
  { id: "fats", label: "Fats", hint: "The rest of your fat" },
  { id: "veg", label: "Vegetables", hint: `${VEG_G_A_DAY} g a day between them` },
  { id: "fruit", label: "Fruit", hint: `${FRUIT_G_A_DAY} g a day between them` },
];

export const DEFAULT_PICKS: string[] = ["chicken", "eggs", "yogurt", "rice", "oats", "potato", "oliveoil", "almonds", "broccoli", "spinach", "banana"];

export interface GroceryItem {
  staple: Staple;
  /** Grams for the whole shop. */
  grams: number;
  /** Whole pieces, for foods sold that way. */
  pieces: number | null;
}

export interface GroceryList {
  days: number;
  items: GroceryItem[];
  /** What the list gives a day, against the targets' daily average. */
  perDay: Macros;
  target: Pick<Macros, "protein" | "carbs" | "fat"> & { kcal: number };
  /** Groups with nothing picked that the targets still need. */
  missing: GroceryGroup[];
}

const per = (s: Staple, k: keyof Macros) => s.per100[k] / 100;

/**
 * The shop for `days` days, from their average daily targets and the foods
 * picked (staple ids). Amounts are rounded up to a sensible pack: 25 g, or
 * whole pieces.
 */
export function groceryList(target: { calories: number; protein: number; carbs: number; fat: number }, picks: readonly string[], days: number): GroceryList {
  const chosen = STAPLES.filter((s) => picks.includes(s.id));
  const of = (g: GroceryGroup) => chosen.filter((s) => s.group === g);
  const grams = new Map<string, number>();
  // Fixed amounts a day: vegetables and fruit shared between those picked.
  for (const [g, total] of [["veg", VEG_G_A_DAY], ["fruit", FRUIT_G_A_DAY]] as const) {
    for (const s of of(g)) grams.set(s.id, total / of(g).length);
  }
  const fromFixed = (k: keyof Macros) => of("veg").concat(of("fruit")).reduce((n, s) => n + grams.get(s.id)! * per(s, k), 0);
  const sumOver = (list: Staple[], k: keyof Macros) => list.reduce((n, s) => n + (grams.get(s.id) ?? 0) * per(s, k), 0);
  // Grams of each food so they share `need` of macro k evenly; a food at its daily cap passes the rest to the others.
  const fill = (list: Staple[], k: keyof Macros, need: number) => {
    let open = list.filter((s) => per(s, k) > 0);
    for (const s of list) grams.set(s.id, 0);
    let left = Math.max(0, need);
    while (open.length && left > 0.5) {
      const share = left / open.length;
      const capped = open.filter((s) => s.maxDailyG !== undefined && share / per(s, k) >= s.maxDailyG);
      if (!capped.length || capped.length === open.length) {
        // The last foods take what's left, over their caps if they must.
        for (const s of open) grams.set(s.id, share / per(s, k));
        break;
      }
      for (const s of capped) {
        grams.set(s.id, s.maxDailyG!);
        left -= s.maxDailyG! * per(s, k);
      }
      open = open.filter((s) => !capped.includes(s));
    }
  };
  const protein = of("protein");
  const carbs = of("carbs");
  const fats = of("fats");
  for (let round = 0; round < 6; round++) {
    fill(protein, "protein", target.protein - fromFixed("protein") - sumOver(carbs, "protein") - sumOver(fats, "protein"));
    fill(carbs, "carbs", target.carbs - fromFixed("carbs") - sumOver(protein, "carbs") - sumOver(fats, "carbs"));
    fill(fats, "fat", target.fat - fromFixed("fat") - sumOver(protein, "fat") - sumOver(carbs, "fat"));
  }
  const items: GroceryItem[] = chosen
    .map((s) => {
      const raw = (grams.get(s.id) ?? 0) * days;
      const pieces = s.pieceG ? Math.max(1, Math.ceil(raw / s.pieceG)) : null;
      const g = s.pieceG ? pieces! * s.pieceG : Math.ceil(raw / 25) * 25;
      return { staple: s, grams: raw > 0 ? g : 0, pieces: raw > 0 ? pieces : null };
    })
    .filter((x) => x.grams > 0);
  const daily = (k: keyof Macros) => Math.round(chosen.reduce((n, s) => n + (grams.get(s.id) ?? 0) * per(s, k), 0));
  const missing = (["protein", "carbs", "fats"] as const).filter((g) => of(g).length === 0);
  return {
    days,
    items,
    perDay: { kcal: daily("kcal"), protein: daily("protein"), carbs: daily("carbs"), fat: daily("fat") },
    target: { kcal: target.calories, protein: target.protein, carbs: target.carbs, fat: target.fat },
    missing,
  };
}

/** "1.4 kg", "650 g", or in lb and oz. */
export function amountText(item: GroceryItem, metric: boolean): string {
  const s = item.staple;
  if (item.pieces !== null && s.piece) return `${item.pieces} ${item.pieces === 1 ? s.piece : `${s.piece}s`}`;
  if (metric) return item.grams >= 1000 ? `${(item.grams / 1000).toFixed(item.grams % 1000 === 0 ? 0 : 1)} kg` : `${item.grams} g`;
  const oz = item.grams / 28.3495;
  return oz >= 16 ? `${(oz / 16).toFixed(1)} lb` : `${Math.round(oz)} oz`;
}
