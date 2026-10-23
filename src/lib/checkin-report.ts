/**
 * The one-click check-in report (coach dashboard → a check-in): every number
 * the member gave us that week, scored against their plan and last week, the
 * wins worth naming, and the few changes most likely to help next week,
 * written as a reply the coach can send in one click. No AI: rules over
 * their own numbers, so it's instant, free and the same every time.
 *
 * The focus items go out with the reply and sit on the member's Today page
 * until their next check-in (worker/coaching.ts → coach_focus).
 */

import { CHECKIN_SCALES, type CheckinScale, type Checkin } from "./checkins";
import type { Recommendation } from "./adaptive";
import type { WeightUnit } from "./types";
import { fromLb } from "./units";

export type MetricStatus = "good" | "ok" | "low" | "none";

export interface ReportMetric {
  key: string;
  label: string;
  value: string;
  /** "target 180 g", "last week 3/5" */
  detail: string;
  status: MetricStatus;
}

export interface FocusItem {
  id: string;
  /** To the member: one specific thing to do this week. */
  text: string;
  /** For the coach: why it was picked. */
  why: string;
  /** Lower comes first. */
  priority: number;
}

export interface CheckinReport {
  metrics: ReportMetric[];
  wins: string[];
  /** Ranked; the first FOCUS_DEFAULT are suggested. */
  focus: FocusItem[];
  /** The app's calorie change for them, when it has one. */
  macro: { kcal: number; reason: string } | null;
  /** A line on their weight this week, for the reply. */
  weightLine: string | null;
}

export const FOCUS_DEFAULT = 3;
export const FOCUS_MAX = 3;
export const FOCUS_TEXT_MAX = 200;

