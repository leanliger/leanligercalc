import { todayISO, addWeeks } from "./dates";
import type {
  BiometricProfile,
  CarbCyclingInputs,
  FatLossInputs,
  WeightUnit,
} from "./types";
import { feetInchesToInches } from "./units";

/** A 30-year-old, 5'10", 200 lb male — a neutral starting point. */
export const DEFAULT_PROFILE: BiometricProfile = {
  weight: 200,
  heightInches: feetInchesToInches(5, 10),
  age: 30,
  sex: "male",
  // Null by design: body fat is estimated from the biometrics above unless the
  // user has an actual measurement. Most people do not.
  bodyFatOverride: null,
};

export const DEFAULT_FAT_LOSS_INPUTS: FatLossInputs = {
  goalType: "weight",
  targetWeight: 175,
  targetBodyFat: 12,
  weeklyRate: 0.0075,
  mode: "startDate",
  startDate: todayISO(),
  eventDate: addWeeks(todayISO(), 20),
  activityLevel: "moderate",
  tdeeOverride: null,
  includeMetabolicAdaptation: true,
};

export const DEFAULT_CARB_INPUTS: CarbCyclingInputs = {
  tdee: 2900,
  goal: "fatLoss",
  dailyCalorieTarget: null,
  proteinBasis: "bodyWeight",
  // Midpoints of the documented working ranges: 0.8–1.0 g/lb protein and
  // 25–30% of calories from fat. Both sliders reach further in each direction
  // for people who want to push past the defaults.
  proteinPerLb: 0.9,
  fatFloorPercent: 0.27,
  fatFloorGramsPerLb: 0.3,
  highDays: 2,
  mediumDays: 3,
  lowDays: 2,
  highCarbBoost: 0.2,
  lowCarbCut: 0.25,
  // 100g of carbs ≈ a 400 kcal/day deficit — the middle of the 50–125g range.
  carbDeficitGrams: 100,
  // Null = place high/medium/low days automatically from the counts above.
  weekdayPattern: null,
};

export const DEFAULT_UNIT: WeightUnit = "lb";

/** Common weekly schedules offered as one-click presets. */
export const SCHEDULE_PRESETS = [
  { label: "2 / 3 / 2", high: 2, medium: 3, low: 2, hint: "Balanced default" },
  { label: "3 / 2 / 2", high: 3, medium: 2, low: 2, hint: "Higher training volume" },
  { label: "1 / 3 / 3", high: 1, medium: 3, low: 3, hint: "Aggressive cut" },
  { label: "2 / 2 / 3", high: 2, medium: 2, low: 3, hint: "Contest prep" },
  { label: "0 / 7 / 0", high: 0, medium: 7, low: 0, hint: "No cycling" },
] as const;
