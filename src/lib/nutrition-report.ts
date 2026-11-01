/**
 * Nutrition, a week at a time and over two weeks:
 *
 *   - weeklyNutritionReport: one Monday–Sunday week of food against the day's
 *     targets (members: Nutrition → Report; coaches: a member's Nutrition tab).
 *   - calorieAdherence: a member's last ADHERENCE_DAYS against their calories,
 *     with the pattern behind it (weekends, a meal, under or over, not
 *     logging) and a message to send (coach dashboard → Calorie adherence).
 *
 * Both work from daily totals (FoodDay: per meal too, never the foods), so
 * the member's app and the coach's dashboard agree.
 */

import type { FoodDay } from "./coach-api";
import type { CoachMacros } from "./coach-macros";
import type { MemberSummary } from "./coach";
import { addDays } from "./dates";
import { dayTargetFinder, type DayTarget } from "./day-targets";
import { MEALS, PROTEIN_TOLERANCE_G, type MealId } from "./food";
import { weekStartOf } from "./habits";
import { currentPlanWeek, effectiveCarbInputs } from "./plan-link";
import { weekdayIndex } from "./weekday-pattern";

/** Within this share of the day's calories counts as on target. */
export const ON_TARGET_SHARE = 0.1;
/** Days under this look unfinished: counted as partly logged, left out of averages. */
export const PARTIAL_DAY_KCAL = 500;

export type DayStatus = "on" | "over" | "under" | "partial" | "none" | "ahead";

export interface ReportDay {
  date: string;
  status: DayStatus;
  kcal: number | null;
  protein: number | null;
  target: Pick<DayTarget, "calories" | "protein" | "carbs" | "fat"> | null;
  /** Hit protein (within PROTEIN_TOLERANCE_G of it, or over). */
  proteinHit: boolean | null;
}

export interface NutritionReport {
  weekStart: string;
  weekEnd: string;
  /** Days of the week up to today. */
  daysSoFar: number;
  days: ReportDay[];
  /** Days with a full day logged, and with only a little. */
  logged: number;
  partial: number;
  /** Averages over the full days; null without any. */
  avg: { kcal: number; protein: number; carbs: number; fat: number } | null;
  /** The targets' averages over the same days (all the week's days so far when none were logged). */
  target: { calories: number; protein: number; carbs: number; fat: number } | null;
  onTarget: number;
  over: number;
  under: number;
  proteinHits: number;
  /** The average day's calories by meal, over the full days; empty without meal data. */
  meals: { meal: MealId; label: string; kcal: number }[];
  /** Plain sentences on what stood out. */
  notes: string[];
}

const avgOf = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function statusOf(day: FoodDay | undefined, target: DayTarget | null, date: string, today: string): DayStatus {
  if (date > today) return "ahead";
  if (!day || day.kcal <= 0) return "none";
  if (day.kcal < PARTIAL_DAY_KCAL) return "partial";
  if (!target) return "on";
  const diff = (day.kcal - target.calories) / target.calories;
  return Math.abs(diff) <= ON_TARGET_SHARE ? "on" : diff > 0 ? "over" : "under";
}

