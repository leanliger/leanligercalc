/**
 * Shared domain types for both calculators.
 *
 * Convention: every weight/mass value stored in application state and passed
 * into the math layer is in POUNDS. Unit conversion happens only at the
 * input/display boundary (see `units.ts`). This keeps the math modules free of
 * unit branching.
 */

export type WeightUnit = "lb" | "kg";

/**
 * Only male/female are modelled because the Mifflin-St Jeor and Deurenberg
 * equations are published with coefficients for exactly those two groups.
 * Users for whom neither fits can supply a measured body fat percentage and
 * a known maintenance calorie figure, which bypasses both equations.
 */
export type Sex = "male" | "female";

/**
 * The biometric facts a user actually knows about themselves. Shared by both
 * calculators so weight and composition are entered once, not per-tool.
 */
export interface BiometricProfile {
  /** Current scale weight, in pounds. */
  weight: number;
  /** Height in inches. */
  heightInches: number;
  /** Age in years. */
  age: number;
  sex: Sex;
  /**
   * Measured body fat percentage, 0–100. Null means "estimate it from the
   * biometrics above" — the default, since most people have no measurement.
   */
  bodyFatOverride: number | null;
}

/** Which direction the timeline is being solved in. */
export type TimelineMode =
  /** "I start on this date — when do I finish?" */
  | "startDate"
  /** "I compete on this date — when must I start?" */
  | "eventDate";

/** What the user is aiming at. */
export type GoalType = "weight" | "bodyFat";

/** Preset weekly loss rates, as a fraction of current body weight per week. */
export type RatePreset = "conservative" | "moderate" | "aggressive" | "custom";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "veryActive";

/**
 * Timeline settings. Biometrics live on `BiometricProfile` and are passed
 * alongside these, so the same person can be evaluated against several plans.
 */
export interface FatLossInputs {
  goalType: GoalType;
  /** Target scale weight in pounds. Used when `goalType === "weight"`. */
  targetWeight: number;
  /** Target body fat percentage, 0–100. Used when `goalType === "bodyFat"`. */
  targetBodyFat: number;
  /** Weekly loss rate as a fraction of body weight, e.g. 0.0075 for 0.75%. */
  weeklyRate: number;
  mode: TimelineMode;
  /** ISO date (yyyy-mm-dd) the diet begins. Used in `startDate` mode. */
  startDate: string;
  /** ISO date (yyyy-mm-dd) of the show/event. Used in `eventDate` mode. */
  eventDate: string;
  activityLevel: ActivityLevel;
  /**
   * Explicit maintenance calories at current weight. When null, TDEE is
   * estimated from body weight and activity level.
   */
  tdeeOverride: number | null;
  /** Model progressive metabolic adaptation across the diet. */
  includeMetabolicAdaptation: boolean;
}

/** One projected week of the diet. */
export interface WeekProjection {
  /** 0 = starting point (no loss yet). */
  week: number;
  /** ISO date for the start of this week. */
  date: string;
  /** Projected scale weight at the start of the week, pounds. */
  weight: number;
  /** Projected body fat percentage, 0–100. */
  bodyFat: number;
  /** Projected fat mass, pounds. */
  fatMass: number;
  /** Projected lean body mass, pounds. */
  leanMass: number;
  /** Weight lost during this week, pounds. 0 for week 0. */
  weeklyLoss: number;
  /** Total weight lost since week 0, pounds. */
  cumulativeLoss: number;
  /** Estimated maintenance calories at this week's weight. */
  tdee: number;
  /** Recommended intake to hit this week's loss target. */
  targetCalories: number;
  /** Daily deficit implied by `tdee - targetCalories`. */
  dailyDeficit: number;
  /** True when target calories crossed a floor and had to be clamped. */
  deficitClamped: boolean;
  /** Human-readable coaching trigger for this week, if any. */
  note: string | null;
}

export type TimelineWarningLevel = "info" | "warning" | "danger";

export interface TimelineWarning {
  level: TimelineWarningLevel;
  title: string;
  detail: string;
}

