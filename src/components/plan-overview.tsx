"use client";

import * as React from "react";
import { ArrowRight, CalendarClock, Check, Share2, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented";
import { ProgressChart } from "@/components/progress-chart";
import { analyzeProgress, predictedWeightOn, trendSeries, type ProgressAnalysis } from "@/lib/adaptive";
import type { CoachMacros } from "@/lib/coach-macros";
import { addDays, daysBetween, formatShort } from "@/lib/dates";
import { dayTargetFinder } from "@/lib/day-targets";
import { calculateFatLossTimeline, formatTimelineSummary } from "@/lib/fat-loss";
import { weekStartOf } from "@/lib/habits";
import { afterGoalDay, afterGoalLabel, afterGoalPlan } from "@/lib/reverse-diet";
import type { CalorieAdjustment, WeighIn } from "@/lib/tracking";
import type { BiometricProfile, CarbCyclingInputs, FatLossInputs, WeightUnit } from "@/lib/types";
import { fromLb, round } from "@/lib/units";
import { cn } from "@/lib/utils";

const STATUS: Record<ProgressAnalysis["status"], { label: string; variant: "default" | "secondary" | "success" | "warning" }> = {
  "no-plan": { label: "No plan", variant: "secondary" },
  "no-data": { label: "Start weighing in", variant: "secondary" },
  "not-started": { label: "Not started", variant: "secondary" },
  collecting: { label: "Collecting data", variant: "secondary" },
  waiting: { label: "Settling", variant: "default" },
  "on-track": { label: "On track", variant: "success" },
  behind: { label: "Behind plan", variant: "warning" },
  ahead: { label: "Ahead of plan", variant: "warning" },
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_DOT = { high: "bg-day-high", medium: "bg-day-medium", low: "bg-day-low" } as const;

/** A weekly average change smaller than this is the plan easing, not a change worth showing. */
const NEXT_CHANGE_MIN = 25;
/** How many weeks the maintenance phase gets on the phases bar (it has no end). */
const MAINTAIN_BAR_WEEKS = 5;

/**
 * Plan → Overview: the plan at a glance. Where it's going and when, how it's
 * going (the same check as Progress → Weigh-in), today's targets and the next
 * change, plan vs actual, and the phases (cut, reverse, maintain). Settings
 * live under Plan → Settings; the day-by-day numbers under Plan → Calendar.
 */
export function PlanOverview({
  profile,
  fatLoss,
  carbs,
  adjustments,
  weighIns,
  coachMacros,
  today,
  unit,
  onOpenSettings,
  onOpenSetup,
  onOpenCalendar,
  onOpenWeighIn,
}: {
  profile: BiometricProfile;
  fatLoss: FatLossInputs;
  carbs: CarbCyclingInputs;
  adjustments: CalorieAdjustment[];
  weighIns: WeighIn[];
  coachMacros: CoachMacros | null;
  today: string;
  unit: WeightUnit;
  onOpenSettings: () => void;
  onOpenSetup: () => void;
  onOpenCalendar: () => void;
  onOpenWeighIn: () => void;
}) {
  const [range, setRange] = React.useState<"plan" | "recent">("plan");
  const [shared, setShared] = React.useState(false);
  const timeline = React.useMemo(() => calculateFatLossTimeline(profile, fatLoss), [profile, fatLoss]);
  const analysis = React.useMemo(() => analyzeProgress(profile, timeline, weighIns, adjustments, today), [profile, timeline, weighIns, adjustments, today]);
  const targetFor = React.useMemo(() => dayTargetFinder(profile, fatLoss, carbs, adjustments, coachMacros), [profile, fatLoss, carbs, adjustments, coachMacros]);
  const after = React.useMemo(() => (timeline.feasible ? afterGoalPlan(profile, fatLoss, timeline, adjustments) : null), [profile, fatLoss, timeline, adjustments]);
  const trendNow = React.useMemo(() => trendSeries(weighIns).slice(-1)[0]?.trend ?? null, [weighIns]);

  const w = (lb: number, decimals = 1) => `${round(fromLb(lb, unit), decimals)} ${unit}`;

  if (!timeline.feasible) {
    return (
      <Card className="border-dashed lg:max-w-2xl">
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <Target className="h-6 w-6 text-primary" />
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Set your goal to see your plan</h2>
            <p className="text-sm text-muted-foreground">Your weight, goal and how fast you want to go. Everything else follows from those.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onOpenSetup}>Set up my plan</Button>
            <Button variant="outline" onClick={onOpenSettings}>
              Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const start = timeline.requiredStartDate;
  const finish = timeline.finishDate;
  const totalWeeks = timeline.weeksRequired;
  const daysIn = daysBetween(start, today);
  const weekNo = Math.min(totalWeeks, Math.floor(daysIn / 7) + 1);
  const afterDay = after ? afterGoalDay(after, today) : null;
  const phaseLine =
    daysIn < 0
      ? `Starts ${formatShort(start)}`
      : today < finish
        ? `Cut · week ${weekNo} of ${totalWeeks}`
        : after && afterDay
          ? afterGoalLabel(after, afterDay)
          : "Goal date reached";
  const progressPct = Math.max(0, Math.min(100, (daysIn / Math.max(1, daysBetween(start, finish))) * 100));
  const goalText =
    fatLoss.goalType === "bodyFat" ? `${fatLoss.targetBodyFat}% body fat by ${formatShort(finish)}` : `${w(fatLoss.targetWeight, 0)} by ${formatShort(finish)}`;
  const startWeight = timeline.projection[0]?.weight ?? profile.weight;

  // Today's targets, and the next week whose average day changes.
  const todayTarget = targetFor(today);
  const weekAvg = (weekStart: string) => {
    const ts = Array.from({ length: 7 }, (_, i) => targetFor(addDays(weekStart, i))).filter((t): t is NonNullable<typeof t> => t !== null);
    return ts.length ? Math.round(ts.reduce((s, t) => s + t.calories, 0) / ts.length) : null;
  };
  const thisWeek = weekStartOf(today);
  const thisAvg = weekAvg(thisWeek);
  let nextChange: { from: string; kcal: number; diff: number } | null = null;
  if (thisAvg !== null && !coachMacros) {
    for (let i = 1; i <= 6; i++) {
      const ws = addDays(thisWeek, i * 7);
      const avg = weekAvg(ws);
      if (avg !== null && Math.abs(avg - thisAvg) >= NEXT_CHANGE_MIN) {
        nextChange = { from: ws, kcal: avg, diff: avg - thisAvg };
        break;
      }
    }
  }

  // Phases: the cut, then the reverse (if any) and maintenance.
  const reverseWeeks = after?.mode === "reverse" ? after.weeks.length : 0;
  const phases = [
    { label: `Cut · ${totalWeeks} wk`, weeks: totalWeeks, className: "bg-primary/25 text-primary" },
    ...(reverseWeeks > 0 ? [{ label: `Reverse · ${reverseWeeks} wk`, weeks: reverseWeeks, className: "bg-macro-carb/20 text-macro-carb" }] : []),
    ...(after ? [{ label: "Maintain", weeks: MAINTAIN_BAR_WEEKS, className: "bg-success/15 text-success" }] : []),
  ];
  const barWeeks = phases.reduce((s, p) => s + p.weeks, 0);
  const todayPct = Math.max(0, Math.min(100, (daysIn / 7 / barWeeks) * 100));
  const status = STATUS[analysis.status];
  const goalLb = fatLoss.goalType === "bodyFat" ? timeline.endWeight : fatLoss.targetWeight;
  const toGo = Math.max(0, (trendNow ?? startWeight) - goalLb);

  // This week, Monday to Sunday: each day's type and where the plan has you by Sunday.
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(thisWeek, i);
    return { date, target: targetFor(date) };
  });
  const sunday = addDays(thisWeek, 6);
  const aimBySunday = sunday >= start && sunday <= finish ? predictedWeightOn(timeline, sunday) : null;

  const share = async () => {
    const text = formatTimelineSummary(profile, fatLoss, timeline, unit, (lb) => fromLb(lb, unit));
    try {
      if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "My plan", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 2500);
    } catch {
      /* cancelled, or no clipboard */
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <Card className="lg:col-start-1 lg:row-start-1">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Your plan</p>
              <Button variant="outline" size="sm" className="h-8" onClick={share} aria-label="Share plan">
                {shared ? <Check /> : <Share2 />}
                <span className="hidden sm:inline">{shared ? "Copied" : "Share plan"}</span>
              </Button>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-2xl font-bold tracking-tight">{goalText}</h2>
              <span className="text-sm text-muted-foreground">{phaseLine}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(progressPct)}% of the way through the plan`}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="tabular grid grid-cols-3 gap-2 text-sm lg:grid-cols-4">
              <div>
                <p className="text-[12px] text-muted-foreground">Start</p>
                <p className="font-semibold">{w(startWeight)}</p>
              </div>
              <div className="text-center lg:text-left">
                <p className="text-[12px] text-muted-foreground">Now (trend)</p>
                <p className="font-semibold">{trendNow === null ? "—" : w(trendNow)}</p>
              </div>
              <div className="hidden lg:block">
                <p className="text-[12px] text-muted-foreground">To go</p>
                <p className="font-semibold">{w(toGo)}</p>
              </div>
              <div className="text-right lg:text-left">
                <p className="text-[12px] text-muted-foreground">Goal</p>
                <p className="font-semibold">{fatLoss.goalType === "bodyFat" ? `${fatLoss.targetBodyFat}%` : w(fatLoss.targetWeight, 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

      <div className="space-y-5 lg:col-start-2 lg:row-span-3 lg:row-start-1">
        <Card>
          <CardContent className="space-y-2 p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">How it&apos;s going</p>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <p className="font-semibold">{analysis.headline}</p>
            <p className="text-sm text-muted-foreground">{analysis.detail}</p>
            <Button variant="outline" size="sm" onClick={onOpenWeighIn}>
              Weekly review
              <ArrowRight />
            </Button>
          </CardContent>
        </Card>
        {todayTarget ? (
          <Card>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Today&apos;s targets</p>
                {!todayTarget.steady ? (
                  <Badge variant="secondary">
                    {todayTarget.type[0]!.toUpperCase() + todayTarget.type.slice(1)}-carb day
                  </Badge>
                ) : todayTarget.source === "coach" ? (
                  <Badge variant="secondary">Set by your coach</Badge>
                ) : null}
              </div>
              <p className="tabular">
                <span className="text-3xl font-bold">{todayTarget.calories.toLocaleString()}</span>{" "}
                <span className="text-muted-foreground">kcal</span>
              </p>
              <div className="tabular grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-md bg-muted/40 px-3 py-2">
                  <p className="text-[12px] font-medium text-macro-protein">Protein</p>
                  <p className="font-semibold">{todayTarget.protein} g</p>
                </div>
                <div className="rounded-md bg-muted/40 px-3 py-2">
                  <p className="text-[12px] font-medium text-macro-carb">Carbs</p>
                  <p className="font-semibold">{todayTarget.carbs} g</p>
                </div>
                <div className="rounded-md bg-muted/40 px-3 py-2">
                  <p className="text-[12px] font-medium text-macro-fat">Fat</p>
                  <p className="font-semibold">{todayTarget.fat} g</p>
                </div>
              </div>
              {nextChange ? (
                <p className="flex items-center gap-2 border-t border-border pt-3 text-sm">
                  <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="font-semibold">From {formatShort(nextChange.from)}:</span>{" "}
                    <span className="text-muted-foreground">
                      {nextChange.diff > 0 ? "+" : "−"}
                      {Math.abs(nextChange.diff)} kcal, to {nextChange.kcal.toLocaleString()} a day on average
                    </span>
                  </span>
                </p>
              ) : null}
              <Button variant="ghost" size="sm" className="px-0" onClick={onOpenCalendar}>
                See every day in the calendar
                <ArrowRight />
              </Button>
            </CardContent>
          </Card>
        ) : null}
        <Card className="hidden lg:block">
          <CardContent className="space-y-3 p-5">
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
              This week · {formatShort(thisWeek)}–{formatShort(sunday)}
            </p>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(({ date, target }) => (
                <div
                  key={date}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border-2 bg-muted/30 py-1.5",
                    date === today ? "border-primary" : "border-transparent",
                  )}
                >
                  <span className="text-[11px] text-muted-foreground">{WEEKDAY[new Date(date + "T00:00:00").getDay()]}</span>
                  <span className="tabular text-sm font-semibold">{Number(date.slice(8))}</span>
                  <span
                    aria-hidden
                    className={cn(
                      "h-1 w-4 rounded-full",
                      !target ? "bg-transparent" : target.steady ? "bg-muted-foreground/40" : DAY_DOT[target.type],
                    )}
                  />
                </div>
              ))}
            </div>
            <p className="tabular text-[13px] text-muted-foreground">
              {aimBySunday !== null ? `Aim: ${w(aimBySunday)} by Sunday` : "Outside the cut"}
              {thisAvg !== null ? ` · averaging ${thisAvg.toLocaleString()} kcal a day` : ""}
            </p>
          </CardContent>
        </Card>
      </div>

        <Card className="lg:col-start-1 lg:row-start-2">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Planned vs actual</CardTitle>
              <SegmentedControl
                ariaLabel="Chart range"
                size="sm"
                value={range}
                onValueChange={setRange}
                options={[
                  { value: "recent" as const, label: "Recent" },
                  { value: "plan" as const, label: "Whole plan" },
                ]}
                className="w-auto"
              />
            </div>
          </CardHeader>
          <CardContent>
            <ProgressChart timeline={timeline} weighIns={weighIns} unit={unit} today={today} range={range} />
          </CardContent>
        </Card>

        <Card className="lg:col-start-1 lg:row-start-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Phases</CardTitle>
            <CardDescription>
              {after
                ? after.mode === "reverse"
                  ? `After the cut, calories step up ${after.step} kcal a week to maintenance (${after.maintenance.toLocaleString()}).`
                  : `After the cut, straight to maintenance (${after.maintenance.toLocaleString()} kcal).`
                : "Calories stay at the last week's target after the goal date. Change it under Settings → After your goal."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="relative flex h-9 gap-0.5">
              {phases.map((p, i) => (
                <div
                  key={p.label}
                  className={cn(
                    "flex min-w-0 items-center truncate px-2 text-xs font-semibold",
                    p.className,
                    i === 0 && "rounded-l-md",
                    i === phases.length - 1 && "rounded-r-md",
                  )}
                  style={{ flex: p.weeks }}
                >
                  {p.label}
                </div>
              ))}
              {daysIn >= 0 ? (
                <span aria-hidden className="absolute -bottom-1 -top-1 w-0.5 rounded bg-foreground" style={{ left: `${todayPct}%` }} />
              ) : null}
            </div>
            <div className="tabular flex justify-between text-[12px] text-muted-foreground">
              <span>{formatShort(start)}</span>
              <span>{formatShort(finish)}</span>
              {after ? <span>{formatShort(after.maintenanceDate)} →</span> : null}
            </div>
          </CardContent>
        </Card>
    </div>
  );
}