/** The week starting `weekStart` (a Monday), up to `today`. */
export function weeklyNutritionReport(foodDays: readonly FoodDay[], targetFor: ((date: string) => DayTarget | null) | null, weekStart: string, today: string): NutritionReport {
  const byDate = new Map(foodDays.map((d) => [d.date, d]));
  const days: ReportDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const day = byDate.get(date);
    const target = targetFor?.(date) ?? null;
    const status = statusOf(day, target, date, today);
    const full = status === "on" || status === "over" || status === "under";
    days.push({
      date,
      status,
      kcal: day && day.kcal > 0 ? day.kcal : null,
      protein: day && day.kcal > 0 ? day.protein : null,
      target: target ? { calories: target.calories, protein: target.protein, carbs: target.carbs, fat: target.fat } : null,
      proteinHit: full && target ? day!.protein >= target.protein - PROTEIN_TOLERANCE_G : null,
    });
  }
  const fullDays = days.filter((d) => d.status === "on" || d.status === "over" || d.status === "under");
  const full = fullDays.map((d) => byDate.get(d.date)!);
  const soFar = days.filter((d) => d.status !== "ahead");
  const targetDays = (fullDays.length ? fullDays : soFar).map((d) => d.target).filter((t): t is NonNullable<ReportDay["target"]> => t !== null);
  const target = targetDays.length
    ? {
        calories: Math.round(avgOf(targetDays.map((t) => t.calories))),
        protein: Math.round(avgOf(targetDays.map((t) => t.protein))),
        carbs: Math.round(avgOf(targetDays.map((t) => t.carbs))),
        fat: Math.round(avgOf(targetDays.map((t) => t.fat))),
      }
    : null;
  const avg = full.length
    ? {
        kcal: Math.round(avgOf(full.map((d) => d.kcal))),
        protein: Math.round(avgOf(full.map((d) => d.protein))),
        carbs: Math.round(avgOf(full.map((d) => d.carbs))),
        fat: Math.round(avgOf(full.map((d) => d.fat))),
      }
    : null;
  const withMeals = full.filter((d) => d.meals);
  const meals = withMeals.length
    ? MEALS.map((m) => ({ meal: m.id, label: m.label, kcal: Math.round(avgOf(withMeals.map((d) => d.meals![m.id] ?? 0))) }))
    : [];

  const r: NutritionReport = {
    weekStart,
    weekEnd: addDays(weekStart, 6),
    daysSoFar: soFar.length,
    days,
    logged: fullDays.length,
    partial: days.filter((d) => d.status === "partial").length,
    avg,
    target,
    onTarget: days.filter((d) => d.status === "on").length,
    over: days.filter((d) => d.status === "over").length,
    under: days.filter((d) => d.status === "under").length,
    proteinHits: days.filter((d) => d.proteinHit).length,
    meals,
    notes: [],
  };
  r.notes = reportNotes(r);
  return r;
}

function reportNotes(r: NutritionReport): string[] {
  const notes: string[] = [];
  if (r.daysSoFar === 0) return notes;
  const missing = r.daysSoFar - r.logged - r.partial;
  if (r.logged === 0) {
    notes.push(r.partial ? "Only partly logged days so far: log whole days to see how the week went." : "Nothing logged this week yet.");
    return notes;
  }
  if (r.avg && r.target) {
    const diff = r.avg.kcal - r.target.calories;
    if (Math.abs(diff) / r.target.calories <= ON_TARGET_SHARE) notes.push(`Calories averaged ${r.avg.kcal.toLocaleString()} a day, right around the ${r.target.calories.toLocaleString()} target.`);
    else notes.push(`Calories averaged ${r.avg.kcal.toLocaleString()} a day, ${Math.abs(diff).toLocaleString()} ${diff > 0 ? "over" : "under"} the ${r.target.calories.toLocaleString()} target.`);
    notes.push(`Protein hit on ${r.proteinHits} of ${r.logged} logged day${r.logged === 1 ? "" : "s"} (${r.avg.protein} g a day against ${r.target.protein} g).`);
  }
  // Weekends against weekdays, when both were logged.
  const kcalOf = (d: ReportDay) => d.kcal ?? 0;
  const full = r.days.filter((d) => d.status === "on" || d.status === "over" || d.status === "under");
  const weekend = full.filter((d) => weekdayIndex(d.date) >= 5);
  const weekday = full.filter((d) => weekdayIndex(d.date) < 5);
  if (weekend.length && weekday.length && r.target) {
    const gap = Math.round(avgOf(weekend.map(kcalOf)) - avgOf(weekday.map(kcalOf)));
    if (Math.abs(gap) >= r.target.calories * 0.15) notes.push(`Weekends ran ${Math.abs(gap).toLocaleString()} kcal ${gap > 0 ? "higher" : "lower"} than weekdays.`);
  }
  if (missing > 0) notes.push(`${missing} day${missing === 1 ? "" : "s"} not logged${r.partial ? `, and ${r.partial} only partly` : ""}.`);
  else if (r.partial) notes.push(`${r.partial} day${r.partial === 1 ? "" : "s"} only partly logged.`);
  return notes;
}

/** The Monday of the week holding `date`. */
export const reportWeekStart = (date: string) => weekStartOf(date);

/* ------------------------------ calorie adherence ------------------------------ */

export const ADHERENCE_DAYS = 14;
/** Fewer full days than this in ADHERENCE_DAYS: not enough logged to judge. */
const MIN_FULL_DAYS = 4;

export type AdherenceVerdict = "on-track" | "under" | "over" | "swinging" | "not-logging";

export const VERDICT_LABEL: Record<AdherenceVerdict, string> = {
  "on-track": "On target",
  under: "Under target",
  over: "Over target",
  swinging: "Up and down",
  "not-logging": "Not logging",
};

