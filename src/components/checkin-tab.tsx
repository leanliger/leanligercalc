"use client";

import * as React from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Pencil,
  Scale,
  Trash2,
  TrendingDown,
  Undo2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented";
import { Stat } from "@/components/stat";
import { ProgressChart } from "@/components/progress-chart";
import { WeeklyIntakeChart } from "@/components/weekly-intake-chart";
import { PlateauCard } from "@/components/plateau-card";
import { HabitInsightsCard } from "@/components/habit-insights-card";
import { MeasureReminder } from "@/components/measure-reminder";
import { dayTotals } from "@/lib/weekly-intake";
import { HabitsCard, WeeklyScorecard } from "@/components/habits-card";
import { ConfirmButton } from "@/components/confirm-button";
import { HabitConsistencyList } from "@/components/consistency-card";
import { CONSISTENCY_WINDOW_DAYS, dailyStreak, greenWeekStreak } from "@/lib/streaks";
import { StepsWeekCard } from "@/components/steps-week-card";
import { StepSyncCard } from "@/components/step-sync-card";
import { MeasurementsCard } from "@/components/measurements-card";
import { CheckinCard } from "@/components/checkin-card";
import { withPauses } from "@/lib/pause";
import { ProgressReportLoader } from "@/components/progress-report";
import { PhotosCard } from "@/components/photos-card";
import { PhysiqueCard } from "@/components/physique-card";
import { PhysiqueCompareCard } from "@/components/physique-compare-card";
import type { Measurement } from "@/lib/measurements";
import { buildRoadmap } from "@/lib/roadmap";
import type { CoachMacros } from "@/lib/coach-macros";
import type { RoadmapDay } from "@/lib/types";
import { DEFAULT_STEP_TARGET, weekStartOf, type HabitDef, type HabitLog } from "@/lib/habits";
import type { WeeklyReview } from "@/lib/reviews";
import type { PausePeriod } from "@/lib/pause";
import { sumMacros, type FoodLog, type Macros } from "@/lib/food";
import { addDays } from "@/lib/dates";
import {
  analyzeProgress,
  predictedWeightOn,
  reviewSchedule,
  trendSeries,
  MIN_SPAN_DAYS,
  MIN_WEIGH_INS,
  type ProgressAnalysis,
  type Recommendation,
} from "@/lib/adaptive";
import type { SessionInfo } from "@/lib/checkin-store";
import { ReviewTiming, useKeptRecommendation } from "@/components/review-timing";
import { formatLong, formatShort } from "@/lib/dates";
import { calculateFatLossTimeline } from "@/lib/fat-loss";
import { formatWeight } from "@/lib/format";
import type { CalorieAdjustment, WeighIn } from "@/lib/tracking";
import { CALORIE_LIMITS, NOTE_MAX_LENGTH } from "@/lib/tracking";
import type { BiometricProfile, CarbCyclingInputs, FatLossInputs, WeightUnit } from "@/lib/types";
import { fromLb, round, toLb } from "@/lib/units";
import { cn } from "@/lib/utils";

interface CheckinTabProps {
  /** Macros the coach set: the calorie and protein habits aim at these while set. */
  coachMacros: CoachMacros | null;
  profile: BiometricProfile;
  fatLoss: FatLossInputs;
  unit: WeightUnit;
  today: string;
  session: SessionInfo;
  weighIns: WeighIn[];
  adjustments: CalorieAdjustment[];
  carbs: CarbCyclingInputs;
  habits: HabitDef[];
  habitLogs: HabitLog[];
  /** Pause mode periods: those days don't count for or against streaks. */
  pauses: PausePeriod[];
  onSaveHabits: (log: HabitLog) => Promise<void>;
  reviews: WeeklyReview[];
  onSaveReview: (review: WeeklyReview) => Promise<void>;
  onHabitsChange: (habits: HabitDef[]) => void;
  onSave: (weighIn: WeighIn) => Promise<void>;
  onDelete: (date: string) => Promise<void>;
  onApplyAdjustment: (rec: Recommendation, analysis: ProgressAnalysis) => void;
  onRemoveAdjustment: (id: string) => void;
  /** Food logs, so the protein and calorie habits can show what's been eaten. */
  foodLogs: FoodLog[];
  /** Load older food logs back to a date (for the weekly calories chart). */
  onEnsureFoodLoaded?: (date: string) => void;
  measurements: Measurement[];
  onSaveMeasurement: (m: Measurement) => Promise<void>;
  onDeleteMeasurement: (date: string) => Promise<void>;
  onNavigate: (tab: "timeline" | "roadmap") => void;
  section: CheckinSection;
  onSectionChange: (section: CheckinSection) => void;
}

