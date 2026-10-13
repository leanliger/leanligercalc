/**
 * Meal photo estimates (worker/meal-photo.ts): what Gemini is asked, and the
 * checks on what comes back before the member sees it.
 */

export const MEAL_PHOTO_DAILY_LIMIT = 10;

export interface MealEstimateItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealEstimate {
  name: string;
  items: MealEstimateItem[];
  confidence: "low" | "medium" | "high";
  note: string;
}

export const MEAL_PHOTO_PROMPT = `You estimate food in photos for a calorie and macro tracking app used by people dieting for physique goals.

Identify each food on the plate and estimate its cooked weight in grams and its calories, protein, carbs and fat for that amount. Use typical portion sizes when the scale is unclear, and include likely cooking oil, butter and sauces as their own items when visible or very likely.

Reply with JSON only, no other text:
{"name": "short meal name", "items": [{"name": "food", "grams": 150, "kcal": 250, "protein": 30, "carbs": 0, "fat": 14}], "confidence": "low" | "medium" | "high", "note": "one short sentence on the main assumption, e.g. portion size or hidden oil"}

Round grams to the nearest 5 and macros to whole numbers. If the photo isn't of food, reply {"name": "", "items": [], "confidence": "low", "note": "No food found in the photo."}`;

const num = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null);

/** Parse and check the model's reply; null when it isn't usable. */
export function cleanMealEstimate(text: string): MealEstimate | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const items: MealEstimateItem[] = [];
  for (const it of Array.isArray(r.items) ? r.items.slice(0, 12) : []) {
    const i = (typeof it === "object" && it !== null ? it : {}) as Record<string, unknown>;
    const name = typeof i.name === "string" ? i.name.trim().slice(0, 60) : "";
    const grams = num(i.grams, 3000);
    const kcal = num(i.kcal, 5000);
    const protein = num(i.protein, 500);
    const carbs = num(i.carbs, 800);
    const fat = num(i.fat, 400);
    if (!name || grams === null || kcal === null || protein === null || carbs === null || fat === null) continue;
    items.push({ name, grams, kcal, protein, carbs, fat });
  }
  const confidence = r.confidence === "high" || r.confidence === "medium" ? r.confidence : "low";
  return {
    name: typeof r.name === "string" ? r.name.trim().slice(0, 60) : "",
    items,
    confidence,
    note: typeof r.note === "string" ? r.note.trim().slice(0, 200) : "",
  };
}
