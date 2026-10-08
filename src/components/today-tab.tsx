"use client";

import * as React from "react";
import {
  Award,
  BedDouble,
  Check,
  ChevronRight,
  CirclePause,
  Dumbbell,
  Footprints,
  ListChecks,
  Minus,
  Play,
  Plus,
  Scale,
  Sparkles,
  Timer,
  Utensils,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgeIcon, BadgesCard } from "@/components/badges-card";
import { stepFor } from "@/components/habits-card";
import { computeBadges, type Badge } from "@/lib/badges";
import { dayTargetFinder } from "@/lib/day-targets";
import { clock12, fastingStatus, sortedMeals, type FastingSettings } from "@/lib/fasting";
import { sumMacros, type FoodLog } from "@/lib/food";
import {
  DEFAULT_STEP_TARGET,
  MAX_DAILY_STEPS,
  REST_KEY,
  STEPS_KEY,
  counts,
  dayProgress,
  formatHabitValue,
  isDone,
  type HabitDef,
  type HabitEntries,
  type HabitLog,
} from "@/lib/habits";
import type { Measurement } from "@/lib/measurements";
import { PAUSE_REASON_LABELS, activePause, type PausePeriod } from "@/lib/pause";
import { formatShort } from "@/lib/dates";
import { trendSeries } from "@/lib/adaptive";
import type { CalorieAdjustment, WeighIn } from "@/lib/tracking";
import {
  activeWorkout,
  formatDuration,
  formatTarget,
  findExercise,
  nextProgramDay,
  summarizeWorkout,
  type Program,
  type ProgramDay,
  type TrainingSettings,
  type Workout,
} from "@/lib/training";
import type { BiometricProfile, CarbCyclingInputs, FatLossInputs, WeightUnit } from "@/lib/types";
import { fromLb, round, toLb } from "@/lib/units";
import { cn } from "@/lib/utils";

/** Where Today's links go. */
export type TodayDestination = "weigh-in" | "habits" | "food" | "fasting" | "training" | "timeline";

const SAVE_DEBOUNCE_MS = 400;
const SEEN_BADGES_KEY = "prep-calculator:badges-seen:v1";

interface TodayTabProps {
  today: string;
  unit: WeightUnit;
  profile: BiometricProfile;
  fatLoss: FatLossInputs;
  carbs: CarbCyclingInputs;
  adjustments: CalorieAdjustment[];
  habits: HabitDef[];
  habitLogs: HabitLog[];
  onSaveHabits: (log: HabitLog) => Promise<void>;
  weighIns: WeighIn[];
  onSaveWeighIn: (w: WeighIn) => Promise<void>;
  foodLogs: FoodLog[];
  workouts: Workout[];
  training: TrainingSettings;
  onStartWorkout: (program: Program, day: ProgramDay) => void;
  fasting: FastingSettings;
  measurements: Measurement[];
  /** Pause mode periods; a banner shows while one is on. */
  pauses: PausePeriod[];
  onResume: () => void;
  onOpen: (dest: TodayDestination) => void;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "2h 15m" / "45m". */
function untilText(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;
}

function OpenLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="-mr-2 h-7 shrink-0 px-2 text-xs text-muted-foreground" onClick={onClick}>
      {label}
      <ChevronRight />
    </Button>
  );
}

