/**
 * A member's Insights tab on the coach dashboard (coach-member-insights.tsx):
 * patterns from their own weeks ("what works for them"), a forecast with
 * what-ifs, why the scale jumped, whether a cut is keeping muscle, and a
 * monthly recap. All from what they already log; no AI. Patterns are worded
 * as "linked with", never "caused".
 */

import { addDays, daysBetween } from "./dates";
import { findExercise, doneSets, e1rm, type Workout } from "./training";
import { weekStartOf, STEPS_KEY, type HabitEntries } from "./habits";
import { strengthTrends, TREND_WEEKS } from "./strength-trends";
import { losingMuscle, weightChangeOver, CUT_LB } from "./muscle-check";
import type { Checkin, CheckinScale } from "./checkins";
import type { FoodDay } from "./coach-api";
import type { WeightUnit } from "./types";
import { fromLb } from "./units";

export interface InsightsInput {
  today: string;
  unit: WeightUnit;
  firstName: string;
  weighIns: readonly { date: string; weightLb: number }[];
  food: readonly FoodDay[];
  habitLogs: readonly { date: string; entries: HabitEntries }[];
  workouts: readonly Workout[];
  checkins: readonly Checkin[];
}

const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (x: number) => Math.round(x * 10) / 10;
const n = (x: number) => Math.round(x).toLocaleString("en-US");

/* -------------------------------- weeks -------------------------------- */

interface Week {
  start: string;
  /** The week's weight trend, lb a week (negative = down): a line through its 4+ weigh-ins. */
  change: number | null;
  steps: number | null;
  protein: number | null;
  kcal: number | null;
  foodDays: number;
  workouts: number;
  ratings: Record<CheckinScale, number> | null;
}

/** Their last complete weeks (Monday start), oldest first. */
function weeksOf(d: InsightsInput, count = 16): Week[] {
  const thisWeek = weekStartOf(d.today);
  const starts = Array.from({ length: count }, (_, i) => addDays(thisWeek, -7 * (count - i)));
  // The slope within the week, so each week's habits line up with that week's change: the
  // median of the slopes between every pair of weigh-ins, so one heavy morning (a Monday after
  // the weekend) can't swing it.
  const weekRate = (start: string): number | null => {
    const pts = d.weighIns
      .filter((w) => w.date >= start && w.date < addDays(start, 7))
      .map((w) => ({ x: daysBetween(start, w.date), y: w.weightLb }));
    if (pts.length < 4) return null;
    const slopes: number[] = [];
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (pts[j]!.x !== pts[i]!.x) slopes.push((pts[j]!.y - pts[i]!.y) / (pts[j]!.x - pts[i]!.x));
    if (slopes.length === 0) return null;
    slopes.sort((a, b) => a - b);
    const mid = Math.floor(slopes.length / 2);
    return (slopes.length % 2 ? slopes[mid]! : (slopes[mid - 1]! + slopes[mid]!) / 2) * 7;
  };
  return starts.map((start) => {
    const end = addDays(start, 7);
    const inWeek = (date: string) => date >= start && date < end;
    const steps = d.habitLogs
      .filter((l) => inWeek(l.date))
      .map((l) => l.entries[STEPS_KEY])
      .filter((v): v is number => typeof v === "number" && v > 0);
    const food = d.food.filter((f) => inWeek(f.date) && f.kcal > 0);
    const checkin = d.checkins.find((c) => c.weekStart === end) ?? d.checkins.find((c) => c.weekStart === start) ?? null;
    return {
      start,
      change: weekRate(start),
      steps: steps.length >= 3 ? avg(steps) : null,
      protein: food.length >= 3 ? avg(food.map((f) => f.protein)) : null,
      kcal: food.length >= 3 ? avg(food.map((f) => f.kcal)) : null,
      foodDays: food.length,
      workouts: d.workouts.filter((w) => w.finishedAt !== null && inWeek(w.date)).length,
      ratings: checkin ? checkin.answers.ratings : null,
    };
  });
}

