/**
 * Nutrition label photos (Add food → a barcode USDA doesn't have → "Read the
 * label from a photo"; worker/label-photo.ts): what Gemini is asked, and the
 * checks on what comes back. The numbers only fill in the type-it-in form;
 * the member checks them before anything is saved.
 */

export const LABEL_PHOTO_DAILY_LIMIT = 15;

export interface LabelReading {
  name: string;
  brand: string;
  /** As printed, e.g. "1 bar (60 g)" or "100 g". */
  servingLabel: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: "low" | "medium" | "high";
  note: string;
}

export const LABEL_PHOTO_PROMPT = `You read food nutrition labels from photos for a calorie tracking app.

Read the Nutrition Facts (or nutrition information) panel and reply with JSON only, no other text:
{"name": "product name if visible, else empty", "brand": "brand if visible, else empty", "servingLabel": "the serving size exactly as printed, e.g. 1 bar (60 g)", "kcal": 230, "protein": 20, "carbs": 25, "fat": 7, "confidence": "low" | "medium" | "high", "note": "one short sentence on anything uncertain"}

Rules:
- Use the PER SERVING column. If the label only has a per 100 g / 100 ml column, use that and set servingLabel to "100 g" (or "100 ml").
- Calories in kcal. If only kJ is shown, divide by 4.184.
- Carbs are total carbohydrate (in the EU/UK/Australia "carbohydrate" already excludes fibre; use it as printed). Fat is total fat.
- Round to whole numbers (one decimal for values under 10 g is fine).
- Never guess a number you can't read: if the photo isn't a nutrition label or the numbers are unreadable, reply {"name": "", "brand": "", "servingLabel": "", "kcal": null, "protein": null, "carbs": null, "fat": null, "confidence": "low", "note": "Couldn't read a nutrition label in the photo."}`;

const num = (v: unknown, max: number): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null;
};
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Parse and check the model's reply; null when there are no usable numbers. */
export function cleanLabelReading(reply: string): LabelReading | null {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const kcal = num(r.kcal, 5000);
  const protein = num(r.protein, 500);
  const carbs = num(r.carbs, 800);
  const fat = num(r.fat, 400);
  if (kcal === null || protein === null || carbs === null || fat === null) return null;
  return {
    name: text(r.name, 80),
    brand: text(r.brand, 60),
    servingLabel: text(r.servingLabel, 60),
    kcal: Math.round(kcal),
    protein,
    carbs,
    fat,
    confidence: r.confidence === "high" || r.confidence === "medium" ? r.confidence : "low",
    note: text(r.note, 200),
  };
}
