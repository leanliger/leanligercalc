/**
 * Describe a meal (Add food → Describe; worker/meal-describe.ts): the member
 * types or dictates what they ate ("2 eggs, toast with butter, black coffee")
 * and Gemini splits it into foods with amounts and macros, in the same shape
 * as a photo estimate (src/lib/meal-photo.ts). Nothing is logged until the
 * member checks the list.
 */

export const MEAL_DESCRIBE_DAILY_LIMIT = 30;
export const MEAL_DESCRIBE_MAX_CHARS = 400;

export const MEAL_DESCRIBE_PROMPT = `You turn a short description of a meal into food log entries for a calorie and macro tracking app used by people dieting for physique goals.

Split the description into separate foods. For each, use the amount given ("2 eggs", "150 g rice", "a tablespoon of peanut butter"); when no amount is given, use a typical single portion. Estimate the weight in grams (as eaten, cooked if cooked) and the calories, protein, carbs and fat for that amount, using standard nutrition data (USDA values where they exist). Count butter, oil, sauces and sugar or milk in drinks as their own items when they're mentioned or clearly implied ("buttered toast" includes the butter). Black coffee, plain tea and water are about 0 kcal but still listed.

Reply with JSON only, no other text:
{"name": "short meal name", "items": [{"name": "Egg, large, scrambled", "grams": 100, "kcal": 150, "protein": 12, "carbs": 1, "fat": 11}], "confidence": "low" | "medium" | "high", "note": "one short sentence on the main assumption, e.g. portion size or cooking fat"}

Round grams to the nearest 5 and macros to whole numbers. Keep names short and specific. If the text doesn't describe food, reply {"name": "", "items": [], "confidence": "low", "note": "That doesn't look like a meal. Try something like: 2 eggs, toast with butter, black coffee."}

The meal:
`;

/** The member's text, tidied; null when there's nothing to send. */
export function cleanMealText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\s+/g, " ").trim();
  return text.length >= 2 && text.length <= MEAL_DESCRIBE_MAX_CHARS ? text : null;
}