/** The weeks with both numbers, split at the middle of `by`: [low half, high half]. */
function split<T>(rows: T[], by: (r: T) => number | null, metric: (r: T) => number | null, min = 3) {
  const ok = rows.filter((r) => by(r) !== null && metric(r) !== null).sort((a, b) => by(a)! - by(b)!);
  if (ok.length < min * 2) return null;
  const half = Math.floor(ok.length / 2);
  const lo = ok.slice(0, half);
  const hi = ok.slice(ok.length - half);
  return {
    threshold: by(hi[0]!)!,
    lo: avg(lo.map((r) => metric(r)!))!,
    hi: avg(hi.map((r) => metric(r)!))!,
    weeks: ok.length,
  };
}

/* -------------------------------- 1. patterns -------------------------------- */

export interface Insight {
  id: string;
  title: string;
  detail: string;
  /** Weeks (or days) it's based on. */
  basis: string;
  /** To the member, if the coach sends it. */
  message: string;
}

/** Weeks of data before patterns are worth reading. */
export const PATTERN_MIN_WEEKS = 6;

export function patterns(d: InsightsInput): { insights: Insight[]; weeksWithData: number } {
  const weeks = weeksOf(d);
  const w = (lb: number) => `${r1(fromLb(Math.abs(lb), d.unit))} ${d.unit}`;
  const loss = (x: Week) => (x.change === null ? null : -x.change);
  const out: Insight[] = [];
  const weeksWithData = weeks.filter((x) => x.change !== null || x.foodDays > 0).length;

  // Steps and weekly loss.
  const steps = split(weeks, (x) => x.steps, loss);
  if (steps && steps.hi - steps.lo >= 0.3) {
    out.push({
      id: "steps-loss",
      title: "More steps, faster loss",
      detail: `Weeks averaging ${n(steps.threshold)}+ steps: −${w(steps.hi)} a week. Fewer steps: −${w(steps.lo)}.`,
      basis: `${steps.weeks} weeks`,
      message: `${d.firstName}, looking back at your weeks: when you averaged ${n(steps.threshold)}+ steps you lost ${w(steps.hi)} a week, against ${w(steps.lo)} when you didn't. Steps are working for you, so keep them up.`,
    });
  }

  // Logging and weekly loss.
  const logged = weeks.filter((x) => loss(x) !== null);
  const full = logged.filter((x) => x.foodDays >= 6);
  const thin = logged.filter((x) => x.foodDays <= 4);
  if (full.length >= 2 && thin.length >= 2) {
    const a = avg(full.map((x) => loss(x)!))!;
    const b = avg(thin.map((x) => loss(x)!))!;
    if (a - b >= 0.3) {
      out.push({
        id: "logging-loss",
        title: "Logged weeks go better",
        detail: `Weeks with food logged 6–7 days: −${w(a)} a week. Four days or fewer: −${w(b)}.`,
        basis: `${full.length + thin.length} weeks`,
        message: `${d.firstName}, your weeks with food logged 6 or 7 days averaged ${w(a)} down, against ${w(b)} when logging slipped. Logging is one of your best levers.`,
      });
    }
  }

  // Training and weekly loss.
  const trained = logged.filter((x) => x.workouts >= 3);
  const rested = logged.filter((x) => x.workouts <= 1);
  if (trained.length >= 2 && rested.length >= 2) {
    const a = avg(trained.map((x) => loss(x)!))!;
    const b = avg(rested.map((x) => loss(x)!))!;
    if (a - b >= 0.3) {
      out.push({
        id: "training-loss",
        title: "Training weeks go better",
        detail: `Weeks with 3+ workouts: −${w(a)} a week. One or none: −${w(b)}.`,
        basis: `${trained.length + rested.length} weeks`,
        message: `${d.firstName}, in weeks you trained 3+ times you averaged ${w(a)} down, against ${w(b)} when training dropped off. Protect those sessions.`,
      });
    }
  }

  // Protein and hunger (5 = no problem).
  const protein = split(weeks, (x) => x.protein, (x) => x.ratings?.hunger ?? null, 2);
  if (protein && protein.hi - protein.lo >= 0.6) {
    out.push({
      id: "protein-hunger",
      title: "Higher protein, less hunger",
      detail: `Weeks averaging ${n(protein.threshold)}+ g protein: hunger ${r1(protein.hi)}/5. Lower-protein weeks: ${r1(protein.lo)}/5.`,
      basis: `${protein.weeks} weeks`,
      message: `${d.firstName}, your check-ins show hunger is easier (${r1(protein.hi)}/5 vs ${r1(protein.lo)}/5) in weeks you average ${n(protein.threshold)}+ g of protein. Keep protein high when hunger bites.`,
    });
  }

  // Sleep and energy / hunger.
  const rated = weeks.filter((x) => x.ratings);
  const poor = rated.filter((x) => x.ratings!.sleep <= 2);
  const good = rated.filter((x) => x.ratings!.sleep >= 4);
  if (poor.length >= 2 && good.length >= 2) {
    const eGood = avg(good.map((x) => x.ratings!.energy))!;
    const ePoor = avg(poor.map((x) => x.ratings!.energy))!;
    const hGood = avg(good.map((x) => x.ratings!.hunger))!;
    const hPoor = avg(poor.map((x) => x.ratings!.hunger))!;
    if (eGood - ePoor >= 0.8 || hGood - hPoor >= 0.8) {
      out.push({
        id: "sleep",
        title: "Sleep drives their week",
        detail: `Good-sleep weeks: energy ${r1(eGood)}/5, hunger ${r1(hGood)}/5. Poor-sleep weeks: energy ${r1(ePoor)}/5, hunger ${r1(hPoor)}/5.`,
        basis: `${poor.length + good.length} check-ins`,
        message: `${d.firstName}, your check-ins show it clearly: on weeks you sleep well, energy and hunger are both better (${r1(eGood)} vs ${r1(ePoor)} for energy). Sleep is a priority, not a bonus.`,
      });
    }
  }

  // Weekends.
  const recent = d.food.filter((f) => f.kcal > 0 && f.date >= addDays(d.today, -56));
  const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
  const we = recent.filter((f) => isWeekend(f.date));
  const wd = recent.filter((f) => !isWeekend(f.date));
  if (we.length >= 4 && wd.length >= 8) {
    const diff = avg(we.map((f) => f.kcal))! - avg(wd.map((f) => f.kcal))!;
    if (diff >= 250) {
      out.push({
        id: "weekends",
        title: "Weekends run high",
        detail: `Saturdays and Sundays average ${n(diff)} kcal more than weekdays (${n(avg(we.map((f) => f.kcal))!)} vs ${n(avg(wd.map((f) => f.kcal))!)}).`,
        basis: `${recent.length} logged days`,
        message: `${d.firstName}, your weekends average about ${n(diff)} kcal a day more than your weekdays. Plan one meal out and keep the rest of the weekend like a weekday.`,
      });
    }
  }

  // Monday weigh-ins against their week.
  const residuals: { day: number; r: number }[] = [];
  for (const wk of weeks.slice(-12)) {
    const inWeek = d.weighIns.filter((x) => x.date >= wk.start && x.date < addDays(wk.start, 7));
    if (inWeek.length < 3) continue;
    const mean = avg(inWeek.map((x) => x.weightLb))!;
    for (const x of inWeek) residuals.push({ day: new Date(`${x.date}T12:00:00Z`).getUTCDay(), r: x.weightLb - mean });
  }
  const mondays = residuals.filter((x) => x.day === 1);
  if (mondays.length >= 3) {
    const m = avg(mondays.map((x) => x.r))!;
    if (m >= 0.8) {
      out.push({
        id: "mondays",
        title: "Mondays read heavy",
        detail: `Their Monday weigh-ins sit ${w(m)} above that week's average: the weekend, not fat.`,
        basis: `${mondays.length} Mondays`,
        message: `${d.firstName}, your Monday weigh-ins average ${w(m)} above the rest of the week. That's the weekend's water and salt, not fat, so judge the week by the average, not Monday.`,
      });
    }
  }
  return { insights: out, weeksWithData };
}

