/**
 * Macro baseline — the standard four-step hand calculation.
 *
 *   1. Protein   bodyweight × g/lb           →  × 4 kcal
 *   2. Fat       total calories × %          →  ÷ 9 kcal = grams
 *   3. Carbs     whatever calories remain    →  ÷ 4 kcal = grams
 *   4. Deficit   remove 50–125g of carbs     →  200–500 kcal/day
 *
 * The order matters and is not arbitrary. Protein is set first and in absolute
 * terms because the requirement scales with body size, not with how much you
 * happen to be eating. Fat is set second as a percentage because it is the
 * hormonal floor. Carbohydrate is the remainder — which is exactly why it is
 * also the lever that gets pulled to create a deficit.
 *
 * This module exposes each intermediate figure rather than just the answers,
 * so the UI can show the arithmetic instead of asking the user to trust it.
 */

import { weeklyLossFromDeficit } from "./fat-loss";
import { resolveBodyFat } from "./body-composition";
import type {
  BiometricProfile,
  MacroBaselineResult,
  MacroLine,
  MacroSplit,
  TimelineWarning,
} from "./types";
import { KCAL_PER_G, clamp, round, safeNumber } from "./units";

/** Conventional working range for the carbohydrate deficit, in grams. */
export const CARB_DEFICIT_RANGE = { min: 50, max: 125 } as const;

/** Recommended bounds for the protein target, in grams per pound. */
export const PROTEIN_RANGE = { min: 0.8, max: 1.0 } as const;

/** Recommended bounds for fat, as a fraction of total calories. */
export const FAT_PERCENT_RANGE = { min: 0.25, max: 0.3 } as const;

/**
 * Floor on daily carbohydrate. Below roughly this, training quality and
 * glycogen replenishment degrade faster than fat loss improves.
 */
const MIN_DAILY_CARBS = 50;

function line(grams: number, kcalPerGram: number, totalCalories: number, bodyWeight: number): MacroLine {
  const calories = grams * kcalPerGram;
  return {
    grams: round(grams, 0),
    calories: Math.round(calories),
    percentOfCalories: totalCalories > 0 ? round((calories / totalCalories) * 100, 1) : 0,
    perPound: bodyWeight > 0 ? round(grams / bodyWeight, 2) : 0,
  };
}

export interface MacroBaselineInputs {
  /** Maintenance calories to build the split from. */
  dailyCalories: number;
  /** Grams of protein per pound of body weight. */
  proteinPerLb: number;
  /** Fat as a fraction of total calories, e.g. 0.27. */
  fatPercent: number;
  /** Grams of carbohydrate removed per day. 0 = maintenance. */
  carbDeficitGrams: number;
}

