/**
 * Plate calculator: which plates go on each side of the bar for a total
 * weight. Standard gym plates, heaviest first; when a total can't be made
 * exactly, the closest lighter load is shown with what's left over.
 * Works in the member's own unit (lb plates for lb, kg plates for kg).
 */

import type { WeightUnit } from "./types";

export const PLATES: Record<WeightUnit, readonly number[]> = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};

export type PlateColor = "blue" | "green" | "red" | "yellow" | "white" | "silver";

/**
 * Plate colours in the bar drawing. Pounds follow the coach's scheme (45 blue,
 * 35 green, 25 red, 10 yellow); kilograms follow competition colours, where
 * the 20 kg plate is blue like the 45. Small change plates are white and silver.
 */
const PLATE_COLORS: Record<WeightUnit, Record<number, PlateColor>> = {
  lb: { 45: "blue", 35: "green", 25: "red", 10: "yellow", 5: "white", 2.5: "silver" },
  kg: { 25: "red", 20: "blue", 15: "yellow", 10: "green", 5: "white", 2.5: "silver", 1.25: "silver" },
};

export function plateColor(plate: number, unit: WeightUnit): PlateColor {
  return PLATE_COLORS[unit][plate] ?? "silver";
}

/** Bar choices: standard Olympic bar first. */
export const BARS: Record<WeightUnit, readonly number[]> = {
  lb: [45, 35],
  kg: [20, 15],
};

export interface PlateLoad {
  /** Plates for ONE side, heaviest first. */
  perSide: number[];
  /** What one side weighs. */
  sideWeight: number;
  /** Bar + both sides: what's actually on the bar. */
  loaded: number;
  /** The total asked for minus what can be loaded (0 when exact). */
  short: number;
  /** The total is less than the bar itself. */
  belowBar: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function platesFor(total: number, bar: number, unit: WeightUnit): PlateLoad {
  if (!Number.isFinite(total) || total <= bar) {
    return { perSide: [], sideWeight: 0, loaded: bar, short: Math.max(0, round(total - bar)), belowBar: total < bar };
  }
  let side = round((total - bar) / 2);
  const perSide: number[] = [];
  for (const plate of PLATES[unit]) {
    while (side >= plate - 1e-9) {
      perSide.push(plate);
      side = round(side - plate);
    }
  }
  const sideWeight = round(perSide.reduce((s, p) => s + p, 0));
  const loaded = round(bar + 2 * sideWeight);
  return { perSide, sideWeight, loaded, short: round(total - loaded), belowBar: false };
}

/** Counted plates for reading out: "2 × 45, 25, 10". */
export function describePlates(perSide: readonly number[]): string {
  const counts: [number, number][] = [];
  for (const p of perSide) {
    const last = counts[counts.length - 1];
    if (last && last[0] === p) last[1]++;
    else counts.push([p, 1]);
  }
  return counts.map(([p, n]) => (n > 1 ? `${n} × ${p}` : `${p}`)).join(", ");
}
