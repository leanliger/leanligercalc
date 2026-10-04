/**
 * Food logging: what a member ate, measured against the day's macro targets.
 *
 * Shared by the browser and the Worker, like weigh-ins and habits, so both
 * agree on exactly what a valid food log is; the Worker re-validates
 * everything regardless of what the client sent.
 *
 * Product data comes from two databases, normalised here into one shape:
 *
 *   Open Food Facts         free and open, no key; the barcode source
 *   USDA FoodData Central   optional (needs a free key); adds US brands and
 *                           whole foods such as "chicken breast"
 *
 * A member's own entries ("my foods") override both for the same barcode, so a
 * product that's missing or wrong in the database only has to be typed once.
 */

import { addDays, isValidISODate, toISODate } from "./dates";
import type { ValidationResult } from "./tracking";
import type { HabitDef, HabitEntries } from "./habits";

/* --------------------------------- types --------------------------------- */

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const ZERO_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export type MealId = "breakfast" | "lunch" | "dinner" | "snacks";

export const MEALS: readonly { id: MealId; label: string }[] = [
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "snacks", label: "Snacks" },
];
const MEAL_IDS = MEALS.map((m) => m.id);

/** How a logged amount is measured: label servings, or grams / millilitres. */
export type FoodUnit = "serving" | "g" | "ml";
const FOOD_UNITS: readonly FoodUnit[] = ["serving", "g", "ml"];

/** "recent" marks a product rebuilt from a past log entry (client-side only). */
export type FoodSource = "off" | "usda" | "mine" | "recent";

/** A product as found in a database, or as saved by the member. */
export interface FoodProduct {
  /** Stable identity: "off:<barcode>", "usda:<fdcId>" or "mine:<id>". */
  key: string;
  source: FoodSource;
  barcode: string | null;
  name: string;
  brand: string | null;
  /** Nutrition per 100 g, or per 100 ml when `baseUnit` is "ml". */
  per100: Macros | null;
  /** Nutrition for one serving as printed on the label. */
  perServing: Macros | null;
  /** The label's serving description, e.g. "1 bar (60 g)". */
  servingLabel: string | null;
  /** Size of one serving in `baseUnit`, when known. */
  servingSize: number | null;
  baseUnit: "g" | "ml";
}

