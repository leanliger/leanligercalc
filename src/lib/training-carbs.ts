/**
 * Training-day carb split (Food, on a day with a workout): the day's carbs
 * and protein targets stay the same; this only suggests where to put them,
 * more of the carbs in the meals either side of the session.
 *
 *   before (1–3 h ahead)  PRE_CARB_SHARE of the day's carbs
 *   after  (within ~2 h)  POST_CARB_SHARE
 *   the rest              spread over the other meals
 *
 * Protein: about a quarter of the day's target in each of those meals,
 * between 20 and 50 g.
 */

export const PRE_CARB_SHARE = 0.25;
export const POST_CARB_SHARE = 0.35;

/** What today holds, from the active program and today's workouts. */
export type TrainingToday =
  | { kind: "planned"; name: string }
  | { kind: "live"; name: string }
  | { kind: "done"; name: string }
  | null;

export interface CarbSplit {
  pre: { carbs: number; protein: number };
  post: { carbs: number; protein: number };
  /** Carbs left for the other meals. */
  rest: number;
}

const round5 = (n: number) => Math.max(0, Math.round(n / 5) * 5);

export function trainingDaySplit(target: { carbs: number; protein: number }): CarbSplit {
  const pre = round5(target.carbs * PRE_CARB_SHARE);
  const post = round5(target.carbs * POST_CARB_SHARE);
  const protein = round5(Math.min(50, Math.max(20, target.protein * 0.25)));
  return { pre: { carbs: pre, protein }, post: { carbs: post, protein }, rest: Math.max(0, Math.round(target.carbs) - pre - post) };
}
