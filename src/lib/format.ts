import type { WeightUnit } from "./types";
import { fromLb, round } from "./units";

const NUMBER = new Intl.NumberFormat("en-US");

export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  return NUMBER.format(round(value, decimals));
}

/** Format a pounds value for display in the user's chosen unit. */
export function formatWeight(
  lb: number,
  unit: WeightUnit,
  decimals = 1,
  withUnit = true,
): string {
  if (!Number.isFinite(lb)) return "—";
  const value = round(fromLb(lb, unit), decimals);
  return `${NUMBER.format(value)}${withUnit ? ` ${unit}` : ""}`;
}

export function formatCalories(kcal: number): string {
  if (!Number.isFinite(kcal)) return "—";
  return `${NUMBER.format(Math.round(kcal))} kcal`;
}

export function formatGrams(grams: number): string {
  if (!Number.isFinite(grams)) return "—";
  return `${NUMBER.format(Math.round(grams))}g`;
}

export function formatPercent(fraction: number, decimals = 1): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${round(fraction * 100, decimals)}%`;
}

/** Signed value, for deltas where direction matters. */
export function formatSigned(value: number, decimals = 0, suffix = ""): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = round(value, decimals);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${NUMBER.format(rounded)}${suffix}`;
}