export interface ReportInput {
  firstName: string;
  unit: WeightUnit;
  checkin: Checkin;
  /** The check-in before this one, for "vs last week". */
  previous: Checkin | null;
  /** Their daily targets in the check-in week (coach macros win over the plan). */
  targets: { calories: number; protein: number; steps: number | null } | null;
  /** lb/week, positive = losing, from their plan and their trend. */
  plannedRateLb: number | null;
  observedRateLb: number | null;
  bodyWeightLb: number | null;
  /** Safety and progress flags from the dashboard (src/lib/coach.ts). */
  tooFast: boolean;
  underFloor: boolean;
  plateau: boolean;
  /** Lifts whose estimated max is falling. */
  slipping: readonly string[];
  /** Workouts a week they usually do (from the weeks before), when known. */
  usualWorkouts: number | null;
  /** Milestones reached lately, in words. */
  milestones: readonly string[];
  recommendation: Recommendation | null;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const n = (x: number) => Math.round(x).toLocaleString("en-US");

export function buildCheckinReport(d: ReportInput): CheckinReport {
  const s = d.checkin.stats;
  // Last week's numbers, field by field (older check-ins may not have every one).
  const prevStats = d.previous?.stats ?? null;
  const p = prevStats
    ? {
        weighIns: typeof prevStats.weighIns === "number" ? prevStats.weighIns : null,
        foodDays: typeof prevStats.foodDays === "number" ? prevStats.foodDays : null,
        workouts: typeof prevStats.workouts === "number" ? prevStats.workouts : null,
        avgSteps: typeof prevStats.avgSteps === "number" ? prevStats.avgSteps : null,
        habitPercent: typeof prevStats.habitPercent === "number" ? prevStats.habitPercent : null,
      }
    : null;
  const r = d.checkin.answers.ratings;
  const pr = d.previous?.answers.ratings ?? null;
  const t = d.targets;
  const w = (lb: number) => `${(Math.round(fromLb(lb, d.unit) * 10) / 10).toLocaleString("en-US")} ${d.unit}`;
  const metrics: ReportMetric[] = [];
  const wins: string[] = [];
  const focus: FocusItem[] = [];
  const add = (f: Omit<FocusItem, "id"> & { id?: string }) => focus.push({ id: f.id ?? `f${focus.length}`, ...f });

  // Safety first.
  if (d.tooFast) {
    add({
      id: "too-fast",
      priority: 0,
      text: "Eat a little more this week: add about 150 kcal a day from carbs. You're losing faster than is good for keeping muscle.",
      why: "Losing more than 1.25% of body weight a week.",
    });
  }
  if (d.underFloor) {
    add({
      id: "under-floor",
      priority: 0,
      text: "Don't go under your calorie target on purpose. Eating too little slows progress and costs muscle; hit the number every day.",
      why: "Several days logged under the safe minimum.",
    });
  }

  // Weigh-ins and weight.
  metrics.push({
    key: "weigh-ins",
    label: "Weigh-ins",
    value: `${s.weighIns}/7`,
    detail: p?.weighIns != null ? `last week ${p.weighIns}/7` : "aim for 5+",
    status: s.weighIns >= 5 ? "good" : s.weighIns >= 3 ? "ok" : "low",
  });
  if (s.weighIns >= 5) wins.push(`weighed in ${s.weighIns} times`);
  if (s.weighIns < 4) {
    add({
      id: "weigh-ins",
      priority: 1,
      text: "Weigh in at least 5 mornings this week, first thing after the bathroom, so we can read your real trend.",
      why: `Only ${s.weighIns} weigh-in${s.weighIns === 1 ? "" : "s"}: too few to judge the trend.`,
    });
  }

  let weightLine: string | null = null;
  if (s.avgWeightLb !== null && s.prevAvgWeightLb !== null && s.weighIns >= 2) {
    const change = s.avgWeightLb - s.prevAvgWeightLb; // negative = down
    const plan = d.plannedRateLb;
    let status: MetricStatus = "ok";
    let verdict = "";
    if (plan !== null && plan > 0) {
      const lost = -change;
      if (lost >= plan * 0.6 && !d.tooFast) {
        status = "good";
        verdict = lost > plan * 1.4 ? "ahead of plan" : lost >= plan * 0.9 ? "right on plan" : "close to plan";
      } else if (lost > 0) verdict = "a little slower than plan";
      else {
        status = "low";
        verdict = "not moving yet";
      }
    } else if (plan !== null && plan < 0) {
      // Gaining on purpose (a lean bulk or reverse diet).
      status = change > 0 ? "good" : "ok";
      verdict = change > 0 ? "up, as planned" : "not up yet";
    }
    metrics.push({
      key: "weight",
      label: "Avg weight",
      value: w(s.avgWeightLb),
      detail: `${change <= 0 ? "−" : "+"}${w(Math.abs(change))} vs last week${plan ? ` · plan ${w(Math.abs(plan))}/wk` : ""}`,
      status,
    });
    const moved = `${change <= 0 ? "down" : "up"} ${w(Math.abs(change))}`;
    weightLine = verdict
      ? `Your average weight is ${moved} on last week, ${verdict}.`
      : `Your average weight is ${moved} on last week.`;
    if (status === "good") wins.push(change <= 0 ? `brought your average weight ${moved}` : `moved your average weight ${moved}`);
    if (verdict === "not moving yet" && s.weighIns >= 4 && s.foodDays >= 5) {
      weightLine += d.plateau
        ? " It's been flat for a couple of weeks, so it's time for a small change."
        : " One week can be water; we'll give it another week before changing anything.";
    }
  } else if (s.avgWeightLb !== null) {
    metrics.push({ key: "weight", label: "Avg weight", value: w(s.avgWeightLb), detail: "no week before to compare", status: "none" });
  }

  // Food.
  metrics.push({
    key: "food-days",
    label: "Food logged",
    value: `${s.foodDays}/7 days`,
    detail: p?.foodDays != null ? `last week ${p.foodDays}/7` : "aim for 6+",
    status: s.foodDays >= 6 ? "good" : s.foodDays >= 4 ? "ok" : "low",
  });
  if (s.foodDays >= 6) wins.push(`logged food ${s.foodDays} of 7 days`);
  if (s.foodDays <= 4) {
    add({
      id: "food-days",
      priority: 2,
      text: "Log your food every day, even rough entries. Aim for 6 of 7 days; it's the only way we can fine-tune your numbers.",
      why: `Food logged on ${s.foodDays} of 7 days.`,
    });
  }
  if (t && s.avgKcal !== null && s.foodDays >= 3) {
    const share = pct(s.avgKcal, t.calories)!;
    const status: MetricStatus = share >= 93 && share <= 107 ? "good" : share >= 85 && share <= 115 ? "ok" : "low";
    metrics.push({ key: "calories", label: "Calories", value: `${n(s.avgKcal)} kcal`, detail: `target ${n(t.calories)} (${share}%)`, status });
    if (status === "good") wins.push(`hit your calories (${n(s.avgKcal)} vs ${n(t.calories)})`);
    if (share > 107 && !d.tooFast) {
      add({
        id: "calories-over",
        priority: 3,
        text: `Stay at your calorie target every day (last week you averaged ${n(s.avgKcal)} against ${n(t.calories)}). Plan tomorrow's food tonight, and log before you eat.`,
        why: `${share - 100}% over the calorie target.`,
      });
    }
  }
  if (t && s.avgProtein !== null && s.foodDays >= 3) {
    const share = pct(s.avgProtein, t.protein)!;
    const status: MetricStatus = share >= 90 ? "good" : share >= 80 ? "ok" : "low";
    metrics.push({ key: "protein", label: "Protein", value: `${n(s.avgProtein)} g`, detail: `target ${n(t.protein)} g (${share}%)`, status });
    if (status === "good") wins.push(`hit your protein (${n(s.avgProtein)} g)`);
    if (share < 85) {
      const gap = Math.max(10, Math.round((t.protein - s.avgProtein) / 5) * 5);
      add({
        id: "protein",
        priority: 3,
        text: `Get protein up to ${n(t.protein)} g a day (you averaged ${n(s.avgProtein)} g). That's about ${gap} g more: a shake, Greek yoghurt or an extra palm of chicken covers it.`,
        why: `Protein at ${share}% of target.`,
      });
    }
  }

  // Steps.
  if (s.avgSteps !== null) {
    const target = t?.steps ?? null;
    const share = target ? pct(s.avgSteps, target) : null;
    const status: MetricStatus = share === null ? "none" : share >= 90 ? "good" : share >= 75 ? "ok" : "low";
    metrics.push({ key: "steps", label: "Steps", value: n(s.avgSteps), detail: target ? `target ${n(target)} (${share}%)` : p?.avgSteps ? `last week ${n(p.avgSteps)}` : "a day", status });
    if (status === "good") wins.push(`averaged ${n(s.avgSteps)} steps`);
    if (target && share !== null && share < 80) {
      add({
        id: "steps",
        priority: 4,
        text: `Average ${n(target)} steps a day (you were at ${n(s.avgSteps)}). A 15-minute walk after two meals adds about 3,000.`,
        why: `Steps at ${share}% of target.`,
      });
    }
  }

  // Training.
  const usual = d.usualWorkouts;
  metrics.push({
    key: "workouts",
    label: "Workouts",
    value: `${s.workouts}`,
    detail: usual !== null ? `usually ${Math.round(usual * 10) / 10}/wk` : p?.workouts != null ? `last week ${p.workouts}` : "this week",
    status: usual !== null && usual >= 1 ? (s.workouts >= Math.round(usual) ? "good" : s.workouts >= usual - 1 ? "ok" : "low") : s.workouts >= 3 ? "good" : s.workouts > 0 ? "ok" : "none",
  });
  if (s.workouts >= 3 && (usual === null || s.workouts >= Math.round(usual))) wins.push(`got ${s.workouts} workouts in`);
  if (usual !== null && usual >= 2 && s.workouts < Math.round(usual) - 1) {
    add({
      id: "workouts",
      priority: 4,
      text: `Get your ${Math.round(usual)} workouts in this week. Put them in your calendar now, like appointments.`,
      why: `${s.workouts} workout${s.workouts === 1 ? "" : "s"} against a usual ${Math.round(usual)}.`,
    });
  }
  if (d.slipping.length > 0) {
    metrics.push({ key: "strength", label: "Strength", value: `${d.slipping.length} slipping`, detail: d.slipping.slice(0, 2).join(", "), status: "low" });
    add({
      id: "slipping",
      priority: 6,
      text: `Hold the weight on ${d.slipping[0]}${d.slipping.length > 1 ? ` and ${d.slipping[1]}` : ""}: keep the load, stop 1–2 reps short of failure and rest the full time between sets.`,
      why: `Estimated max falling on ${d.slipping.join(", ")}.`,
    });
  }

  // Habits.
  if (s.habitPercent !== null) {
    const status: MetricStatus = s.habitPercent >= 80 ? "good" : s.habitPercent >= 60 ? "ok" : "low";
    metrics.push({ key: "habits", label: "Habit score", value: `${s.habitPercent}%`, detail: p?.habitPercent != null ? `last week ${p.habitPercent}%` : "aim for 80%", status });
    if (status === "good") wins.push(`scored ${s.habitPercent}% on your habits`);
    if (s.habitPercent < 60) {
      add({
        id: "habits",
        priority: 7,
        text: "Lift your habit score to 80%: pick the one habit you missed most and do it first thing each day.",
        why: `Habit scorecard at ${s.habitPercent}%.`,
      });
    }
  }

  // How they felt, against last week.
  const rating = (k: CheckinScale) => r[k];
  for (const sc of CHECKIN_SCALES) {
    const v = rating(sc.key);
    const before = pr?.[sc.key] ?? null;
    metrics.push({
      key: `rating-${sc.key}`,
      label: sc.label,
      value: `${v}/5`,
      detail: before !== null ? `last week ${before}/5` : sc.high.toLowerCase(),
      status: v >= 4 ? "good" : v === 3 ? "ok" : "low",
    });
    if (before !== null && v >= before + 1 && v >= 4) wins.push(`rated your ${sc.label.toLowerCase()} ${v}/5, up from ${before}`);
  }
  if (rating("sleep") <= 2) {
    add({
      id: "sleep",
      priority: 5,
      text: "Protect your sleep: same bedtime every night, screens off 30 minutes before, and aim for 7+ hours. It drives hunger, energy and recovery.",
      why: `Sleep rated ${rating("sleep")}/5.`,
    });
  }
  if (rating("hunger") <= 2 && !d.underFloor) {
    add({
      id: "hunger",
      priority: 5,
      text: "For hunger: protein at every meal, big portions of vegetables and potatoes for volume, and drink water before meals.",
      why: `Hunger rated ${rating("hunger")}/5.`,
    });
  }
  if (rating("stress") <= 2) {
    add({
      id: "stress",
      priority: 6,
      text: "Take 10 minutes a day to wind down: a walk outside or slow breathing. Keep training, but it's fine to ease the intensity this week.",
      why: `Stress rated ${rating("stress")}/5.`,
    });
  }
  if (rating("energy") <= 2 && !d.tooFast && !d.underFloor && rating("sleep") > 2) {
    add({
      id: "energy",
      priority: 6,
      text: "For energy: put most of your carbs in the meal before you train, and get outside in daylight in the morning.",
      why: `Energy rated ${rating("energy")}/5.`,
    });
  }

  // "Down 10 lb since starting" → "are down 10 lb since starting"; "Waist down 1 in" → "got your waist down 1 in".
  for (const m of d.milestones.slice(0, 1)) {
    const l = m.charAt(0).toLowerCase() + m.slice(1);
    wins.unshift(l.startsWith("down") ? `are ${l}` : `got your ${l}`);
  }

  focus.sort((a, b) => a.priority - b.priority);
  const macro =
    d.recommendation && Math.abs(d.recommendation.kcal) >= 50
      ? { kcal: d.recommendation.kcal, reason: d.recommendation.reason }
      : d.tooFast
        ? { kcal: 150, reason: "Losing faster than is good for keeping muscle." }
        : null;
  return { metrics, wins: wins.slice(0, 4), focus, macro, weightLine };
}

const list = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The reply the one click sends. Plain text, short paragraphs. */
export function composeReportReply(
  report: CheckinReport,
  opts: {
    firstName: string;
    focus: readonly string[];
    /** The macro change going out with it, when ticked. */
    macro: { kcal: number; newKcal: number } | null;
    /** The coach's answer to their question, if they asked one. */
    answer: string;
    /** Their own focus for next week, from the check-in. */
    theirFocus: string;
  },
): string {
  const parts: string[] = [];
  parts.push(`Hi ${opts.firstName || "there"},`);
  if (report.wins.length > 0) parts.push(`Good week: you ${list(report.wins)}.`);
  else parts.push("Thanks for checking in. Every week you show up and log is a week we can learn from.");
  if (report.weightLine) parts.push(report.weightLine);
  if (opts.macro) {
    parts.push(
      `${opts.macro.kcal > 0 ? "To look after your energy and muscle" : "To keep you on pace"}, I'm ${opts.macro.kcal > 0 ? "adding" : "taking"} ${Math.abs(opts.macro.kcal)} kcal a day ${opts.macro.kcal > 0 ? "to" : "from"} your target, through carbs. Your new daily target is ${n(opts.macro.newKcal)} kcal; it's in your Food tab now.`,
    );
  }
  if (opts.focus.length > 0) {
    parts.push(`Your focus for this week:\n${opts.focus.map((f, i) => `${i + 1}. ${f}`).join("\n")}`);
  }
  if (opts.answer.trim()) parts.push(`On your question: ${opts.answer.trim()}`);
  if (opts.theirFocus.trim()) parts.push(`You picked "${opts.theirFocus.trim()}" as your own focus too. Good call, stick with it.`);
  parts.push("Keep going. I'll see you at next week's check-in.");
  return parts.join("\n\n");
}

/** Sanitise focus items the coach sends (worker/coaching.ts). */
export function validateFocus(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/\s+/g, " ").trim().slice(0, FOCUS_TEXT_MAX))
    .filter(Boolean)
    .slice(0, FOCUS_MAX);
}