export interface FatLossResult {
  /** Week-by-week projection, index 0 being the starting point. */
  projection: WeekProjection[];
  /** Whole weeks required to reach the goal. */
  weeksRequired: number;
  /** Fractional weeks, for a more precise date. */
  preciseWeeks: number;
  /** ISO date the goal is reached (`startDate` mode) or the event date. */
  finishDate: string;
  /** ISO date the diet must begin (`eventDate` mode) or the user's start date. */
  requiredStartDate: string;
  /** Total pounds to lose. */
  totalLoss: number;
  /** Pounds of that loss projected to come from fat mass. */
  fatLoss: number;
  /** Pounds of that loss projected to come from lean mass. */
  leanLoss: number;
  /** Final projected weight in pounds. */
  endWeight: number;
  /** Final projected body fat percentage. */
  endBodyFat: number;
  /** Average daily deficit across the whole diet. */
  averageDailyDeficit: number;
  /** Average daily target calories across the whole diet. */
  averageTargetCalories: number;
  /**
   * In `eventDate` mode: the weekly rate actually required to arrive on time
   * from today. Null when there is no date pressure to evaluate.
   */
  requiredRate: number | null;
  /** Weeks available between today and the event, in `eventDate` mode. */
  weeksAvailable: number | null;
  warnings: TimelineWarning[];
  /** False when inputs are incoherent (e.g. target above current weight). */
  feasible: boolean;
}

/* ------------------------------------------------------------------ */
/* Carb cycling                                                        */
/* ------------------------------------------------------------------ */

export type DayType = "high" | "medium" | "low";

export type CarbGoal = "fatLoss" | "recomp" | "maintenance";

/** Basis for the protein target. */
export type ProteinBasis = "bodyWeight" | "leanMass";

export interface CarbCyclingInputs {
  /** Maintenance calories. */
  tdee: number;
  goal: CarbGoal;
  /**
   * Daily calorie target. When null it is derived from `tdee` and the goal's
   * default deficit; when set (e.g. handed over from the timeline tool) it
   * overrides the derived value.
   */
  dailyCalorieTarget: number | null;
  proteinBasis: ProteinBasis;
  /** Grams of protein per pound of the chosen basis. */
  proteinPerLb: number;
  /** Minimum fat as a fraction of baseline calories, e.g. 0.20 for 20%. */
  fatFloorPercent: number;
  /** Absolute minimum fat in grams per pound of body weight, e.g. 0.3. */
  fatFloorGramsPerLb: number;
  /** Number of high-carb days per week. */
  highDays: number;
  /** Number of medium-carb days per week. */
  mediumDays: number;
  /** Number of low-carb days per week. */
  lowDays: number;
  /** Carb increase on high days as a fraction of baseline carbs, e.g. 0.20. */
  highCarbBoost: number;
  /** Carb reduction on low days as a fraction of baseline carbs, e.g. 0.25. */
  lowCarbCut: number;
}

export interface MacroTargets {
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
}

export interface DayPlan extends MacroTargets {
  type: DayType;
  /** How many days of the week use this plan. */
  count: number;
  /** Calories as a percentage difference from the baseline day. */
  caloriePercentOfBaseline: number;
  /** Grams of each macro per pound of body weight, for quick sanity checks. */
  perPound: { protein: number; carbs: number; fat: number };
  /** True when the fat floor forced this day's fat upward. */
  fatFloorApplied: boolean;
}

export interface WeeklyTotals extends MacroTargets {
  /** Average daily calories across the 7 days. */
  averageDailyCalories: number;
  /** Weekly deficit relative to `tdee * 7`. */
  weeklyDeficit: number;
  /** Projected weekly fat loss in pounds from that deficit. */
  projectedWeeklyLoss: number;
}

export interface CarbCyclingResult {
  baseline: MacroTargets;
  days: DayPlan[];
  weekly: WeeklyTotals;
  warnings: TimelineWarning[];
  feasible: boolean;
}