/** One line in a day's food log. Macros are totals for the amount eaten. */
export interface FoodEntry {
  id: string;
  meal: MealId;
  name: string;
  brand: string | null;
  barcode: string | null;
  quantity: number;
  unit: FoodUnit;
  /** Only for servings: what one serving is, e.g. "1 scoop (32 g)". */
  servingLabel: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FoodLog {
  date: string;
  entries: FoodEntry[];
}

/* -------------------------------- limits -------------------------------- */

export const MAX_FOOD_ENTRIES_PER_DAY = 80;
/** About ten years of daily logs. */
export const MAX_FOOD_LOG_DAYS = 3700;
export const MAX_MY_FOODS = 500;
/** Meals can be planned this many days ahead ("pre-log before you eat"). */
export const FOOD_DAYS_AHEAD = 7;
/** Longest date range one request may ask for. */
export const MAX_FOOD_RANGE_DAYS = 400;

export const FOOD_NAME_MAX = 100;
export const FOOD_BRAND_MAX = 60;
export const SERVING_LABEL_MAX = 60;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const BARCODE_PATTERN = /^\d{8,14}$/;

const QUANTITY_MAX: Record<FoodUnit, number> = { serving: 100, g: 5000, ml: 5000 };
const ENTRY_KCAL_MAX = 20000;
const ENTRY_GRAMS_MAX = 2000;
/** Per 100 g nothing exceeds pure fat (~900 kcal) or 100 g of anything. */
const PER100_KCAL_MAX = 950;

/** Logging tolerances for the habit scorecard's protein and calorie boxes. */
export const PROTEIN_TOLERANCE_G = 10;
export const CALORIE_TOLERANCE_KCAL = 100;

/* ------------------------------ arithmetic ------------------------------ */

const r1 = (n: number) => Math.round(n * 10) / 10;

export function roundMacros(m: Macros): Macros {
  return { kcal: Math.round(m.kcal), protein: r1(m.protein), carbs: r1(m.carbs), fat: r1(m.fat) };
}

export function scaleMacros(m: Macros, factor: number): Macros {
  return { kcal: m.kcal * factor, protein: m.protein * factor, carbs: m.carbs * factor, fat: m.fat * factor };
}

export function sumMacros(items: readonly Macros[]): Macros {
  const total = items.reduce(
    (s, m) => ({ kcal: s.kcal + m.kcal, protein: s.protein + m.protein, carbs: s.carbs + m.carbs, fat: s.fat + m.fat }),
    { ...ZERO_MACROS },
  );
  return roundMacros(total);
}

/** Calories implied by the macros (4 / 4 / 9 kcal per gram). */
export function kcalFromMacros(m: Pick<Macros, "protein" | "carbs" | "fat">): number {
  return Math.round(m.protein * 4 + m.carbs * 4 + m.fat * 9);
}

/**
 * When the stated calories and the macros disagree badly, one of the numbers is
 * probably mistyped. Fibre, sugar alcohols and alcohol explain small gaps, so
 * only a large one is flagged.
 */
export function caloriesLookOff(m: Macros): { stated: number; fromMacros: number } | null {
  const fromMacros = kcalFromMacros(m);
  const gap = Math.abs(m.kcal - fromMacros);
  if (gap <= 40 || gap <= 0.3 * Math.max(m.kcal, fromMacros)) return null;
  return { stated: Math.round(m.kcal), fromMacros };
}

/** Which amounts a product can be logged in. */
export function availableUnits(p: FoodProduct): FoodUnit[] {
  const units: FoodUnit[] = [];
  if (p.perServing || (p.per100 && p.servingSize)) units.push("serving");
  if (p.per100 || (p.perServing && p.servingSize)) units.push(p.baseUnit);
  return units;
}

export function hasNutrition(p: FoodProduct): boolean {
  return availableUnits(p).length > 0;
}

/** Macros for an amount of a product, or null if that unit can't be worked out. */
export function macrosFor(p: FoodProduct, quantity: number, unit: FoodUnit): Macros | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (unit === "serving") {
    if (p.perServing) return roundMacros(scaleMacros(p.perServing, quantity));
    if (p.per100 && p.servingSize) return roundMacros(scaleMacros(p.per100, (quantity * p.servingSize) / 100));
    return null;
  }
  if (unit !== p.baseUnit) return null;
  if (p.per100) return roundMacros(scaleMacros(p.per100, quantity / 100));
  if (p.perServing && p.servingSize) return roundMacros(scaleMacros(p.perServing, quantity / p.servingSize));
  return null;
}

/** A sensible starting amount: one serving, or 100 g. */
export function defaultAmount(p: FoodProduct): { quantity: number; unit: FoodUnit } | null {
  const units = availableUnits(p);
  if (units.includes("serving")) return { quantity: 1, unit: "serving" };
  if (units[0]) return { quantity: 100, unit: units[0] };
  return null;
}

export function unitLabel(unit: FoodUnit, quantity: number): string {
  if (unit === "serving") return quantity === 1 ? "serving" : "servings";
  return unit;
}

/**
 * Rebuild a product from a logged entry, so a recent food can be added again
 * at any amount in the same unit.
 */
export function productFromEntry(e: FoodEntry): FoodProduct {
  const per = scaleMacros(e, 1 / e.quantity);
  const base: "g" | "ml" = e.unit === "ml" ? "ml" : "g";
  return {
    key: `recent:${e.barcode ?? `${e.name}|${e.brand ?? ""}`.toLowerCase()}|${e.unit}`,
    source: "recent",
    barcode: e.barcode,
    name: e.name,
    brand: e.brand,
    per100: e.unit === "serving" ? null : scaleMacros(per, 100),
    perServing: e.unit === "serving" ? per : null,
    servingLabel: e.unit === "serving" ? e.servingLabel : null,
    servingSize: null,
    baseUnit: base,
  };
}

