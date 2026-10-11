/**
 * Calories and macros a coach sets for a member from the dashboard
 * (worker/coaching.ts). While they're set, they are the member's daily
 * targets everywhere (Food log, Today, Macros), the same every day, in place
 * of the Timeline's. Clearing them goes back to the plan.
 */

import { KCAL_PER_G } from "./units";

export interface CoachMacros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  note: string;
  setAt: string;
}

export const COACH_MACROS_NOTE_MAX = 300;

/** Calories from grams: 4 / 4 / 9 per gram. */
export function macroKcal(m: { protein: number; carbs: number; fat: number }): number {
  return Math.round(m.protein * KCAL_PER_G.protein + m.carbs * KCAL_PER_G.carbs + m.fat * KCAL_PER_G.fat);
}

export function validateCoachMacros(
  raw: unknown,
): { ok: true; value: Omit<CoachMacros, "setAt"> } | { ok: false; error: string } {
  const b = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const grams = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null);
  const protein = grams(b.protein, 600);
  const carbs = grams(b.carbs, 1000);
  const fat = grams(b.fat, 400);
  if (protein === null || carbs === null || fat === null) return { ok: false, error: "Enter protein, carbs and fat in grams." };
  const kcal = macroKcal({ protein, carbs, fat });
  if (kcal < 800 || kcal > 8000) return { ok: false, error: "That comes to under 800 or over 8,000 kcal a day. Check the grams." };
  const note = typeof b.note === "string" ? b.note.trim().slice(0, COACH_MACROS_NOTE_MAX) : "";
  return { ok: true, value: { kcal, protein, carbs, fat, note } };
}

export function coachMacrosMessage(m: { kcal: number; protein: number; carbs: number; fat: number }): { title: string; content: string } {
  return {
    title: "Your coach set your macros",
    content: `${m.kcal.toLocaleString("en-US")} kcal a day: ${m.protein} g protein, ${m.carbs} g carbs, ${m.fat} g fat. Your Food log uses them from now on.`,
  };
}
