/**
 * Builds a member's check-in report (src/lib/checkin-report.ts) from their
 * dashboard summary: their targets over the check-in week (coach macros win;
 * carb-cycling days averaged), usual workouts and flags. Shared by the
 * one-click panel, the Inbox badges and "Send routine replies". Also sorts a
 * check-in into "1-click ready" or "needs you", and writes the report as text
 * for "Draft with AI".
 */

import { buildCheckinReport, type CheckinReport } from "./checkin-report";
import { CHECKIN_SCALES, type Checkin } from "./checkins";
import type { MemberSummary } from "./coach";
import type { CoachMacros } from "./coach-macros";
import { addDays } from "./dates";
import { dayTargetFinder, type DayTarget } from "./day-targets";
import { milestoneLabel } from "./milestones";
import { currentPlanWeek, effectiveCarbInputs } from "./plan-link";
import type { WeightUnit } from "./types";

export interface ReportBundle {
  report: CheckinReport;
  /** Their target on the check-in's last day (for a calorie change). */
  today: DayTarget | null;
}

export function reportFor(summary: MemberSummary, checkin: Checkin, previous: Checkin | null, coachMacros: CoachMacros | null, unit: WeightUnit): ReportBundle {
  const plan = summary.state;
  let targetFor: ((date: string) => DayTarget | null) | null = null;
  if (summary.hasPlan) {
    try {
      const week = currentPlanWeek(plan.profile, plan.fatLoss, plan.tracking.adjustments, checkin.stats.to);
      targetFor = dayTargetFinder(plan.profile, plan.fatLoss, effectiveCarbInputs(plan.carbs, week), plan.tracking.adjustments, coachMacros);
    } catch {
      targetFor = null;
    }
  }
  let weekTargets: { calories: number; protein: number; steps: number | null } | null = null;
  if (targetFor) {
    const days = Array.from({ length: 7 }, (_, i) => targetFor!(addDays(checkin.stats.from, i))).filter((d): d is DayTarget => d !== null);
    if (days.length > 0) {
      const avg = (k: "calories" | "protein") => Math.round(days.reduce((s, d) => s + d[k], 0) / days.length);
      weekTargets = { calories: avg("calories"), protein: avg("protein"), steps: plan.fatLoss.activitySource === "steps" ? plan.fatLoss.dailySteps : null };
    }
  }
  // Workouts a week they usually do, from the three weeks before this check-in.
  const from = addDays(checkin.stats.from, -21);
  const usualWorkouts =
    summary.data.workoutDates.length >= 3 ? summary.data.workoutDates.filter((d) => d >= from && d < checkin.stats.from).length / 3 : null;

  const report = buildCheckinReport({
    firstName: summary.displayName.split(" ")[0] || summary.displayName,
    unit,
    checkin,
    previous,
    targets: weekTargets,
    plannedRateLb: summary.progress?.plannedRate ?? null,
    observedRateLb: summary.progress?.observedRate ?? null,
    bodyWeightLb: summary.latestWeightLb,
    tooFast: summary.flags.includes("too-fast"),
    underFloor: summary.flags.includes("under-floor"),
    plateau: summary.flags.includes("plateau"),
    slipping: summary.data.slipping ?? [],
    usualWorkouts,
    milestones: (summary.data.milestones ?? []).map((m) => milestoneLabel(m, unit)),
    recommendation: summary.progress?.recommendation ?? null,
  });
  return { report, today: targetFor ? targetFor(checkin.stats.to) : null };
}

/** Struggles longer than this deserve the coach's own read. */
const LONG_NOTE = 40;

/**
 * "1-click ready" when the reply can go as written; otherwise what needs the
 * coach: a question to answer, a safety flag, a calorie decision, or a
 * longer note about their struggles.
 */
export function triageCheckin(report: CheckinReport, checkin: Checkin): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (checkin.answers.question.trim()) reasons.push("Question");
  if (report.focus.some((f) => f.priority === 0)) reasons.push("Safety");
  if (report.macro) reasons.push("Calorie change");
  if (checkin.answers.struggles.trim().length > LONG_NOTE) reasons.push("Read their note");
  return { ready: reasons.length === 0, reasons };
}

/** The report as plain text, for the AI draft to build on. */
export function reportText(report: CheckinReport, chosenFocus: readonly string[]): string {
  const ratingKeys = new Set(CHECKIN_SCALES.map((s) => `rating-${s.key}`));
  const lines = [
    "Scores (on target / close / off):",
    ...report.metrics
      .filter((m) => !ratingKeys.has(m.key))
      .map((m) => `- ${m.label}: ${m.value} (${m.detail}) — ${m.status === "good" ? "on target" : m.status === "ok" ? "close" : m.status === "low" ? "off" : "no comparison"}`),
  ];
  if (report.wins.length) lines.push(`Wins to name: ${report.wins.join("; ")}.`);
  if (report.weightLine) lines.push(`Weight: ${report.weightLine}`);
  if (chosenFocus.length) lines.push("The coach's focus items for next week (use these as the actions, in this order):", ...chosenFocus.map((f, i) => `${i + 1}. ${f}`));
  if (report.macro) lines.push(`The app suggests ${report.macro.kcal > 0 ? "+" : "−"}${Math.abs(report.macro.kcal)} kcal a day (${report.macro.reason}); mention it only if the coach's focus does.`);
  return lines.join("\n").slice(0, 2500);
}