/* -------------------------------------------------------------------------- */

type BadgeVariant = "default" | "secondary" | "success" | "warning";

const STATUS_STYLE: Record<ProgressAnalysis["status"], { badge: BadgeVariant; label: string }> = {
  "no-plan": { badge: "secondary", label: "No plan" },
  "no-data": { badge: "secondary", label: "Start weighing in" },
  "not-started": { badge: "secondary", label: "Not started" },
  collecting: { badge: "secondary", label: "Collecting data" },
  waiting: { badge: "default", label: "Settling" },
  "on-track": { badge: "success", label: "On track" },
  behind: { badge: "warning", label: "Behind plan" },
  ahead: { badge: "warning", label: "Ahead of plan" },
};

/** The Progress tab's sub-sections (its id is still "checkin", so old links work). */
export type CheckinSection = "weigh-in" | "habits" | "measurements" | "photos" | "scorecard";

/** The daily sections, plus Check-in, which holds the weekly and monthly ones. */
const SECTIONS: { value: CheckinSection; label: string }[] = [
  { value: "weigh-in", label: "Weigh-in" },
  { value: "habits", label: "Habits" },
  { value: "scorecard", label: "Check-in" },
];

/** Under Check-in: the weekly check-in, progress photos and tape measurements. */
const CHECKIN_PARTS: { value: CheckinSection; label: string }[] = [
  { value: "scorecard", label: "Check-in" },
  { value: "photos", label: "Photos" },
  { value: "measurements", label: "Measurements" },
];
const inCheckin = (s: CheckinSection) => s === "scorecard" || s === "photos" || s === "measurements";

/* -------------------------------------------------------------------------- */