/** The most recently logged distinct foods, newest first. */
export function recentFoods(logs: readonly FoodLog[], limit = 12): FoodEntry[] {
  const seen = new Set<string>();
  const out: FoodEntry[] = [];
  const byDateDesc = [...logs].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const log of byDateDesc) {
    for (let i = log.entries.length - 1; i >= 0; i--) {
      const e = log.entries[i]!;
      const key = `${e.barcode ?? `${e.name}|${e.brand ?? ""}`.toLowerCase()}|${e.unit}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** The meal a member is most likely logging at this hour. */
export function defaultMeal(hour: number): MealId {
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 21) return "dinner";
  return "snacks";
}

/* --------------------------- habit scorecard --------------------------- */

export interface TargetHits {
  protein: boolean;
  calories: boolean;
}

/** Whether a day's food log lands on its protein and calorie targets. */
export function targetHits(totals: Macros, target: { protein: number; calories: number }): TargetHits {
  return {
    protein: Math.abs(totals.protein - target.protein) <= PROTEIN_TOLERANCE_G,
    calories: Math.abs(totals.kcal - target.calories) <= CALORIE_TOLERANCE_KCAL,
  };
}

/**
 * Set the scorecard's protein and calorie ticks to match the food log. Only
 * tick-box habits linked to protein or calories are touched; everything else in
 * the day is left as it was. Returns null when nothing changes.
 */
export function applyFoodTicks(defs: readonly HabitDef[], entries: HabitEntries, hits: TargetHits): HabitEntries | null {
  const next: HabitEntries = { ...entries };
  let changed = false;
  for (const def of defs) {
    if (def.kind !== "check" || (def.link !== "protein" && def.link !== "calories")) continue;
    const hit = def.link === "protein" ? hits.protein : hits.calories;
    const was = next[def.id] === true;
    if (hit === was) continue;
    if (hit) next[def.id] = true;
    else delete next[def.id];
    changed = true;
  }
  return changed ? next : null;
}

/* -------------------------------- barcodes ------------------------------- */

/** GTIN check digit (EAN-8, UPC-A, EAN-13, GTIN-14). */
export function isValidGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i]! * w;
  return (10 - (sum % 10)) % 10 === check;
}

/** Expand an 8-digit UPC-E code to its 12-digit UPC-A form. */
export function upcEToUpcA(code: string): string | null {
  if (!/^[01]\d{7}$/.test(code)) return null;
  const ns = code[0]!;
  const d = code.slice(1, 7);
  const check = code[7]!;
  const last = Number(d[5]);
  let body: string;
  if (last <= 2) body = `${d[0]}${d[1]}${d[5]}0000${d[2]}${d[3]}${d[4]}`;
  else if (last === 3) body = `${d[0]}${d[1]}${d[2]}00000${d[3]}${d[4]}`;
  else if (last === 4) body = `${d[0]}${d[1]}${d[2]}${d[3]}00000${d[4]}`;
  else body = `${d.slice(0, 5)}0000${d[5]}`;
  const upcA = `${ns}${body}${check}`;
  return isValidGtin(upcA) ? upcA : null;
}

/**
 * Clean up a typed or scanned barcode. Returns null when it isn't a valid
 * retail barcode, which catches nearly every typo.
 */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (isValidGtin(digits)) return digits;
  // A UPC-E code's check digit belongs to its expanded form.
  if (digits.length === 8 && upcEToUpcA(digits)) return digits;
  return null;
}

/** Codes to try in a database, in order: as given, then UPC-E expanded. */
export function barcodeCandidates(code: string): string[] {
  const out = [code];
  if (code.length === 8) {
    const expanded = upcEToUpcA(code);
    if (expanded) out.push(expanded);
  }
  return out;
}

/* ------------------------------ normalising ------------------------------ */

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function finite(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** "CHOBANI GREEK YOGURT" → "Chobani Greek Yogurt". Mixed case is left alone. */
function tidyCase(text: string): string {
  if (text !== text.toUpperCase() || !/[A-Z]/.test(text)) return text;
  return text.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/**
 * Build a macro set from raw values. Missing calories are worked out from the
 * macros; a missing macro counts as zero only if the rest are present.
 */
function buildMacros(
  kcal: number | null,
  protein: number | null,
  carbs: number | null,
  fat: number | null,
): Macros | null {
  const present = [protein, carbs, fat].filter((v) => v !== null).length;
  if (kcal === null && present < 3) return null;
  if (kcal !== null && present < 2) return null;
  const m = { protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 };
  return { kcal: kcal ?? kcalFromMacros(m), ...m };
}

function plausiblePer100(m: Macros | null): Macros | null {
  if (!m) return null;
  if (m.kcal > PER100_KCAL_MAX || m.protein > 100 || m.carbs > 100 || m.fat > 100) return null;
  if (m.protein + m.carbs + m.fat > 105) return null;
  return m;
}

const KJ_PER_KCAL = 4.184;

/** Open Food Facts product fields this app reads; fetching only these keeps responses small. */
export const OFF_PRODUCT_FIELDS = [
  "code",
  "product_name",
  "product_name_en",
  "generic_name",
  "abbreviated_product_name",
  "brands",
  "serving_size",
  "serving_quantity",
  "serving_quantity_unit",
  "nutrition_data_per",
  "nutriments",
].join(",");

/** Open Food Facts `product` object → FoodProduct. */
export function normalizeOffProduct(raw: unknown, barcode: string): FoodProduct | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  const n = (typeof p.nutriments === "object" && p.nutriments !== null ? p.nutriments : {}) as Record<string, unknown>;

  const read = (suffix: "_100g" | "_serving"): Macros | null => {
    let kcal = finite(n[`energy-kcal${suffix}`]);
    if (kcal === null) {
      const kj = finite(n[`energy-kj${suffix}`]) ?? finite(n[`energy${suffix}`]);
      if (kj !== null) kcal = kj / KJ_PER_KCAL;
    }
    return buildMacros(kcal, finite(n[`proteins${suffix}`]), finite(n[`carbohydrates${suffix}`]), finite(n[`fat${suffix}`]));
  };

  const name =
    cleanText(p.product_name, FOOD_NAME_MAX) ??
    cleanText(p.product_name_en, FOOD_NAME_MAX) ??
    cleanText(p.generic_name, FOOD_NAME_MAX) ??
    cleanText(p.abbreviated_product_name, FOOD_NAME_MAX);
  const brandsRaw = Array.isArray(p.brands) ? p.brands.join(",") : p.brands;
  const brand = cleanText(typeof brandsRaw === "string" ? brandsRaw.split(",")[0] : null, FOOD_BRAND_MAX);
  const unitRaw = typeof p.serving_quantity_unit === "string" ? p.serving_quantity_unit.toLowerCase() : "";
  const baseUnit: "g" | "ml" = unitRaw === "ml" || p.nutrition_data_per === "100ml" ? "ml" : "g";
  const servingSize = finite(p.serving_quantity);

  return {
    key: `off:${barcode}`,
    source: "off",
    barcode,
    name: name ?? (brand ? `${brand} product` : "Unnamed product"),
    brand,
    per100: plausiblePer100(read("_100g")),
    perServing: read("_serving"),
    servingLabel: cleanText(p.serving_size, SERVING_LABEL_MAX),
    servingSize: servingSize && servingSize > 0 && servingSize <= 5000 ? servingSize : null,
    baseUnit,
  };
}

interface UsdaNutrient {
  nutrientNumber?: string;
  number?: string;
  value?: number;
  amount?: number;
  unitName?: string;
  nutrient?: { number?: string; unitName?: string };
}

/** One USDA FoodData Central search hit → FoodProduct. */
export function normalizeUsdaFood(raw: unknown): FoodProduct | null {
  if (typeof raw !== "object" || raw === null) return null;
  const f = raw as Record<string, unknown>;
  const fdcId = finite(f.fdcId);
  const description = cleanText(f.description, FOOD_NAME_MAX);
  if (fdcId === null || !description) return null;

  const values = new Map<string, number>();
  for (const item of Array.isArray(f.foodNutrients) ? (f.foodNutrients as UsdaNutrient[]) : []) {
    const num = item.nutrientNumber ?? item.number ?? item.nutrient?.number;
    const value = finite(item.value ?? item.amount);
    if (num && value !== null && !values.has(num)) values.set(num, value);
  }
  // 208 = Energy (kcal); Foundation foods sometimes only carry the Atwater
  // figures (958 general, 957 specific) or kJ (268).
  const kj = values.get("268");
  const kcal = values.get("208") ?? values.get("958") ?? values.get("957") ?? (kj !== undefined ? kj / KJ_PER_KCAL : null);
  const per100 = plausiblePer100(
    buildMacros(kcal, values.get("203") ?? null, values.get("205") ?? null, values.get("204") ?? null),
  );

  const unitRaw = typeof f.servingSizeUnit === "string" ? f.servingSizeUnit.toLowerCase() : "";
  const baseUnit: "g" | "ml" = unitRaw === "ml" || unitRaw === "mlt" ? "ml" : "g";
  const sizeKnown = unitRaw === "g" || unitRaw === "grm" || unitRaw === "ml" || unitRaw === "mlt";
  const servingSize = sizeKnown ? finite(f.servingSize) : null;
  const household = cleanText(f.householdServingFullText, 40);
  const servingLabel = servingSize
    ? cleanText(household ? `${household} (${Math.round(servingSize)} ${baseUnit})` : `${Math.round(servingSize)} ${baseUnit}`, SERVING_LABEL_MAX)
    : null;
  const gtin = typeof f.gtinUpc === "string" ? f.gtinUpc.replace(/\D/g, "") : "";

  return {
    key: `usda:${fdcId}`,
    source: "usda",
    barcode: BARCODE_PATTERN.test(gtin) ? gtin : null,
    name: tidyCase(description),
    brand: cleanText(f.brandName, FOOD_BRAND_MAX) ?? cleanText(f.brandOwner, FOOD_BRAND_MAX),
    per100,
    perServing: null,
    servingLabel,
    servingSize: servingSize && servingSize > 0 && servingSize <= 5000 ? servingSize : null,
    baseUnit,
  };
}

/** Whether two barcodes are the same product, ignoring leading zeros. */
export function sameBarcode(a: string, b: string): boolean {
  return a.replace(/^0+/, "") === b.replace(/^0+/, "");
}

/* ------------------------------- validation ------------------------------ */

/**
 * Food can be logged for any past day back to 2000 and up to a week ahead,
 * plus two days of slack for time zones ahead of the server's UTC.
 */
export function isAcceptableFoodDate(date: string, now: Date = new Date()): boolean {
  if (!isValidISODate(date)) return false;
  const todayUtc = toISODate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())));
  return date >= "2000-01-01" && date <= addDays(todayUtc, FOOD_DAYS_AHEAD + 2);
}

function validNumber(value: unknown, max: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

function validMacros(raw: unknown, kcalMax: number, gramsMax: number): Macros | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const kcal = validNumber(m.kcal, kcalMax);
  const protein = validNumber(m.protein, gramsMax);
  const carbs = validNumber(m.carbs, gramsMax);
  const fat = validNumber(m.fat, gramsMax);
  if (kcal === null || protein === null || carbs === null || fat === null) return null;
  return roundMacros({ kcal, protein, carbs, fat });
}

function optionalText(value: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || value.length > max * 2) return { ok: false };
  return { ok: true, value: cleanText(value, max) };
}

export function validateFoodEntry(raw: unknown): ValidationResult<FoodEntry> {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Each food must be an object." };
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== "string" || !ID_PATTERN.test(e.id)) return { ok: false, error: "Invalid food id." };
  if (typeof e.meal !== "string" || !(MEAL_IDS as string[]).includes(e.meal)) {
    return { ok: false, error: "Meal must be breakfast, lunch, dinner or snacks." };
  }
  const name = typeof e.name === "string" && e.name.length <= FOOD_NAME_MAX * 2 ? cleanText(e.name, FOOD_NAME_MAX) : null;
  if (!name) return { ok: false, error: "Every food needs a name." };
  const brand = optionalText(e.brand, FOOD_BRAND_MAX);
  if (!brand.ok) return { ok: false, error: "Brand is too long." };
  const servingLabel = optionalText(e.servingLabel, SERVING_LABEL_MAX);
  if (!servingLabel.ok) return { ok: false, error: "Serving description is too long." };
  let barcode: string | null = null;
  if (e.barcode !== null && e.barcode !== undefined) {
    if (typeof e.barcode !== "string" || !BARCODE_PATTERN.test(e.barcode)) {
      return { ok: false, error: "Barcode must be 8–14 digits." };
    }
    barcode = e.barcode;
  }
  if (typeof e.unit !== "string" || !(FOOD_UNITS as string[]).includes(e.unit)) {
    return { ok: false, error: "Unit must be serving, g or ml." };
  }
  const unit = e.unit as FoodUnit;
  const quantity = validNumber(e.quantity, QUANTITY_MAX[unit]);
  if (quantity === null || quantity <= 0) {
    return { ok: false, error: `Amount must be more than 0 and at most ${QUANTITY_MAX[unit]} ${unit}.` };
  }
  const macros = validMacros(e, ENTRY_KCAL_MAX, ENTRY_GRAMS_MAX);
  if (!macros) return { ok: false, error: "Calories and macros must be numbers of 0 or more." };
  return {
    ok: true,
    value: {
      id: e.id,
      meal: e.meal as MealId,
      name,
      brand: brand.value,
      barcode,
      quantity: Math.round(quantity * 100) / 100,
      unit,
      servingLabel: unit === "serving" ? servingLabel.value : null,
      ...macros,
    },
  };
}

/** Validate an untrusted `{ entries: [...] }` payload for one day. */
export function validateFoodLog(raw: unknown, date: string, now?: Date): ValidationResult<FoodLog> {
  if (!isAcceptableFoodDate(date, now)) {
    return { ok: false, error: `Date must be a real calendar day, at most ${FOOD_DAYS_AHEAD} days ahead.` };
  }
  const entries = (raw as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return { ok: false, error: "Expected { entries: [...] }." };
  if (entries.length > MAX_FOOD_ENTRIES_PER_DAY) {
    return { ok: false, error: `At most ${MAX_FOOD_ENTRIES_PER_DAY} foods per day.` };
  }
  const clean: FoodEntry[] = [];
  const ids = new Set<string>();
  for (const item of entries) {
    const result = validateFoodEntry(item);
    if (!result.ok) return result;
    if (ids.has(result.value.id)) return { ok: false, error: "Duplicate food id." };
    ids.add(result.value.id);
    clean.push(result.value);
  }
  return { ok: true, value: { date, entries: clean } };
}

/** Validate a member's own food. Its key is always derived from `id`. */
export function validateMyFood(raw: unknown, id: string): ValidationResult<FoodProduct> {
  if (!ID_PATTERN.test(id)) return { ok: false, error: "Invalid food id." };
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Expected a food object." };
  const f = raw as Record<string, unknown>;
  const name = typeof f.name === "string" && f.name.length <= FOOD_NAME_MAX * 2 ? cleanText(f.name, FOOD_NAME_MAX) : null;
  if (!name) return { ok: false, error: "Give the food a name." };
  const brand = optionalText(f.brand, FOOD_BRAND_MAX);
  if (!brand.ok) return { ok: false, error: "Brand is too long." };
  const servingLabel = optionalText(f.servingLabel, SERVING_LABEL_MAX);
  if (!servingLabel.ok) return { ok: false, error: "Serving description is too long." };
  let barcode: string | null = null;
  if (f.barcode !== null && f.barcode !== undefined && f.barcode !== "") {
    if (typeof f.barcode !== "string" || !BARCODE_PATTERN.test(f.barcode)) {
      return { ok: false, error: "Barcode must be 8–14 digits." };
    }
    barcode = f.barcode;
  }
  const perServing = f.perServing === null || f.perServing === undefined ? null : validMacros(f.perServing, ENTRY_KCAL_MAX, ENTRY_GRAMS_MAX);
  if (f.perServing && !perServing) return { ok: false, error: "Serving nutrition must be numbers of 0 or more." };
  const per100 = f.per100 === null || f.per100 === undefined ? null : plausiblePer100(validMacros(f.per100, PER100_KCAL_MAX, 100));
  if (f.per100 && !per100) return { ok: false, error: "Nutrition per 100 g doesn't add up." };
  if (!perServing && !per100) return { ok: false, error: "Enter the nutrition per serving." };
  const servingSize = f.servingSize === null || f.servingSize === undefined ? null : validNumber(f.servingSize, 5000);
  if (f.servingSize !== null && f.servingSize !== undefined && (servingSize === null || servingSize <= 0)) {
    return { ok: false, error: "Serving size must be between 0 and 5000." };
  }
  const baseUnit = f.baseUnit === "ml" ? "ml" : "g";
  return {
    ok: true,
    value: {
      key: `mine:${id}`,
      source: "mine",
      barcode,
      name,
      brand: brand.value,
      per100,
      perServing,
      servingLabel: servingLabel.value,
      servingSize,
      baseUnit,
    },
  };
}

/** The id part of a "mine:<id>" key. */
export function myFoodId(p: FoodProduct): string | null {
  return p.source === "mine" && p.key.startsWith("mine:") ? p.key.slice(5) : null;
}