/* -------------------------------- 2. monthly recap -------------------------------- */

export interface MonthRecap {
  month: string;
  label: string;
  weightStart: number | null;
  weightEnd: number | null;
  waistChange: number | null;
  workouts: number;
  /** Best estimated-max gains this month against before it. */
  bests: { name: string; pct: number }[];
  foodDays: number;
  days: number;
  checkins: number;
  habitAvg: number | null;
  quote: string | null;
  /** Front photos (else any pose) from the start and end of the month, when shared. */
  photos: { before: string; after: string } | null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthRecap(
  d: InsightsInput & { measurements: readonly { date: string; waist: number | null }[]; photos: readonly { id: string; date: string; pose: string }[] | null },
  month: string,
): MonthRecap {
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const to = addDays(next, -1) < d.today ? addDays(next, -1) : d.today;
  const inMonth = (date: string) => date >= from && date <= to;
  const ws = d.weighIns.filter((w) => inMonth(w.date)).sort((a, b) => a.date.localeCompare(b.date));
  const edge = (xs: typeof ws) => (xs.length ? avg(xs.map((x) => x.weightLb)) : null);

  const done = d.workouts.filter((w) => w.finishedAt !== null && Array.isArray(w.exercises));
  const best = (list: readonly Workout[]) => {
    const out = new Map<string, number>();
    for (const w of list)
      for (const e of w.exercises) {
        if (e.bodyweight) continue;
        for (const s of doneSets(e)) {
          const v = e1rm(s.weight, s.reps);
          if (v > (out.get(e.exerciseId) ?? 0)) out.set(e.exerciseId, v);
        }
      }
    return out;
  };
  const before = best(done.filter((w) => w.date < from));
  const during = best(done.filter((w) => inMonth(w.date)));
  const names = new Map(done.flatMap((w) => w.exercises.map((e) => [e.exerciseId, findExercise(e.exerciseId, [])?.name ?? e.name] as const)));
  const bests = [...during]
    .filter(([id, v]) => (before.get(id) ?? 0) > 0 && v > before.get(id)!)
    .map(([id, v]) => ({ name: names.get(id) ?? "Lift", pct: r1((v / before.get(id)! - 1) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3);

  const waist = d.measurements.filter((x) => inMonth(x.date) && x.waist !== null).sort((a, b) => a.date.localeCompare(b.date));
  const cis = d.checkins.filter((c) => inMonth(c.submittedAt.slice(0, 10)));
  const quote = [...cis].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).map((c) => c.answers.wins.trim()).find(Boolean) ?? null;
  const pics = (d.photos ?? []).filter((p) => inMonth(p.date)).sort((a, b) => a.date.localeCompare(b.date));
  const pick = (list: typeof pics) => list.find((p) => p.pose === "front") ?? list[0];
  const first = pick(pics.filter((p) => p.date === pics[0]?.date));
  const last = pick(pics.filter((p) => p.date === pics.at(-1)?.date));

  return {
    month,
    label: `${MONTHS[m - 1]} ${y}`,
    weightStart: edge(ws.slice(0, 3)),
    weightEnd: ws.length >= 4 ? edge(ws.slice(-3)) : null,
    waistChange: waist.length >= 2 ? waist.at(-1)!.waist! - waist[0]!.waist! : null,
    workouts: done.filter((w) => inMonth(w.date)).length,
    bests,
    foodDays: d.food.filter((f) => inMonth(f.date) && f.kcal > 0).length,
    days: daysBetween(from, to) + 1,
    checkins: cis.length,
    habitAvg: avg(cis.map((c) => c.stats.habitPercent).filter((v): v is number => typeof v === "number")),
    quote,
    photos: first && last && first.date !== last.date ? { before: first.id, after: last.id } : null,
  };
}

/** The recap as a message to the member. */
export function recapMessage(r: MonthRecap, firstName: string, unit: WeightUnit): string {
  const parts: string[] = [];
  if (r.weightStart !== null && r.weightEnd !== null) {
    const ch = r.weightEnd - r.weightStart;
    parts.push(`${ch <= 0 ? "down" : "up"} ${r1(fromLb(Math.abs(ch), unit))} ${unit} (${r1(fromLb(r.weightStart, unit))} → ${r1(fromLb(r.weightEnd, unit))})`);
  }
  if (r.waistChange !== null && r.waistChange < 0) parts.push(`${r1(Math.abs(unit === "kg" ? r.waistChange * 2.54 : r.waistChange))} ${unit === "kg" ? "cm" : "in"} off your waist`);
  if (r.workouts) parts.push(`${r.workouts} workouts`);
  if (r.bests.length) parts.push(`new bests on ${r.bests.map((b) => `${b.name} (+${b.pct}%)`).join(", ")}`);
  parts.push(`food logged ${r.foodDays} of ${r.days} days`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  return `${firstName}, your ${r.label.split(" ")[0]} in review: ${list}.${r.quote ? ` In your words: "${r.quote}"` : ""} Proud of this month. Let's make the next one even better.`;
}

/* -------------------------------- 3. forecast -------------------------------- */

/** kcal a step for every kg of body weight (about 0.035 kcal a step at 70 kg). */
const KCAL_PER_STEP_PER_KG = 0.0005;

export function forecast(o: {
  today: string;
  trendLb: number | null;
  /** lb/week, positive = losing. */
  rateLb: number | null;
  goalLb: number | null;
  kcalDelta: number;
  stepsDelta: number;
}): { rate: number | null; date: string | null; weeks: number | null } {
  if (o.trendLb === null || o.rateLb === null) return { rate: null, date: null, weeks: null };
  const kg = o.trendLb * 0.45359237;
  const extra = -o.kcalDelta + o.stepsDelta * KCAL_PER_STEP_PER_KG * kg; // kcal a day more deficit
  const rate = o.rateLb + (extra * 7) / 3500;
  if (o.goalLb === null) return { rate, date: null, weeks: null };
  const remaining = o.trendLb - o.goalLb; // positive = still to lose
  if (Math.abs(remaining) < 0.5) return { rate, date: o.today, weeks: 0 };
  if (rate === 0 || Math.sign(rate) !== Math.sign(remaining)) return { rate, date: null, weeks: null };
  const weeks = remaining / rate;
  if (weeks > 104) return { rate, date: null, weeks: null };
  return { rate, date: addDays(o.today, Math.round(weeks * 7)), weeks };
}

/* -------------------------------- 4. weight jumps -------------------------------- */

export interface WeightJump {
  date: string;
  fromLb: number;
  toLb: number;
  reasons: string[];
  settled: string | null;
}

const LEGS = new Set(["quads", "hamstrings", "glutes", "calves"]);

export function weightJumps(d: InsightsInput, days = 35): WeightJump[] {
  const ws = [...d.weighIns].sort((a, b) => a.date.localeCompare(b.date));
  const since = addDays(d.today, -days);
  const usual = (date: string) => {
    const prior = d.food.filter((f) => f.kcal > 0 && f.date < date && f.date >= addDays(date, -15));
    return prior.length >= 4 ? { kcal: avg(prior.map((f) => f.kcal))!, carbs: avg(prior.map((f) => f.carbs))! } : null;
  };
  const out: WeightJump[] = [];
  for (let i = 1; i < ws.length; i++) {
    const a = ws[i - 1]!;
    const b = ws[i]!;
    if (b.date < since || b.weightLb - a.weightLb < 1 || daysBetween(a.date, b.date) > 4) continue;
    const reasons: string[] = [];
    const dayBefore = d.food.find((f) => f.date === addDays(b.date, -1) && f.kcal > 0);
    const base = usual(addDays(b.date, -1));
    if (dayBefore && base) {
      if (dayBefore.kcal - base.kcal >= 300) reasons.push(`+${n(dayBefore.kcal - base.kcal)} kcal the day before (${n(dayBefore.kcal)} vs their usual ${n(base.kcal)})`);
      if (dayBefore.carbs - base.carbs >= 50) reasons.push(`+${n(dayBefore.carbs - base.carbs)} g carbs the day before: carbs are stored with water`);
    }
    for (const back of [1, 2]) {
      const day = addDays(b.date, -back);
      const sets = d.workouts
        .filter((w) => w.date === day && w.finishedAt !== null)
        .flatMap((w) => w.exercises.filter((e) => LEGS.has(findExercise(e.exerciseId, [])?.muscle ?? "")).flatMap((e) => doneSets(e)));
      if (sets.length >= 10) {
        reasons.push(`Hard leg day ${back === 1 ? "the day before" : "2 days before"} (${sets.length} sets): worked muscles hold water`);
        break;
      }
    }
    const dow = new Date(`${b.date}T12:00:00Z`).getUTCDay();
    if (dow === 1 || dow === 0) reasons.push("Weighed in after the weekend");
    if (daysBetween(a.date, b.date) >= 3) reasons.push(`First weigh-in in ${daysBetween(a.date, b.date)} days`);
    if (reasons.length === 0) reasons.push("Nothing in their logs explains it: most likely water, salt or weigh-in timing (the app doesn't track salt or cycles)");
    const back = ws.slice(i + 1).find((x) => daysBetween(b.date, x.date) <= 7 && x.weightLb <= a.weightLb + 0.3);
    out.push({
      date: b.date,
      fromLb: a.weightLb,
      toLb: b.weightLb,
      reasons,
      settled: back ? `Back to ${r1(fromLb(back.weightLb, d.unit))} ${d.unit} ${daysBetween(b.date, back.date)} day${daysBetween(b.date, back.date) === 1 ? "" : "s"} later` : null,
    });
  }
  return out.reverse().slice(0, 6);
}

/* -------------------------------- 5. muscle kept -------------------------------- */

export interface MuscleCheck {
  verdict: "kept" | "losing" | "steady" | "slipping" | "unknown";
  weightChangeLb: number | null;
  up: string[];
  holding: string[];
  down: string[];
  text: string;
}

export function muscleCheck(d: InsightsInput): MuscleCheck {
  const trends = strengthTrends(d.workouts, d.today).filter((t) => t.status !== "new");
  const up = trends.filter((t) => t.status === "up").map((t) => t.name);
  const holding = trends.filter((t) => t.status === "hold").map((t) => t.name);
  const down = trends.filter((t) => t.status === "down").map((t) => t.name);
  const change = weightChangeOver(d.weighIns, d.today);
  const w = (lb: number) => `${r1(fromLb(Math.abs(lb), d.unit))} ${d.unit}`;
  const base = { weightChangeLb: change, up, holding, down };
  if (trends.length < 2) return { ...base, verdict: "unknown", text: `Not enough lifts logged over the last ${TREND_WEEKS} weeks to judge.` };
  if (losingMuscle(change, down.length, trends.length)) {
    return { ...base, verdict: "losing", text: `Down ${w(change!)} in ${TREND_WEEKS} weeks with ${down.length} of ${trends.length} lifts slipping: likely losing some muscle. Check protein, sleep and how hard they're cutting.` };
  }
  if (change !== null && change <= -CUT_LB) {
    return { ...base, verdict: "kept", text: `Down ${w(change)} in ${TREND_WEEKS} weeks with lifts holding (${up.length} up, ${holding.length} holding, ${down.length} slipping): muscle kept.` };
  }
  if (down.length >= 2) {
    return { ...base, verdict: "slipping", text: `${down.length} lifts slipping without much weight loss: look at recovery, sleep and programming.` };
  }
  return { ...base, verdict: "steady", text: `Weight ${change === null ? "trend unclear" : change <= 0 ? `down ${w(change)}` : `up ${w(change)}`} over ${TREND_WEEKS} weeks; lifts ${up.length} up, ${holding.length} holding, ${down.length} slipping.` };
}