function Bar({ value, target, className }: { value: number; target: number; className?: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className={cn("h-full rounded-full", className ?? "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TodayTab(props: TodayTabProps) {
  const { today, unit, profile, fatLoss, habits, habitLogs, onSaveHabits, weighIns, foodLogs, workouts, onOpen } = props;

  /* --------------------------- today's habit log --------------------------- */
  // Kept locally while saving, so quick taps build on each other.
  const saved = React.useMemo(() => habitLogs.find((l) => l.date === today)?.entries ?? {}, [habitLogs, today]);
  const [entries, setEntries] = React.useState<HabitEntries>(saved);
  const dirty = React.useRef(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (!dirty.current) setEntries(saved);
  }, [saved]);
  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const updateEntries = (patch: Record<string, boolean | number | undefined>) => {
    const next = { ...entries };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === false || v === 0) delete next[k];
      else next[k] = v;
    }
    setEntries(next);
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onSaveHabits({ date: today, entries: next })
        .catch(() => {})
        .finally(() => {
          dirty.current = false;
        });
    }, SAVE_DEBOUNCE_MS);
  };

  const stepTarget = fatLoss.activitySource === "steps" ? fatLoss.dailySteps : DEFAULT_STEP_TARGET;
  const stepHabit = habits.find((h) => h.link === "steps");
  const steps = typeof entries[STEPS_KEY] === "number" ? (entries[STEPS_KEY] as number) : null;
  const logSteps = (n: number | undefined) =>
    updateEntries(
      n === undefined || !stepHabit ? { [STEPS_KEY]: n } : { [STEPS_KEY]: n, [stepHabit.id]: n >= stepTarget },
    );

  /* ------------------------------- the rest ------------------------------- */
  const weighIn = weighIns.find((w) => w.date === today) ?? null;
  const trendToday = React.useMemo(() => {
    const t = trendSeries(weighIns);
    return t[t.length - 1]?.trend ?? null;
  }, [weighIns]);
  const targetFor = React.useMemo(
    () => dayTargetFinder(profile, fatLoss, props.carbs, props.adjustments),
    [profile, fatLoss, props.carbs, props.adjustments],
  );
  const target = targetFor(today);
  const food = foodLogs.find((l) => l.date === today)?.entries ?? [];
  const eaten = sumMacros(food);
  const progress = dayProgress(habits, entries);
  const rest = entries[REST_KEY] === true;
  const live = activeWorkout(workouts);
  const doneToday = workouts.filter((w) => w.finishedAt !== null && w.date === today);

  const badges = React.useMemo(
    () =>
      computeBadges({
        today,
        unit,
        habits,
        habitLogs,
        weighIns,
        foodLogs,
        workouts,
        measurements: props.measurements,
        pauses: props.pauses,
      }),
    [today, unit, habits, habitLogs, weighIns, foodLogs, workouts, props.measurements, props.pauses],
  );
  const paused = activePause(props.pauses, today);
  const newBadges = useNewBadges(badges);

  const tasks = [
    { id: "weigh-in", label: "Weigh-in", done: weighIn !== null },
    { id: "habits", label: "Habits", done: progress.total > 0 && progress.done === progress.total },
    { id: "food", label: "Food", done: food.length > 0 },
    { id: "workout", label: rest ? "Rest day" : "Workout", done: rest || doneToday.length > 0 },
    ...(stepHabit ? [{ id: "steps", label: "Steps", done: steps !== null && steps >= stepTarget }] : []),
  ];
  const doneCount = tasks.filter((t) => t.done).length;
  const fresh = weighIns.length === 0 && habitLogs.length === 0 && foodLogs.length === 0 && workouts.length === 0;
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="space-y-5">
      {/* ------------------------------ summary ------------------------------ */}
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{dateLabel}</h2>
            <p className="tabular text-sm text-muted-foreground">
              <span className={cn("font-semibold", doneCount === tasks.length ? "text-success" : "text-foreground")}>
                {doneCount} of {tasks.length}
              </span>{" "}
              done today
            </p>
          </div>
          <Bar value={doneCount} target={tasks.length} className={doneCount === tasks.length ? "bg-success" : "bg-primary"} />
          <ul className="flex flex-wrap gap-1.5">
            {tasks.map((t) => (
              <li
                key={t.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs",
                  t.done ? "border-success/40 bg-success/10 text-success" : "border-border text-muted-foreground",
                )}
              >
                {t.done ? <Check className="h-3 w-3" /> : null}
                {t.label}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {paused ? (
        <Card className="border-primary/50 bg-primary/10">
          <CardContent className="flex flex-wrap items-center gap-3 p-4 sm:p-6">
            <CirclePause className="h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                Paused ({PAUSE_REASON_LABELS[paused.reason].toLowerCase()}) until {formatShort(paused.to)}
              </p>
              <p className="text-xs text-muted-foreground">
                Your streaks are frozen and reminders are off. Log anything you like; it still saves.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={props.onResume}>
              <Play />
              Resume now
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {fresh ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-3 p-4 sm:p-6">
            <Sparkles className="h-5 w-5 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 text-sm">
              Welcome! Set your goal on the Fat Loss Timeline first, then come back here each morning — everything you need
              to do today is on this page.
            </p>
            <Button size="sm" onClick={() => onOpen("timeline")}>
              Set my goal
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {newBadges.items.length > 0 ? (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="space-y-3 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Award className="h-4 w-4" />
                {newBadges.items.length === 1 ? "New badge!" : `${newBadges.items.length} new badges!`}
              </p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={newBadges.dismiss} aria-label="Dismiss">
                <X />
              </Button>
            </div>
            <ul className="flex flex-wrap gap-3">
              {newBadges.items.map((b) => (
                <li key={b.id} className="flex items-center gap-2">
                  <BadgeIcon badge={b} size="sm" />
                  <span className="text-sm font-medium">{b.title}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        {/* ------------------------------ weigh-in ------------------------------ */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="h-4 w-4 text-primary" />
              Weigh-in
            </CardTitle>
            <OpenLink label="History" onClick={() => onOpen("weigh-in")} />
          </CardHeader>
          <CardContent>
            {weighIn ? (
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success text-success-foreground">
                  <Check className="h-4 w-4" />
                </span>
                <div>
                  <p className="tabular text-lg font-semibold leading-tight">
                    {round(fromLb(weighIn.weightLb, unit), 1)} {unit}
                  </p>
                  {trendToday !== null ? (
                    <p className="tabular text-xs text-muted-foreground">
                      Trend {round(fromLb(trendToday, unit), 1)} {unit}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <QuickWeighIn
                unit={unit}
                placeholder={trendToday ?? profile.weight}
                onSave={(lb) => props.onSaveWeighIn({ date: today, weightLb: lb, calories: null, note: null })}
              />
            )}
          </CardContent>
        </Card>

        {/* ------------------------------ workout ------------------------------ */}
        <WorkoutToday
          live={live}
          doneToday={doneToday}
          rest={rest}
          training={props.training}
          workouts={workouts}
          onStart={props.onStartWorkout}
          onOpen={() => onOpen("training")}
        />

        {/* -------------------------------- food -------------------------------- */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Utensils className="h-4 w-4 text-primary" />
              Food
            </CardTitle>
            <OpenLink label={food.length > 0 ? "Food log" : "Log food"} onClick={() => onOpen("food")} />
          </CardHeader>
          <CardContent className="space-y-3">
            {target ? (
              <>
                <div className="space-y-1">
                  <div className="tabular flex justify-between text-xs">
                    <span className="font-medium">Calories</span>
                    <span className="text-muted-foreground">
                      {Math.round(eaten.kcal).toLocaleString()} / {target.calories.toLocaleString()}
                    </span>
                  </div>
                  <Bar value={eaten.kcal} target={target.calories} />
                </div>
                <div className="space-y-1">
                  <div className="tabular flex justify-between text-xs">
                    <span className="font-medium">Protein</span>
                    <span className="text-muted-foreground">
                      {Math.round(eaten.protein)} / {target.protein} g
                    </span>
                  </div>
                  <Bar value={eaten.protein} target={target.protein} className="bg-macro-protein" />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Set up your plan to see today&apos;s targets.</p>
            )}
            <p className="text-xs text-muted-foreground">
              {food.length === 0 ? "Nothing logged yet." : `${food.length} item${food.length === 1 ? "" : "s"} logged.`}
            </p>
          </CardContent>
        </Card>

        {/* ------------------------------- habits ------------------------------- */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-primary" />
              Habits
              <span className="tabular text-xs font-normal text-muted-foreground">
                {progress.done} / {progress.total}
              </span>
            </CardTitle>
            <OpenLink label="Checklist" onClick={() => onOpen("habits")} />
          </CardHeader>
          <CardContent>
            {habits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No habits set up yet.</p>
            ) : (
              <ul className="space-y-1">
                {habits.map((h) => {
                  if (!counts(h, entries)) {
                    return (
                      <li key={h.id} className="flex items-center gap-2 px-1 py-1 text-sm text-muted-foreground">
                        <BedDouble className="h-4 w-4" />
                        {h.name} · rest day
                      </li>
                    );
                  }
                  const done = isDone(h, entries[h.id]);
                  if (h.kind === "count") {
                    const current = typeof entries[h.id] === "number" ? (entries[h.id] as number) : 0;
                    const step = stepFor(h);
                    const set = (n: number) => updateEntries({ [h.id]: Math.max(Math.round(n * 100) / 100, 0) || undefined });
                    return (
                      <li key={h.id} className="flex items-center gap-2 px-1 py-0.5 text-sm">
                        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", done ? "border-success bg-success text-success-foreground" : "border-muted-foreground/50")}>
                          {done ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className={cn("min-w-0 flex-1 truncate", done && "text-muted-foreground")}>{h.name}</span>
                        <span className="tabular shrink-0 text-xs text-muted-foreground">
                          {formatHabitValue(current)} / {formatHabitValue(h.target ?? 1)} {h.unit ?? ""}
                        </span>
                        <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => set(current - step)} disabled={current <= 0} aria-label={`Decrease ${h.name}`}>
                          <Minus />
                        </Button>
                        <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => set(current + step)} aria-label={`Increase ${h.name}`}>
                          <Plus />
                        </Button>
                      </li>
                    );
                  }
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={done}
                        onClick={() => updateEntries({ [h.id]: !done })}
                        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", done ? "border-success bg-success text-success-foreground" : "border-muted-foreground/50")}>
                          {done ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className={cn("min-w-0 flex-1 truncate", done && "text-muted-foreground line-through")}>{h.name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* -------------------------------- steps -------------------------------- */}
        {stepHabit ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Footprints className="h-4 w-4 text-primary" />
                Steps
              </CardTitle>
              <OpenLink label="This week" onClick={() => onOpen("habits")} />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <div className="tabular flex justify-between text-xs">
                  <span className="font-medium">{steps === null ? "Not logged yet" : `${steps.toLocaleString()} steps`}</span>
                  <span className="text-muted-foreground">target {stepTarget.toLocaleString()}</span>
                </div>
                <Bar value={steps ?? 0} target={stepTarget} className={steps !== null && steps >= stepTarget ? "bg-success" : "bg-primary"} />
              </div>
              <QuickSteps value={steps} onChange={logSteps} />
            </CardContent>
          </Card>
        ) : null}

        {/* ------------------------------- fasting ------------------------------- */}
        <FastingToday fasting={props.fasting} onOpen={() => onOpen("fasting")} />

        {/* -------------------------------- badges -------------------------------- */}
        <BadgesCard badges={badges} />
      </div>
    </div>
  );
}

/* ================================ pieces ================================ */

function QuickWeighIn({ unit, placeholder, onSave }: { unit: WeightUnit; placeholder: number; onSave: (lb: number) => Promise<void> }) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(text.replace(",", "."));
    if (!text || !Number.isFinite(n) || n <= 0) return setError(`Enter your weight in ${unit}.`);
    setBusy(true);
    setError(null);
    try {
      await onSave(Math.round(toLb(n, unit) * 100) / 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={save} className="space-y-2" noValidate>
      <p className="text-xs text-muted-foreground">After the bathroom, before food or water.</p>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputMode="decimal"
            placeholder={String(round(fromLb(placeholder, unit), 1))}
            aria-label={`Today's weight in ${unit}`}
            className="pr-9"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
        </div>
        <Button type="submit" disabled={busy}>
          <Check />
          Save
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function QuickSteps({ value, onChange }: { value: number | null; onChange: (n: number | undefined) => void }) {
  const [text, setText] = React.useState(value === null ? "" : String(value));
  // Follow a value set elsewhere, without fighting what's being typed.
  React.useEffect(() => {
    const t = text.replace(/[,\s]/g, "");
    const typed = t === "" ? null : Number(t);
    if (typed !== value) setText(value === null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the stored value changes
  }, [value]);
  return (
    <Input
      value={text}
      inputMode="numeric"
      placeholder="Today's steps, from your phone"
      aria-label="Today's steps"
      onChange={(e) => {
        setText(e.target.value);
        const t = e.target.value.replace(/[,\s]/g, "");
        if (t === "") return onChange(undefined);
        const n = Number(t);
        if (Number.isInteger(n) && n >= 0 && n <= MAX_DAILY_STEPS) onChange(n);
      }}
    />
  );
}

function WorkoutToday({
  live,
  doneToday,
  rest,
  training,
  workouts,
  onStart,
  onOpen,
}: {
  live: Workout | null;
  doneToday: Workout[];
  rest: boolean;
  training: TrainingSettings;
  workouts: Workout[];
  onStart: (program: Program, day: ProgramDay) => void;
  onOpen: () => void;
}) {
  const program = training.programs.find((p) => p.id === training.activeProgramId) ?? training.programs[0] ?? null;
  const next = program ? nextProgramDay(program, workouts) : null;

  let body: React.ReactNode;
  if (live) {
    const total = live.exercises.reduce((n, e) => n + e.sets.length, 0);
    body = (
      <div className="space-y-3">
        <p className="text-sm">
          <span className="font-semibold">{live.name}</span> in progress ·{" "}
          <span className="tabular text-muted-foreground">
            {summarizeWorkout(live).sets} of {total} sets
          </span>
        </p>
        <Button className="w-full" onClick={onOpen}>
          <Play />
          Resume workout
        </Button>
      </div>
    );
  } else if (doneToday.length > 0) {
    body = (
      <ul className="space-y-2">
        {doneToday.map((w) => {
          const s = summarizeWorkout(w);
          return (
            <li key={w.id} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                <Check className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{w.name}</span>
                <span className="tabular block text-xs text-muted-foreground">
                  {s.sets} sets{s.durationMs ? ` · ${formatDuration(s.durationMs)}` : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    );
  } else if (rest) {
    body = (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <BedDouble className="h-4 w-4" />
        Rest day — recover well.
      </p>
    );
  } else if (program && next) {
    body = (
      <div className="space-y-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Next up · {program.name}</p>
          <p className="font-semibold">{next.name}</p>
        </div>
        {next.exercises.length > 0 ? (
          <ul className="space-y-0.5 text-xs">
            {next.exercises.slice(0, 4).map((pe, i) => (
              <li key={`${pe.exerciseId}-${i}`} className="flex justify-between gap-2">
                <span className="truncate">{findExercise(pe.exerciseId, training.customExercises)?.name ?? "Exercise"}</span>
                <span className="tabular shrink-0 text-muted-foreground">{formatTarget(pe)}</span>
              </li>
            ))}
            {next.exercises.length > 4 ? (
              <li className="text-muted-foreground">+{next.exercises.length - 4} more</li>
            ) : null}
          </ul>
        ) : null}
        <Button className="w-full" onClick={() => onStart(program, next)}>
          <Play />
          Start {next.name}
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Pick a program and your next workout shows up here.</p>
        <Button variant="outline" size="sm" onClick={onOpen}>
          Choose a program
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Dumbbell className="h-4 w-4 text-primary" />
          Workout
        </CardTitle>
        <OpenLink label="Training" onClick={onOpen} />
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

function FastingToday({ fasting, onOpen }: { fasting: FastingSettings; onOpen: () => void }) {
  const now = useNow(30_000);
  const meals = sortedMeals(fasting.meals);
  if (meals.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Timer className="h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">No fasting window set.</p>
          <OpenLink label="Set one up" onClick={onOpen} />
        </CardContent>
      </Card>
    );
  }
  const status = fastingStatus(meals, new Date(now));
  let title = "";
  let detail = "";
  if (status.phase === "fasting") {
    title = "Fasting";
    detail = `${status.next.meal.label} at ${clock12(status.next.meal.time)} · in ${untilText(status.next.at.getTime() - now)}`;
  } else if (status.phase === "eating") {
    title = "Eating window open";
    detail = `Next: ${status.next.meal.label} at ${clock12(status.next.meal.time)} · closes ${clock12(status.windowEnds.meal.time)}`;
  } else if (status.phase === "meal-now") {
    title = `Time for ${status.current.meal.label}`;
    detail = `Then ${status.next.meal.label} at ${clock12(status.next.meal.time)}`;
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Timer className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
        <OpenLink label="Timer" onClick={onOpen} />
      </CardHeader>
      <CardContent>
        <CardDescription className="tabular">{detail}</CardDescription>
      </CardContent>
    </Card>
  );
}

/**
 * Badges earned since this device last showed them. The first time, everything
 * already earned counts as seen, so existing members don't get a flood.
 */
function useNewBadges(badges: readonly Badge[]): { items: Badge[]; dismiss: () => void } {
  const [seen, setSeen] = React.useState<Set<string> | null>(null);
  const earnedIds = badges.filter((b) => b.earned).map((b) => b.id);
  const earnedKey = earnedIds.join(",");

  React.useEffect(() => {
    let stored: string[] | null = null;
    try {
      const raw = window.localStorage.getItem(SEEN_BADGES_KEY);
      stored = raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      stored = null;
    }
    if (!stored) {
      stored = earnedIds;
      try {
        window.localStorage.setItem(SEEN_BADGES_KEY, JSON.stringify(stored));
      } catch {
        /* storage blocked: celebrate nothing rather than everything */
      }
    }
    setSeen(new Set(stored));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per visit
  }, []);

  const items = seen ? badges.filter((b) => b.earned && !seen.has(b.id)) : [];
  const dismiss = React.useCallback(() => {
    const all = new Set([...(seen ?? []), ...earnedKey.split(",").filter(Boolean)]);
    setSeen(all);
    try {
      window.localStorage.setItem(SEEN_BADGES_KEY, JSON.stringify([...all]));
    } catch {
      /* fine: it shows again next visit */
    }
  }, [seen, earnedKey]);
  return { items, dismiss };
}