export interface CalorieAdherence {
  verdict: AdherenceVerdict;
  /** Days in the window with any food, and with a full day. */
  logged: number;
  full: number;
  partial: number;
  /** Full days within ON_TARGET_SHARE. */
  onTarget: number;
  over: number;
  under: number;
  /** Average full day against its target, kcal and as a share; null without full days. */
  avgDiff: number | null;
  avgDiffShare: number | null;
  /** What's behind it, most telling first. */
  reasons: string[];
  /** A message the coach can send, in their own words to edit. */
  message: string;
}

/**
 * Their last ADHERENCE_DAYS (yesterday back: today is still going) against
 * each day's calories. Off target means mostly under, mostly over, or swinging
 * both ways; with too few days logged it says that instead.
 */
export function calorieAdherence(
  foodDays: readonly FoodDay[],
  targetFor: (date: string) => DayTarget | null,
  today: string,
  firstName: string,
): CalorieAdherence {
  const end = addDays(today, -1);
  const start = addDays(end, -(ADHERENCE_DAYS - 1));
  const inWindow = foodDays.filter((d) => d.date >= start && d.date <= end && d.kcal > 0);
  const rows = inWindow
    .map((d) => ({ day: d, target: targetFor(d.date) }))
    .filter((x): x is { day: FoodDay; target: DayTarget } => x.target !== null);
  const full = rows.filter((x) => x.day.kcal >= PARTIAL_DAY_KCAL);
  const partial = inWindow.length - inWindow.filter((d) => d.kcal >= PARTIAL_DAY_KCAL).length;
  const diffs = full.map((x) => ({ ...x, diff: x.day.kcal - x.target.calories, share: (x.day.kcal - x.target.calories) / x.target.calories }));
  const on = diffs.filter((x) => Math.abs(x.share) <= ON_TARGET_SHARE);
  const over = diffs.filter((x) => x.share > ON_TARGET_SHARE);
  const under = diffs.filter((x) => x.share < -ON_TARGET_SHARE);
  const avgDiff = diffs.length ? Math.round(avgOf(diffs.map((x) => x.diff))) : null;
  const avgDiffShare = diffs.length ? avgOf(diffs.map((x) => x.share)) : null;

  let verdict: AdherenceVerdict;
  if (full.length < MIN_FULL_DAYS) verdict = "not-logging";
  else if (on.length / full.length >= 0.6 && Math.abs(avgDiffShare!) <= 0.07) verdict = "on-track";
  else if (avgDiffShare! < -ON_TARGET_SHARE) verdict = "under";
  else if (avgDiffShare! > ON_TARGET_SHARE) verdict = "over";
  // Close on average but not day to day: both ways is a swing; one way is that way.
  else if (over.length >= 2 && under.length >= 2) verdict = "swinging";
  else verdict = under.length > over.length ? "under" : over.length > under.length ? "over" : "swinging";

  const reasons: string[] = [];
  const unlogged = ADHERENCE_DAYS - inWindow.length;
  if (verdict === "not-logging") {
    reasons.push(`${full.length} full day${full.length === 1 ? "" : "s"} logged in the last ${ADHERENCE_DAYS}.`);
  } else {
    reasons.push(
      `${on.length} of ${full.length} logged days on target${over.length ? `, ${over.length} over` : ""}${under.length ? `, ${under.length} under` : ""}; average ${avgDiff! > 0 ? "+" : "−"}${Math.abs(avgDiff!).toLocaleString()} kcal (${Math.round(Math.abs(avgDiffShare!) * 100)}%).`,
    );
    // Weekends against weekdays.
    const wkend = diffs.filter((x) => weekdayIndex(x.day.date) >= 5);
    const wkday = diffs.filter((x) => weekdayIndex(x.day.date) < 5);
    if (wkend.length >= 2 && wkday.length >= 2) {
      const gap = Math.round(avgOf(wkend.map((x) => x.diff)) - avgOf(wkday.map((x) => x.diff)));
      const typical = avgOf(full.map((x) => x.target.calories));
      if (Math.abs(gap) >= typical * 0.12) reasons.push(`Weekends run ${Math.abs(gap).toLocaleString()} kcal ${gap > 0 ? "higher" : "lower"} than weekdays.`);
    }
    // The meal behind it: on over days, the meal most above its usual; on under days, the one most often skipped or most below.
    const withMeals = diffs.filter((x) => x.day.meals);
    if (withMeals.length >= MIN_FULL_DAYS) {
      const usual = (m: MealId, xs: typeof withMeals) => avgOf(xs.map((x) => x.day.meals![m] ?? 0));
      if (verdict === "over" || (verdict === "swinging" && over.length)) {
        const overDays = withMeals.filter((x) => x.share > ON_TARGET_SHARE);
        const rest = withMeals.filter((x) => x.share <= ON_TARGET_SHARE);
        if (overDays.length && rest.length) {
          const best = MEALS.map((m) => ({ m, extra: usual(m.id, overDays) - usual(m.id, rest) })).sort((a, b) => b.extra - a.extra)[0]!;
          if (best.extra >= 150) reasons.push(`On over days, ${best.m.label.toLowerCase()} is about ${Math.round(best.extra).toLocaleString()} kcal bigger than usual.`);
        } else if (overDays.length) {
          const big = MEALS.map((m) => ({ m, kcal: usual(m.id, overDays) })).sort((a, b) => b.kcal - a.kcal)[0]!;
          reasons.push(`${big.m.label} is the biggest meal, about ${Math.round(big.kcal).toLocaleString()} kcal.`);
        }
      }
      if (verdict === "under" || (verdict === "swinging" && under.length)) {
        const skipped = MEALS.map((m) => ({ m, n: withMeals.filter((x) => !(x.day.meals![m.id] ?? 0)).length })).sort((a, b) => b.n - a.n)[0]!;
        if (skipped.n >= Math.ceil(withMeals.length / 2) && skipped.m.id !== "snacks") reasons.push(`${skipped.m.label} is skipped on ${skipped.n} of ${withMeals.length} days.`);
      }
    }
    // Low days that look like forgetting rather than eating little.
    if (partial >= 2) reasons.push(`${partial} days logged under ${PARTIAL_DAY_KCAL} kcal: probably not the whole day.`);
  }
  if (unlogged >= 4 && verdict !== "not-logging") reasons.push(`${unlogged} of the last ${ADHERENCE_DAYS} days not logged.`);

  return {
    verdict,
    logged: inWindow.length,
    full: full.length,
    partial,
    onTarget: on.length,
    over: over.length,
    under: under.length,
    avgDiff,
    avgDiffShare,
    reasons,
    message: adherenceMessage(verdict, firstName, reasons),
  };
}