export function CheckinTab({
  coachMacros,
  profile,
  fatLoss,
  unit,
  today,
  session,
  weighIns,
  adjustments,
  carbs,
  habits,
  habitLogs,
  pauses,
  onSaveHabits,
  onHabitsChange,
  reviews,
  onSaveReview,
  onSave,
  onDelete,
  onApplyAdjustment,
  onRemoveAdjustment,
  foodLogs,
  onEnsureFoodLoaded,
  measurements,
  onSaveMeasurement,
  onDeleteMeasurement,
  onNavigate,
  section,
  onSectionChange,
}: CheckinTabProps) {
  const timeline = React.useMemo(() => calculateFatLossTimeline(profile, fatLoss), [profile, fatLoss]);
  const analysis = React.useMemo(
    () => analyzeProgress(profile, timeline, weighIns, adjustments, today),
    [profile, timeline, weighIns, adjustments, today],
  );
  const schedule = React.useMemo(() => reviewSchedule(analysis, timeline, adjustments, today), [analysis, timeline, adjustments, today]);
  // Roadmap numbers by date, so each habit day can show what to eat.
  const roadmapDays = React.useMemo(() => {
    const r = buildRoadmap(profile, carbs, timeline, adjustments);
    return new Map(r.days.map((d) => [d.date, d]));
  }, [profile, carbs, timeline, adjustments]);
  const dayPlanFor = React.useCallback(
    (d: string): RoadmapDay | null => {
      const day = roadmapDays.get(d) ?? null;
      if (!coachMacros) return day;
      const m = { calories: coachMacros.kcal, protein: coachMacros.protein, carbs: coachMacros.carbs, fat: coachMacros.fat };
      return day
        ? { ...day, ...m, type: "medium", steady: true }
        : { date: d, index: 0, week: 0, weekday: 0, type: "medium", ...m, isGoalDay: false, steady: true };
    },
    [roadmapDays, coachMacros],
  );
  const eatenFor = React.useCallback(
    (d: string): Macros | null => {
      const log = foodLogs.find((l) => l.date === d);
      return log && log.entries.length > 0 ? sumMacros(log.entries) : null;
    },
    [foodLogs],
  );

  // Average plan targets across a Mon–Sun week, for the scorecard header.
  const weekTargets = React.useCallback(
    (weekStart: string) => {
      if (coachMacros) return { calories: coachMacros.kcal, protein: coachMacros.protein };
      const days = Array.from({ length: 7 }, (_, i) => roadmapDays.get(addDays(weekStart, i)))
        .filter((d): d is NonNullable<typeof d> => !!d && !d.isGoalDay);
      if (days.length === 0) return null;
      return {
        calories: Math.round(days.reduce((s, d) => s + d.calories, 0) / days.length),
        protein: Math.round(days.reduce((s, d) => s + d.protein, 0) / days.length),
      };
    },
    [roadmapDays, coachMacros],
  );

  const trendByDate = React.useMemo(
    () => new Map(trendSeries(weighIns).map((t) => [t.date, t.trend])),
    [weighIns],
  );

  /* ------------------------------ entry form ------------------------------ */

  const [date, setDate] = React.useState(today);
  const [weight, setWeight] = React.useState("");
  const [calories, setCalories] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // Plan vs actual: the last few weeks, or the whole plan from start to goal.
  const [chartRange, setChartRange] = React.useState<"recent" | "plan">("recent");
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const existing = weighIns.find((w) => w.date === date) ?? null;
  // Date, calories and note sit behind a toggle; they show by themselves for a past day.
  const [more, setMore] = React.useState(false);
  const showMore = more || date !== today;
  // "Keep" on the weekly review hides that recommendation (until the next one), here and on the Plan tab.
  const [keptRec, setKeptRec] = useKeptRecommendation();
  const [historyOpen, setHistoryOpen] = React.useState(false);

  // Picking a day that already has an entry loads it for editing.
  React.useEffect(() => {
    if (existing) {
      setWeight(String(round(fromLb(existing.weightLb, unit), 1)));
      setCalories(existing.calories === null ? "" : String(existing.calories));
      setNote(existing.note ?? "");
    } else {
      setWeight("");
      setCalories("");
      setNote("");
    }
    // Keyed on the saved values, not the object, so typing doesn't reset it.
  }, [date, unit, existing?.weightLb, existing?.calories, existing?.note]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const w = Number(weight);
    if (!weight || !Number.isFinite(w) || w <= 0) {
      setMessage({ kind: "error", text: `Enter your weight in ${unit}.` });
      return;
    }
    const kcal = calories.trim() === "" ? null : Number(calories);
    if (kcal !== null && (!Number.isInteger(kcal) || kcal < CALORIE_LIMITS.min || kcal > CALORIE_LIMITS.max)) {
      setMessage({ kind: "error", text: "Calories must be a whole number." });
      return;
    }
    setBusy(true);
    try {
      await onSave({
        date,
        weightLb: round(toLb(w, unit), 2),
        calories: kcal,
        note: note.trim() || null,
      });
      setMessage({ kind: "ok", text: `${existing ? "Updated" : "Saved"} ${formatShort(date)}.` });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Couldn't save." });
    } finally {
      setBusy(false);
    }
  };

  /* -------------------------------- render -------------------------------- */

  const nav = (
    <SegmentedControl
      ariaLabel="Progress section"
      size="sm"
      value={inCheckin(section) ? "scorecard" : section}
      onValueChange={onSectionChange}
      options={SECTIONS}
      className="w-full lg:max-w-xl"
    />
  );

  // Day and Green-week streaks, for the checklist header and the scorecard.
  const streaks = React.useMemo(() => {
    const logMap = withPauses(new Map(habitLogs.map((l) => [l.date, l.entries])), pauses, today);
    const first = habitLogs[0]?.date ?? null;
    const d = dailyStreak(habits, logMap, today, first);
    const w = greenWeekStreak(habits, logMap, today, first);
    return { day: { current: d.current, best: d.best }, weeks: { current: w.current, best: w.best } };
  }, [habits, habitLogs, pauses, today]);

  const foodDayTotals = React.useMemo(() => dayTotals(foodLogs), [foodLogs]);
  // For the Weight vs calories graph: each week's calorie target and the plan's weight.
  const weekTargetKcal = React.useCallback((weekStart: string) => weekTargets(weekStart)?.calories ?? null, [weekTargets]);
  // What this week was meant to look like, for the check-in draft.
  const checkinPlan = React.useMemo(() => {
    const goal = fatLoss.goalType === "weight" ? fatLoss.targetWeight : null;
    const direction: "lose" | "gain" | "maintain" =
      goal === null ? "lose" : goal < profile.weight - 0.5 ? "lose" : goal > profile.weight + 0.5 ? "gain" : "maintain";
    const t = today ? weekTargets(weekStartOf(today)) : null;
    return {
      direction,
      kcal: t?.calories ?? null,
      protein: t?.protein ?? null,
      steps: fatLoss.activitySource === "steps" ? fatLoss.dailySteps : null,
      trainingDays: fatLoss.activitySource === "steps" ? fatLoss.trainingDays : null,
    };
  }, [fatLoss, profile.weight, today, weekTargets]);
  const planWeightFor = React.useCallback(
    (date: string) => (timeline.feasible && date >= timeline.requiredStartDate ? predictedWeightOn(timeline, date) : null),
    [timeline],
  );

  // The steps the plan assumes; the step habit ticks itself at this count.
  const stepTarget = fatLoss.activitySource === "steps" ? fatLoss.dailySteps : DEFAULT_STEP_TARGET;

  if (section === "habits") {
    return (
      <div className="space-y-5">
        {nav}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
          <div className="space-y-5">
          <WeeklyScorecard habits={habits} logs={habitLogs} pauses={pauses} today={today} weekTargets={weekTargets} streaks={streaks}>
              {habits.length > 0 && habitLogs.length > 0 ? (
                <details className="group border-t border-border pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                    See each habit · last {CONSISTENCY_WINDOW_DAYS} days
                  </summary>
                  <div className="pt-3">
                    <HabitConsistencyList habits={habits} logs={habitLogs} today={today} pauses={pauses} />
                  </div>
                </details>
              ) : null}
          </WeeklyScorecard>
          <HabitInsightsCard
            weighIns={weighIns}
            habits={habits}
            habitLogs={habitLogs}
            foodLogs={foodLogs}
            today={today}
            stepTarget={stepTarget}
            unit={unit}
          />
          </div>
          <div className="space-y-5">
            <HabitsCard
              mode="fix"
              habits={habits}
              eatenFor={eatenFor}
              logs={habitLogs}
              today={today}
              dayPlanFor={dayPlanFor}
              onSave={onSaveHabits}
              onHabitsChange={onHabitsChange}
              stepTarget={stepTarget}
              pauses={pauses}
            />
            {habits.some((h) => h.link === "steps") ? (
              <StepsWeekCard
                logs={habitLogs}
                today={today}
                target={stepTarget}
                planUsesSteps={fatLoss.activitySource === "steps"}
                weightLb={weighIns[weighIns.length - 1]?.weightLb ?? profile.weight}
              />
            ) : null}
            <div id="step-sync" className="scroll-mt-20">
              <StepSyncCard cloud={session.mode === "cloud"} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (inCheckin(section)) {
    return (
      <div className="space-y-5">
        {nav}
        <SegmentedControl
          ariaLabel="Check-in section"
          size="sm"
          value={section}
          onValueChange={onSectionChange}
          options={CHECKIN_PARTS}
          className="w-full sm:max-w-md"
        />
        <div className="lg:max-w-4xl">
          {section === "measurements" ? (
            <div className="space-y-3">
              <MeasurementsCard
                measurements={measurements}
                weighIns={weighIns}
                unit={unit}
                today={today}
                onSave={onSaveMeasurement}
                onDelete={onDeleteMeasurement}
              />
              {session.mode === "cloud" && session.notifications === true ? <MeasureReminder /> : null}
            </div>
          ) : section === "photos" ? (
            <div className="space-y-5">
              <PhotosCard cloud={session.mode === "cloud"} today={today} />
              <PhysiqueCard enabled={session.mode === "cloud" && session.physique === true} />
              <PhysiqueCompareCard enabled={session.mode === "cloud" && session.physique === true} unit={unit} />
            </div>
          ) : (
            <div className="space-y-5">
            <CheckinCard cloud={session.mode === "cloud"} today={today} unit={unit} plan={checkinPlan} />
            {session.mode === "cloud" ? <MyReport unit={unit} /> : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!timeline.feasible) {
    return (
      <div className="space-y-5">
        {nav}
        <Card className="lg:max-w-4xl">
          <CardHeader>
            <CardTitle>Weigh-in</CardTitle>
            <CardDescription>
              Check-ins compare your weigh-ins against your plan. Set a goal below your current weight first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => onNavigate("timeline")}>Set a goal</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = STATUS_STYLE[analysis.status];
  const history = [...weighIns].reverse();

  return (
    <div className="space-y-5">
      {nav}
      <form onSubmit={submit} noValidate className="space-y-3 molten-card rounded-[1.25rem] border border-primary/15 bg-card p-3 lg:max-w-xl">
        <div className="flex items-center gap-2">
          <Label htmlFor="wi-weight" className="shrink-0 text-sm font-semibold">
            {date === today ? "Today" : formatShort(date)}
          </Label>
          <div className="relative min-w-0 flex-1">
            <Input
              id="wi-weight"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={fromLb(50, unit).toFixed(0)}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-10 pr-9 text-base"
              placeholder={round(fromLb(analysis.trendWeight ?? profile.weight, unit), 1).toString()}
              required
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
          </div>
          <Button type="submit" className="h-10 font-semibold" disabled={busy}>
            {existing ? "Update" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-expanded={showMore}
            aria-label="Date, calories and note"
            onClick={() => setMore((v) => !v)}
          >
            <ChevronDown className={cn("transition-transform", showMore && "rotate-180")} />
          </Button>
        </div>
        {showMore ? (
          <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wi-date">Date</Label>
              <Input id="wi-date" type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wi-cal">
                Calories eaten <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <div className="relative">
                <Input
                  id="wi-cal"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min={0}
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  className="pr-12"
                  placeholder="e.g. 2150"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">kcal</span>
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="wi-note">
                Note <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="wi-note" value={note} maxLength={NOTE_MAX_LENGTH} onChange={(e) => setNote(e.target.value)} placeholder="High-sodium dinner, poor sleep…" />
            </div>
            <p className="text-[12px] text-muted-foreground sm:col-span-2">
              Same time each morning: after the bathroom, before food or water. Yesterday&apos;s calories make the maintenance estimate far more
              accurate.
            </p>
          </div>
        ) : null}
        {message || existing ? (
          <p role="status" aria-live="polite" className={cn("text-xs", message?.kind === "error" ? "text-destructive" : message ? "text-success" : "text-muted-foreground")}>
            {message?.text ?? "This replaces the entry already logged for that day."}
          </p>
        ) : null}
      </form>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="space-y-5">
          <PlateauCard
            weighIns={weighIns}
            timeline={timeline.feasible ? timeline : null}
            today={today}
            unit={unit}
            weightLb={weighIns[weighIns.length - 1]?.weightLb ?? profile.weight}
          />
          {analysis.status === "no-data" ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Scale className="h-7 w-7" />
                </span>
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold">No weigh-ins yet</h3>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Log a few mornings and your trend line shows up here, smoothed so one salty dinner doesn&apos;t throw it.
                    After {MIN_WEIGH_INS} weigh-ins over {MIN_SPAN_DAYS}+ days you&apos;ll see how you&apos;re tracking
                    against the plan.
                  </p>
                </div>
                <ol className="flex gap-1.5" aria-label={`0 of ${MIN_WEIGH_INS} weigh-ins`}>
                  {Array.from({ length: MIN_WEIGH_INS }, (_, i) => (
                    <li key={i} className="h-2.5 w-6 rounded-full bg-muted" />
                  ))}
                </ol>
                <Button
                  variant="outline"
                  onClick={() => {
                    const input = document.getElementById("wi-weight");
                    input?.scrollIntoView({ behavior: "smooth", block: "center" });
                    input?.focus({ preventScroll: true });
                  }}
                >
                  <Scale />
                  Log today&apos;s weight
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">Plan vs actual</CardTitle>
                  <SegmentedControl
                    ariaLabel="Chart range"
                    size="sm"
                    value={chartRange}
                    onValueChange={setChartRange}
                    options={[
                      { value: "recent" as const, label: "Recent" },
                      { value: "plan" as const, label: "Whole plan" },
                    ]}
                    className="w-auto"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <ProgressChart timeline={timeline} weighIns={weighIns} unit={unit} today={today} range={chartRange} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4 sm:p-6">
              <WeeklyIntakeChart
                days={foodDayTotals}
                weighIns={weighIns}
                unit={unit}
                today={today}
                onNeedFrom={onEnsureFoodLoaded}
                weekTarget={weekTargetKcal}
                planWeightFor={planWeightFor}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-4">
          {analysis.status !== "no-data" ? (
            <Card>
              <CardHeader className="space-y-2 pb-3">
                <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Weekly review</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={status.badge}>{status.label}</Badge>
                  {analysis.stale ? (
                    <Badge variant="warning">
                      <CalendarClock />
                      Last weigh-in over a week ago
                    </Badge>
                  ) : null}
                </div>
                <CardTitle className="text-base">{analysis.headline}</CardTitle>
                <CardDescription className="leading-relaxed">{analysis.detail}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
              <ReviewTiming schedule={schedule} today={today} />
              {analysis.latest ? (
                <div className="grid grid-cols-2 gap-3">
                  <Stat
                    label="Trend weight"
                    emphasis
                    icon={<TrendingDown className="h-3.5 w-3.5" />}
                    value={formatWeight(analysis.trendWeight ?? 0, unit)}
                    sub={
                      analysis.difference === null
                        ? "smoothed"
                        : `${analysis.difference > 0 ? "+" : ""}${round(fromLb(analysis.difference, unit), 1)} ${unit} vs plan`
                    }
                  />
                  <Stat
                    label="Loss rate"
                    value={analysis.observedRate === null ? "—" : `${round(fromLb(analysis.observedRate, unit), 2)} ${unit}/wk`}
                    sub={
                      analysis.plannedRate === null
                        ? "needs more weigh-ins"
                        : `plan: ${round(fromLb(analysis.plannedRate, unit), 2)} ${unit}/wk`
                    }
                  />
                  <Stat
                    label="Real maintenance"
                    value={analysis.estimatedMaintenance === null ? "—" : `${analysis.estimatedMaintenance.toLocaleString()} kcal`}
                    sub={
                      analysis.modelMaintenance === null
                        ? "needs more weigh-ins"
                        : `model: ${analysis.modelMaintenance.toLocaleString()} kcal`
                    }
                  />
                  <Stat
                    label="Goal at this rate"
                    value={analysis.projectedGoalDate ? formatShort(analysis.projectedGoalDate) : "—"}
                    sub={`plan: ${formatShort(timeline.finishDate)}`}
                  />
                </div>
              ) : null}

                {analysis.recommendation && keptRec !== analysis.recommendation.effectiveFrom ? (
                  <RecommendationBox
                    rec={analysis.recommendation}
                    onApply={() => onApplyAdjustment(analysis.recommendation!, analysis)}
                    onKeep={() => setKeptRec(analysis.recommendation!.effectiveFrom)}
                  />
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {adjustments.length > 0 ? (
            <Fold
              title="Calorie changes applied"
              summary={`${adjustments.length} · ${adjustments
                .slice(-3)
                .map((a) => `${a.kcal > 0 ? "+" : "−"}${Math.abs(a.kcal)} ${formatShort(a.effectiveFrom)}`)
                .join(", ")}`}
            >
              <p className="text-xs text-muted-foreground">
                Each one shifts the roadmap from the week it starts. Your plan&apos;s predicted weights stay the same: that&apos;s the line you&apos;re
                steering back to.
              </p>
                <ul className="divide-y divide-border">
                  {adjustments.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                      <span className={cn("tabular font-semibold", a.kcal < 0 ? "text-foreground" : "text-success")}>
                        {a.kcal > 0 ? "+" : ""}
                        {a.kcal} kcal/day
                      </span>
                      <span className="text-xs text-muted-foreground">
                        from {formatLong(a.effectiveFrom)} · applied {formatShort(a.appliedOn)}
                      </span>
                      <ConfirmButton
                        className="ml-auto h-7 px-2 text-xs"
                        label="Undo"
                        icon={<Undo2 />}
                        confirmLabel="Remove change"
                        onConfirm={() => onRemoveAdjustment(a.id)}
                      />
                    </li>
                  ))}
                </ul>
            </Fold>
          ) : null}

          <Fold
            title="Weigh-in history"
            summary={weighIns.length === 0 ? "Nothing logged yet" : `${weighIns.length} weigh-in${weighIns.length === 1 ? "" : "s"}`}
            open={historyOpen}
            onOpenChange={setHistoryOpen}
          >
            {weighIns.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">Trend is the smoothed weight: judge progress by that, not single days.</p>
                <div className="relative scrollbar-thin max-h-[28rem] overflow-auto rounded-lg border border-border">
                  <table className="w-full min-w-[36rem] border-collapse text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                        <th scope="col" className="px-3 py-2 text-left font-medium">Date</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Weight</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Trend</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Plan</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">kcal</th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">Note</th>
                        <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((w) => {
                        const plan = predictedWeightOn(timeline, w.date);
                        const trend = trendByDate.get(w.date);
                        return (
                          <tr key={w.date} className="border-b border-border/60 last:border-0">
                            <th scope="row" className="whitespace-nowrap px-3 py-2 text-left font-medium">
                              {formatShort(w.date)}
                            </th>
                            <td className="tabular px-3 py-2 text-right">{formatWeight(w.weightLb, unit, 1, false)}</td>
                            <td className="tabular px-3 py-2 text-right font-medium">
                              {trend === undefined ? "—" : formatWeight(trend, unit, 1, false)}
                            </td>
                            <td className="tabular px-3 py-2 text-right text-muted-foreground">
                              {plan === null || w.date < timeline.requiredStartDate ? "—" : formatWeight(plan, unit, 1, false)}
                            </td>
                            <td className="tabular px-3 py-2 text-right text-muted-foreground">
                              {w.calories === null ? "—" : w.calories.toLocaleString()}
                            </td>
                            <td className="max-w-[12rem] truncate px-3 py-2 text-xs text-muted-foreground" title={w.note ?? undefined}>
                              {w.note ?? ""}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1 text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={`Edit ${formatShort(w.date)}`}
                                onClick={() => {
                                  setDate(w.date);
                                  document.getElementById("wi-weight")?.scrollIntoView({ behavior: "smooth", block: "center" });
                                }}
                              >
                                <Pencil />
                              </Button>
                              <ConfirmButton
                                size="icon"
                                className="h-7 w-7"
                                label={<span className="sr-only">Delete {formatShort(w.date)}</span>}
                                icon={<Trash2 />}
                                confirmLabel="Delete"
                                onConfirm={() => onDelete(w.date)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
            )}
          </Fold>
        </div>
      </div>
    </div>
  );
}

/** A row that opens to show more (calorie changes, the weigh-in history). */
function Fold({
  title,
  summary,
  open: controlled,
  onOpenChange,
  children,
}: {
  title: string;
  summary: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [own, setOwn] = React.useState(false);
  const open = controlled ?? own;
  const setOpen = onOpenChange ?? setOwn;
  const id = React.useId();
  return (
    <div className="molten-card rounded-[1.25rem] border border-primary/15 bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-4 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>{title}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-normal text-muted-foreground">
          <span className="truncate">{summary}</span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open ? (
        <div id={id} className="space-y-3 border-t border-border p-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function RecommendationBox({ rec, onApply, onKeep }: { rec: Recommendation; onApply: () => void; onKeep: () => void }) {
  const food = rec.kcal !== 0;
  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold">Recommended change</span>
        <span className="text-xs text-muted-foreground">from {formatLong(rec.effectiveFrom)}</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        {food ? (
          <span className="tabular text-2xl font-semibold text-primary">
            {rec.kcal > 0 ? "+" : ""}
            {rec.kcal} <span className="text-sm font-normal text-muted-foreground">kcal/day</span>
          </span>
        ) : null}
        {rec.activityKcal > 0 ? (
          <span className="tabular text-2xl font-semibold text-primary">
            +{rec.activityKcal} <span className="text-sm font-normal text-muted-foreground">kcal/day activity</span>
          </span>
        ) : null}
        <span className="tabular text-sm text-muted-foreground">
          new average: {rec.newIntake.toLocaleString()} kcal/day
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{rec.reason}</p>
      {food ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onApply}>
            <Check />
            Apply {rec.kcal > 0 ? "+" : "−"}
            {Math.abs(rec.kcal)} kcal
          </Button>
          <Button size="sm" variant="outline" onClick={onKeep}>
            Keep {(rec.newIntake - rec.kcal).toLocaleString()}
          </Button>
        </div>
      ) : (
        <p className="text-xs">
          Food is already at its floor, so this one is activity only — there&apos;s nothing to apply to the roadmap.
        </p>
      )}
    </div>
  );
}

/** Progress → Check-in: the member's own progress report, on request. */
function MyReport({ unit }: { unit: WeightUnit }) {
  const [open, setOpen] = React.useState(false);
  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        My progress report
      </Button>
    );
  }
  return (
    <ProgressReportLoader
      url="/api/report"
      name="Your progress"
      unit={unit}
      photoSrc={(p) => `/api/photos/${p.id}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Close report
          </Button>
          <p className="text-[12px] text-muted-foreground">Take a screenshot to share it.</p>
        </div>
      }
    />
  );
}