export function calculateMacroBaseline(
  profile: BiometricProfile,
  inputs: MacroBaselineInputs,
): MacroBaselineResult {
  const bodyWeight = Math.max(safeNumber(profile.weight, 0), 0);
  const maintenanceCalories = Math.max(safeNumber(inputs.dailyCalories, 0), 0);
  const proteinPerLb = clamp(safeNumber(inputs.proteinPerLb, 0.9), 0.3, 2);
  const fatPercent = clamp(safeNumber(inputs.fatPercent, 0.27), 0.1, 0.6);
  const deficitGrams = clamp(safeNumber(inputs.carbDeficitGrams, 0), 0, 300);

  // Step 1 — protein, from body weight.
  const proteinGrams = bodyWeight * proteinPerLb;
  const proteinCalories = proteinGrams * KCAL_PER_G.protein;

  // Step 2 — fat, as a share of the maintenance total.
  const fatCalories = maintenanceCalories * fatPercent;
  const fatGrams = fatCalories / KCAL_PER_G.fat;

  // Step 3 — carbs take whatever is left.
  const maintenanceCarbCalories =
    maintenanceCalories - proteinCalories - fatCalories;
  const maintenanceCarbGrams = maintenanceCarbCalories / KCAL_PER_G.carbs;

  const maintenance: MacroSplit = {
    protein: line(proteinGrams, KCAL_PER_G.protein, maintenanceCalories, bodyWeight),
    fat: line(fatGrams, KCAL_PER_G.fat, maintenanceCalories, bodyWeight),
    carbs: line(
      Math.max(maintenanceCarbGrams, 0),
      KCAL_PER_G.carbs,
      maintenanceCalories,
      bodyWeight,
    ),
    totalCalories: Math.round(maintenanceCalories),
  };

  // Step 4 — the deficit comes out of carbohydrate only. Protein is held to
  // protect lean mass and fat is held to protect hormone production, which
  // leaves carbohydrate as the only macro there is room to cut.
  const targetCarbGrams = maintenanceCarbGrams - deficitGrams;
  const targetCalories =
    proteinCalories + fatCalories + Math.max(targetCarbGrams, 0) * KCAL_PER_G.carbs;

  const target: MacroSplit = {
    protein: line(proteinGrams, KCAL_PER_G.protein, targetCalories, bodyWeight),
    fat: line(fatGrams, KCAL_PER_G.fat, targetCalories, bodyWeight),
    carbs: line(
      Math.max(targetCarbGrams, 0),
      KCAL_PER_G.carbs,
      targetCalories,
      bodyWeight,
    ),
    totalCalories: Math.round(targetCalories),
  };

  const dailyDeficit = Math.round(maintenanceCalories - targetCalories);
  const weeklyDeficit = dailyDeficit * 7;

  const warnings: TimelineWarning[] = [];

  if (maintenanceCarbGrams <= 0) {
    warnings.push({
      level: "danger",
      title: "Protein and fat already use up every calorie",
      detail:
        "There is nothing left for carbohydrate. Lower the protein target, lower the fat percentage, or raise maintenance calories.",
    });
  } else if (targetCarbGrams < 0) {
    warnings.push({
      level: "danger",
      title: `Deficit is larger than your carb allowance`,
      detail: `You only have ${Math.round(maintenanceCarbGrams)}g of carbs to work with, so a ${Math.round(deficitGrams)}g cut is not possible. Reduce the deficit or raise maintenance calories.`,
    });
  } else if (targetCarbGrams < MIN_DAILY_CARBS && deficitGrams > 0) {
    warnings.push({
      level: "warning",
      title: `Carbs drop to ${Math.round(targetCarbGrams)}g per day`,
      detail: `Below roughly ${MIN_DAILY_CARBS}g, training quality and recovery degrade faster than fat loss improves. Ease the deficit, or create part of it with activity instead.`,
    });
  }

  if (deficitGrams > CARB_DEFICIT_RANGE.max) {
    warnings.push({
      level: "warning",
      title: `${Math.round(deficitGrams)}g is beyond the usual range`,
      detail: `A ${CARB_DEFICIT_RANGE.min}–${CARB_DEFICIT_RANGE.max}g cut (${CARB_DEFICIT_RANGE.min * 4}–${CARB_DEFICIT_RANGE.max * 4} kcal) is the range most people can hold. Larger cuts tend to cost lean mass and adherence.`,
    });
  }

  if (proteinPerLb < PROTEIN_RANGE.min) {
    warnings.push({
      level: "warning",
      title: `Protein is ${proteinPerLb.toFixed(2)}g per pound`,
      detail: `In a deficit, ${PROTEIN_RANGE.min}–${PROTEIN_RANGE.max}g/lb is the range that best protects lean mass.`,
    });
  }

  if (fatPercent < FAT_PERCENT_RANGE.min) {
    warnings.push({
      level: "warning",
      title: `Fat is ${Math.round(fatPercent * 100)}% of calories`,
      detail: `Sustained intake below ${Math.round(FAT_PERCENT_RANGE.min * 100)}% can suppress hormone production and fat-soluble vitamin absorption.`,
    });
  }

  return {
    maintenance,
    target,
    dailyDeficit,
    weeklyDeficit,
    projectedWeeklyLoss: round(
      weeklyLossFromDeficit(
        Math.max(weeklyDeficit, 0),
        bodyWeight,
        clamp(resolveBodyFat(profile), 1, 70),
      ),
      2,
    ),
    warnings,
    feasible: bodyWeight > 0 && maintenanceCarbGrams > 0 && targetCarbGrams >= 0,
  };
}

/** Plain-text summary for the copy-to-clipboard button. */
export function formatMacroBaselineSummary(
  result: MacroBaselineResult,
  unitLabel: string,
  bodyWeight: number,
): string {
  const { target, maintenance } = result;
  const split = result.dailyDeficit > 0 ? target : maintenance;
  const lines = [
    result.dailyDeficit > 0 ? "DAILY MACRO TARGETS" : "MACROS AT MAINTENANCE",
    `Body weight: ${round(bodyWeight, 1)} ${unitLabel}`,
    `Maintenance: ${maintenance.totalCalories} kcal`,
    "",
    `${result.dailyDeficit > 0 ? "TARGET" : "MAINTENANCE"}: ${split.totalCalories} kcal/day`,
    `  Protein  ${split.protein.grams}g   (${split.protein.calories} kcal)`,
    `  Fat      ${split.fat.grams}g   (${split.fat.calories} kcal)`,
    `  Carbs    ${split.carbs.grams}g   (${split.carbs.calories} kcal)`,
  ];

  if (result.dailyDeficit > 0) {
    lines.push(
      "",
      `Deficit: ${result.dailyDeficit} kcal/day (${result.weeklyDeficit} kcal/week)`,
      `Projected loss: ~${result.projectedWeeklyLoss} ${unitLabel}/week`,
    );
  }

  return lines.join("\n");
}
