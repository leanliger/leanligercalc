/**
 * Water: six 16.9 oz (500 ml) bottles a day, 101.4 oz — the scorecard's
 * "Hit hydration goal (100+ oz)". The day's count is kept in the habit log
 * under WATER_KEY, and the hydration habit (link "water") ticks itself once
 * all six are done, the way the step habit follows the step count.
 */

import { WATER_KEY, type HabitDef, type HabitEntries } from "./habits";

export const BOTTLE_OZ = 16.9;
export const BOTTLE_ML = 500;
export const WATER_GOAL_BOTTLES = 6;
export const WATER_GOAL_OZ = 100;

export function bottlesOn(entries: HabitEntries | undefined): number {
  const n = entries?.[WATER_KEY];
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : 0;
}

export function ounces(bottles: number): number {
  return Math.round(bottles * BOTTLE_OZ * 10) / 10;
}

export function liters(bottles: number): number {
  return Math.round(bottles * BOTTLE_ML) / 1000;
}

/**
 * Tapping bottle `index` (0-based): fills up to and including it, or — tapping
 * the last filled one — empties it.
 */
export function tapBottle(current: number, index: number): number {
  return index === current - 1 ? index : index + 1;
}

/** The day's entries with a new bottle count, and the hydration habit following it. */
export function withBottles(entries: HabitEntries, defs: readonly HabitDef[], bottles: number): HabitEntries {
  const next: HabitEntries = { ...entries };
  if (bottles > 0) next[WATER_KEY] = bottles;
  else delete next[WATER_KEY];
  const habit = defs.find((d) => d.link === "water");
  if (habit) {
    if (bottles >= WATER_GOAL_BOTTLES) next[habit.id] = true;
    else delete next[habit.id];
  }
  return next;
}