function adherenceMessage(verdict: AdherenceVerdict, first: string, reasons: string[]): string {
  const weekend = reasons.some((r) => r.startsWith("Weekends run") && r.includes("higher"));
  const meal = reasons.find((r) => r.startsWith("On over days, "))?.match(/On over days, (\w+)/)?.[1];
  const skipped = reasons.find((r) => r.includes("is skipped on"))?.split(" is skipped")[0]?.toLowerCase();
  switch (verdict) {
    case "not-logging":
      return `Hey ${first}, I've not seen much food logged the last couple of weeks. No judgement, it's hard to keep up. Could you log every day this week, even roughly? It's what lets me adjust your plan properly.`;
    case "under":
      return `Hey ${first}, you've been coming in under your calories most days${skipped ? `, and ${skipped} often gets skipped` : ""}. Eating too little stalls progress and costs muscle. Can we aim to hit your number this week? ${skipped ? `Even a quick ${skipped} would help.` : "What's getting in the way?"}`;
    case "over":
      return `Hey ${first}, calories have been running over target${weekend ? ", mostly at weekends" : ""}${meal ? ` and around ${meal}` : ""}. Totally fixable. ${weekend ? "Want to plan the weekend ahead a bit this week?" : meal ? `Could we tighten up ${meal} this week?` : "What's been making it hard?"}`;
    case "swinging":
      return weekend
        ? `Hey ${first}, you're under your calories on weekdays and over at weekends${meal ? `, mostly at ${meal}` : ""}. Evening it out will make your progress steadier. Could we eat a bit more in the week and plan the weekend ahead?`
        : `Hey ${first}, your calories have been up and down: some days well under, some well over. Steadier days will make your progress more predictable. Want to plan a couple of go-to days for this week?`;
    case "on-track":
      return `Nice work ${first}, your calories have been right on target. Keep it going!`;
  }
}

/** A member's day targets as their app works them out: coach macros win; null without a plan. */
export function memberTargetFinder(m: MemberSummary, coachMacros: CoachMacros | null, today: string): ((date: string) => DayTarget | null) | null {
  if (!m.hasPlan && !coachMacros) return null;
  const plan = m.state;
  try {
    const week = currentPlanWeek(plan.profile, plan.fatLoss, plan.tracking.adjustments, today);
    return dayTargetFinder(plan.profile, plan.fatLoss, effectiveCarbInputs(plan.carbs, week), plan.tracking.adjustments, coachMacros);
  } catch {
    return null;
  }
}
