"use client";

import * as React from "react";
import {
  Award,
  BedDouble,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePause,
  Dumbbell,
  Footprints,
  ListChecks,
  Minus,
  Play,
  Plus,
  Scale,
  Timer,
  Utensils,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgeIcon } from "@/components/badges-card";
import { Hint } from "@/components/ui/hint";
import { stepFor } from "@/components/habits-card";
import { ExerciseThumb } from "@/components/exercise-art";
import { computeBadges, type Badge } from "@/lib/badges";
import { dayTargetFinder } from "@/lib/day-targets";
import type { CoachMacros } from "@/lib/coach-macros";
import { clock12, fastingStatus, sortedMeals, type FastingSettings } from "@/lib/fasting";
import { sumMacros, type FoodLog } from "@/lib/food";
import {
  DEFAULT_STEP_TARGET,
  MAX_DAILY_STEPS,
  MAX_REST_DAYS_PER_WEEK,
  REST_KEY,
  STEPS_KEY,
  counts,
  dayProgress,
  formatHabitValue,
  isDone,
  isRestDay,
  restDaysInWeek,
  weekStartOf,
  type HabitDef,
  type HabitEntries,
  type HabitLog,
} from "@/lib/habits";
import type { Measurement } from "@/lib/measurements";
import { PAUSE_REASON_LABELS, activePause, type PausePeriod } from "@/lib/pause";
import { planToday } from "@/lib/program-schedule";
import type { MySharing } from "@/lib/sharing";
import { CoachRequestCard } from "@/components/coach-access";
import { AssignmentCards } from "@/components/assignment-cards";
import type { MemberAssignment } from "@/lib/assignments";
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
import { FirstWeekCard } from "@/components/first-week-card";
import { DEFAULT_FAT_LOSS_INPUTS, DEFAULT_PROFILE } from "@/lib/defaults";

/** Where Today's links go. */
export type TodayDestination = "weigh-in" | "habits" | "food" | "fasting" | "training" | "timeline" | "reminders";

const SAVE_DEBOUNCE_MS = 400;
const SEEN_BADGES_KEY = "prep-calculator:badges-seen:v1";

interface TodayTabProps {
  /** Any reminder switched on (Settings), for the first-week checklist. */
  remindersOn: boolean;
  /** Macros the coach set: today's targets while set. */
  coachMacros: CoachMacros | null;
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
  /** Coach access: shows the prompt when a coach has asked. */
  coachSharing: MySharing | null;
  onCoachSharing: (shared: boolean) => Promise<void>;
  /** Programs and habit sets from the coach, waiting for an answer. */
  assignments: MemberAssignment[];
  onUseAssignment: (a: MemberAssignment) => Promise<string | null>;
  onDeclineAssignment: (a: MemberAssignment) => Promise<void>;
  onOpen: (dest: TodayDestination) => void;
  /** Ranks → Badges, where the full badge list lives. */
  onOpenBadges: () => void;
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
    () => dayTargetFinder(profile, fatLoss, props.carbs, props.adjustments, props.coachMacros),
    [profile, fatLoss, props.carbs, props.adjustments, props.coachMacros],
  );
  const target = targetFor(today);
  const food = foodLogs.find((l) => l.date === today)?.entries ?? [];
  const eaten = sumMacros(food);
  const progress = dayProgress(habits, entries);
  const rest = entries[REST_KEY] === true;
  // Rest days excuse the workout habit, up to a few a week (same rule as Progress → Habits).
  const hasWorkoutHabit = habits.some((h) => h.link === "workout");
  const restUsed = React.useMemo(() => {
    const map = new Map(habitLogs.map((l) => [l.date, l.entries]));
    return restDaysInWeek(map, weekStartOf(today)) - (isRestDay(map.get(today)) ? 1 : 0);
  }, [habitLogs, today]);
  const restLimitReached = !rest && restUsed >= MAX_REST_DAYS_PER_WEEK;
  const setRest = (on: boolean) => updateEntries({ [REST_KEY]: on });
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

  const stepsDone = steps !== null && steps >= stepTarget;
  const habitsDone = progress.total > 0 && progress.done === progress.total;
  const workoutDone = rest || doneToday.length > 0;
  const liveSets = live ? live.exercises.reduce((n, e) => n + e.sets.length, 0) : 0;
  const tasks: TaskItem[] = [
    {
      id: "weigh-in",
      label: "Weigh-in",
      icon: Scale,
      done: weighIn !== null,
      fraction: weighIn ? 1 : 0,
      summary: weighIn ? `${round(fromLb(weighIn.weightLb, unit), 1)} ${unit}` : "",
    },
    {
      id: "workout",
      label: rest ? "Rest" : "Workout",
      icon: rest ? BedDouble : Dumbbell,
      done: workoutDone,
      fraction: workoutDone ? 1 : live && liveSets > 0 ? summarizeWorkout(live).sets / liveSets : 0,
      summary: rest
        ? "Rest day"
        : doneToday.length > 0
          ? `${doneToday.map((w) => w.name).join(" + ")} · ${doneToday.reduce((n, w) => n + summarizeWorkout(w).sets, 0)} sets`
          : "",
    },
    {
      id: "food",
      label: "Food",
      icon: Utensils,
      done: food.length > 0,
      fraction: target && target.calories > 0 ? eaten.kcal / target.calories : food.length > 0 ? 1 : 0,
      summary: `${Math.round(eaten.kcal).toLocaleString()} kcal`,
    },
    {
      id: "habits",
      label: "Habits",
      icon: ListChecks,
      done: habitsDone,
      fraction: progress.total > 0 ? progress.done / progress.total : 0,
      summary: `${progress.done} of ${progress.total}`,
    },
    ...(stepHabit
      ? [
          {
            id: "steps" as const,
            label: "Steps",
            icon: Footprints,
            done: stepsDone,
            fraction: steps !== null && stepTarget > 0 ? steps / stepTarget : 0,
            summary: steps !== null ? `${steps.toLocaleString()} steps` : "",
          },
        ]
      : []),
  ];
  const doneCount = tasks.filter((t) => t.done).length;
  const allDone = doneCount === tasks.length;
  const day = new Date(`${today}T12:00:00`);
  const weekday = day.toLocaleDateString(undefined, { weekday: "long" });
  const monthDay = day.toLocaleDateString(undefined, { month: "long", day: "numeric" });

  // Done items fold to one line; tapping one opens it again (to untick a habit, say).
  const [expanded, setExpanded] = React.useState<Set<TaskId>>(() => new Set());
  const toggle = (id: TaskId) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const jumpTo = (t: TaskItem) => {
    if (t.done) setExpanded((prev) => new Set(prev).add(t.id));
    document.getElementById(`today-${t.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Food is a running total all day, so it always stays open.
  const folds = (t: TaskItem) => t.done && t.id !== "food";
  const pending = tasks.filter((t) => !folds(t));
  const finished = tasks.filter(folds);
  // One gold button on the page: the first thing still to do.
  const firstAction = pending.find((t) => t.id === "weigh-in" || t.id === "workout")?.id ?? null;

  const cards: Record<TaskId, React.ReactNode> = {
    "weigh-in": (
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
            <div>
              <p className="tabular text-3xl font-semibold leading-none">
                {round(fromLb(weighIn.weightLb, unit), 1)}
                <span className="ml-1 text-base font-normal text-muted-foreground">{unit}</span>
              </p>
              {trendToday !== null ? (
                <p className="tabular mt-1.5 text-xs text-muted-foreground">
                  Trend {round(fromLb(trendToday, unit), 1)} {unit}
                </p>
              ) : null}
            </div>
          ) : (
            <QuickWeighIn
              unit={unit}
              primary={firstAction === "weigh-in"}
              placeholder={trendToday ?? profile.weight}
              onSave={(lb) => props.onSaveWeighIn({ date: today, weightLb: lb, calories: null, note: null })}
            />
          )}
        </CardContent>
      </Card>
    ),
    workout: (
      <WorkoutToday
        live={live}
        doneToday={doneToday}
        rest={rest}
        training={props.training}
        workouts={workouts}
        today={today}
        primary={firstAction === "workout"}
        onStart={props.onStartWorkout}
        onOpen={() => onOpen("training")}
        onUndoRest={() => setRest(false)}
      />
    ),
    food: (
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Utensils className="h-4 w-4 text-primary" />
            Food
          </CardTitle>
          <OpenLink label="Food log" onClick={() => onOpen("food")} />
        </CardHeader>
        <CardContent className="space-y-4">
          {target ? (
            <>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p
                    className={cn(
                      "tabular text-3xl font-semibold leading-none",
                      eaten.kcal - target.calories > 100 && "text-warning",
                    )}
                  >
                    {Math.abs(Math.round(target.calories - eaten.kcal)).toLocaleString()}
                  </p>
                  <p className="tabular mt-1.5 text-xs text-muted-foreground">
                    kcal {eaten.kcal > target.calories ? "over" : "left"} · {Math.round(eaten.kcal).toLocaleString()} of{" "}
                    {target.calories.toLocaleString()} eaten
                  </p>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" onClick={() => onOpen("food")}>
                  <Plus />
                  Log food
                </Button>
              </div>
              <Bar value={eaten.kcal} target={target.calories} />
              <div className="space-y-1">
                <div className="tabular flex justify-between text-xs">
                  <span className="font-medium text-macro-protein">Protein</span>
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{Math.round(eaten.protein)}</span> / {target.protein} g
                  </span>
                </div>
                <Bar value={eaten.protein} target={target.protein} className="bg-macro-protein" />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Set up your plan to see today&apos;s targets.</p>
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => onOpen("food")}>
                <Plus />
                Log food
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    ),
    habits: (
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-primary" />
            Daily non-negotiables
            <span className="tabular text-xs font-normal text-muted-foreground">
              {progress.done} / {progress.total}
            </span>
          </CardTitle>
          <OpenLink label="Your week" onClick={() => onOpen("habits")} />
        </CardHeader>
        <CardContent>
          {habits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No habits set up yet.</p>
          ) : (
            <>
            {hasWorkoutHabit && doneToday.length === 0 ? (
              <button
                type="button"
                aria-pressed={rest}
                disabled={restLimitReached}
                onClick={() => setRest(!rest)}
                className={cn(
                  "mb-2 flex min-h-11 w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  rest ? "border-primary/50 bg-primary/10" : "border-dashed border-border hover:bg-muted/40",
                )}
              >
                <BedDouble className={cn("h-5 w-5 shrink-0", rest ? "text-primary" : "text-muted-foreground")} />
                <span className="font-medium">{rest ? "Rest day" : "Mark as rest day"}</span>
                <span className="tabular ml-auto text-xs text-muted-foreground">
                  {restLimitReached
                    ? `${MAX_REST_DAYS_PER_WEEK} used this week`
                    : `${restUsed + (rest ? 1 : 0)} of ${MAX_REST_DAYS_PER_WEEK} this week`}
                </span>
              </button>
            ) : null}
            <ul className="space-y-0.5">
              {habits.map((h) => {
                if (!counts(h, entries)) {
                  return (
                    <li key={h.id} className="flex items-center gap-3 px-1 py-2 text-sm text-muted-foreground">
                      <BedDouble className="h-5 w-5" />
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
                    <li key={h.id} className="flex items-center gap-3 px-1 py-1.5 text-sm">
                      <Tick done={done} />
                      <span className={cn("min-w-0 flex-1 truncate", done && "text-muted-foreground")}>{h.name}</span>
                      <span className="tabular shrink-0 text-xs text-muted-foreground">
                        {formatHabitValue(current)} / {formatHabitValue(h.target ?? 1)} {h.unit ?? ""}
                      </span>
                      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => set(current - step)} disabled={current <= 0} aria-label={`Decrease ${h.name}`}>
                        <Minus />
                      </Button>
                      <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => set(current + step)} aria-label={`Increase ${h.name}`}>
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
                      className="flex min-h-11 w-full items-center gap-3 rounded-md px-1 py-1.5 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Tick done={done} />
                      <span className={cn("min-w-0 flex-1 truncate", done && "text-muted-foreground line-through")}>{h.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            </>
          )}
        </CardContent>
      </Card>
    ),
    steps: stepHabit ? (
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Footprints className="h-4 w-4 text-primary" />
            Steps
          </CardTitle>
          <OpenLink label="This week" onClick={() => onOpen("habits")} />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <p className="tabular text-3xl font-semibold leading-none">
              {steps === null ? "—" : steps.toLocaleString()}
            </p>
            <p className="tabular text-xs text-muted-foreground">of {stepTarget.toLocaleString()}</p>
          </div>
          <Bar value={steps ?? 0} target={stepTarget} className={stepsDone ? "bg-success" : "bg-primary"} />
          <QuickSteps value={steps} onChange={logSteps} />
        </CardContent>
      </Card>
    ) : null,
  };

  return (
    <div className="space-y-5">
      {/* --------------- the day at a glance: one ring per task --------------- */}
      <section
        aria-label="Today at a glance"
        className="rounded-xl border border-primary/25 bg-gradient-to-b from-primary/[0.12] to-card p-4 shadow-sm sm:p-6"
      >
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{weekday}</p>
            <h2 className="text-2xl font-semibold leading-tight">{monthDay}</h2>
          </div>
          <p className="tabular shrink-0 text-right leading-tight">
            <span className={cn("text-2xl font-semibold", allDone && "text-success")}>{doneCount}</span>
            <span className="text-base text-muted-foreground"> / {tasks.length}</span>
            <span className="block text-xs text-muted-foreground">done today</span>
          </p>
        </div>
        <div className="mt-4 grid gap-1" style={{ gridTemplateColumns: `repeat(${tasks.length}, minmax(0, 1fr))` }}>
          {tasks.map((t) => (
            <TaskRing key={t.id} item={t} onClick={() => jumpTo(t)} />
          ))}
        </div>
        {allDone ? (
          <p className="mt-3 animate-fade-in text-center text-sm font-medium text-success">Everything&apos;s done. Nice work.</p>
        ) : null}
      </section>

      <AssignmentCards assignments={props.assignments} onUse={props.onUseAssignment} onDecline={props.onDeclineAssignment} />

      {props.coachSharing?.requestedAt && !props.coachSharing.shared ? (
        <CoachRequestCard sharing={props.coachSharing} onChange={props.onCoachSharing} />
      ) : null}

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

      <FirstWeekCard
        done={{
          // Anything changed from the starting example counts as their own goal.
          goal:
            profile.weight !== DEFAULT_PROFILE.weight ||
            profile.heightInches !== DEFAULT_PROFILE.heightInches ||
            profile.age !== DEFAULT_PROFILE.age ||
            fatLoss.targetWeight !== DEFAULT_FAT_LOSS_INPUTS.targetWeight ||
            fatLoss.goalType !== DEFAULT_FAT_LOSS_INPUTS.goalType,
          "weigh-in": weighIns.length > 0,
          food: foodLogs.some((l) => l.entries.length > 0),
          workout: workouts.some((w) => w.finishedAt !== null),
          reminders: props.remindersOn,
        }}
        onGo={(step) =>
          onOpen(step === "goal" ? "timeline" : step === "weigh-in" ? "weigh-in" : step === "workout" ? "training" : step)
        }
      />

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
                <li key={b.id} className="flex animate-pop items-center gap-2">
                  <BadgeIcon badge={b} size="sm" />
                  <span className="text-sm font-medium">{b.title}</span>
                </li>
              ))}
            </ul>
            <button type="button" className="text-xs text-muted-foreground underline underline-offset-2" onClick={props.onOpenBadges}>
              See all badges in Ranks
            </button>
          </CardContent>
        </Card>
      ) : null}

      {/* ----------------------------- still to do ----------------------------- */}
      {pending.length > 0 ? (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
          {pending.map((t) => (
            <div key={t.id} id={`today-${t.id}`} className="scroll-mt-20">
              {cards[t.id]}
            </div>
          ))}
          <FastingToday fasting={props.fasting} onOpen={() => onOpen("fasting")} />
        </div>
      ) : (
        <FastingToday fasting={props.fasting} onOpen={() => onOpen("fasting")} />
      )}

      {/* ------------------------- done: one line each ------------------------- */}
      {finished.length > 0 ? (
        <section aria-label="Done today" className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Done today</h3>
          <ul className="grid grid-cols-[minmax(0,1fr)] items-start gap-2 md:grid-cols-2">
            {finished.map((t) => (
              <li key={t.id} id={`today-${t.id}`} className="scroll-mt-20">
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  aria-expanded={expanded.has(t.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-7 w-7 shrink-0 animate-pop items-center justify-center rounded-full bg-success text-success-foreground">
                    <Check className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium">{t.label}</span>
                  <span className="tabular min-w-0 flex-1 truncate text-right text-sm text-muted-foreground">{t.summary}</span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded.has(t.id) && "rotate-180")} />
                </button>
                {expanded.has(t.id) ? <div className="mt-2 animate-fade-in">{cards[t.id]}</div> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

type TaskId = "weigh-in" | "workout" | "food" | "habits" | "steps";

interface TaskItem {
  id: TaskId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  done: boolean;
  /** 0–1: how far along, for the ring. */
  fraction: number;
  /** One line for the folded "done" row. */
  summary: string;
}

/** One task in the header: a ring that fills as it's done, and a tick when it is. */
function TaskRing({ item, onClick }: { item: TaskItem; onClick: () => void }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, item.fraction));
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${item.label}: ${item.done ? "done" : pct > 0 ? `${Math.round(pct * 100)}%` : "not done yet"}`}
      className="flex min-w-0 flex-col items-center gap-1.5 rounded-lg py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="relative flex h-12 w-12 items-center justify-center">
        <svg viewBox="0 0 48 48" className="absolute inset-0 h-12 w-12 -rotate-90" aria-hidden>
          <circle cx="24" cy="24" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
          {pct > 0 ? (
            <circle
              cx="24"
              cy="24"
              r={r}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - pct)}
              className={cn("transition-[stroke-dashoffset] duration-700 ease-out", item.done ? "stroke-success" : "stroke-primary")}
            />
          ) : null}
        </svg>
        {item.done ? (
          <span className="flex h-7 w-7 animate-pop items-center justify-center rounded-full bg-success text-success-foreground">
            <Check className="h-4 w-4" />
          </span>
        ) : (
          <Icon className={cn("h-5 w-5", pct > 0 ? "text-primary" : "text-muted-foreground")} />
        )}
      </span>
      <span className={cn("max-w-full truncate text-xs font-medium", item.done ? "text-success" : "text-foreground")}>
        {item.label}
      </span>
    </button>
  );
}

/** A habit's tick circle; the tick pops in when it lands. */
function Tick({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
        done ? "border-success bg-success text-success-foreground" : "border-muted-foreground/50",
      )}
    >
      {done ? <Check className="h-3.5 w-3.5 animate-pop" /> : null}
    </span>
  );
}

/* ================================ pieces ================================ */

function QuickWeighIn({
  unit,
  placeholder,
  primary,
  onSave,
}: {
  unit: WeightUnit;
  placeholder: number;
  /** The page's one gold button goes to the first thing still to do. */
  primary: boolean;
  onSave: (lb: number) => Promise<void>;
}) {
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
      <Hint id="today-weigh-in" label="When to weigh in">
        Same time each morning: after the bathroom, before food or water.
      </Hint>
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
        <Button type="submit" variant={primary ? "default" : "outline"} disabled={busy}>
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
  today,
  primary,
  onStart,
  onOpen,
  onUndoRest,
}: {
  primary: boolean;
  onUndoRest: () => void;
  live: Workout | null;
  doneToday: Workout[];
  rest: boolean;
  training: TrainingSettings;
  workouts: Workout[];
  today: string;
  onStart: (program: Program, day: ProgramDay) => void;
  onOpen: () => void;
}) {
  const program = training.programs.find((p) => p.id === training.activeProgramId) ?? training.programs[0] ?? null;
  // A program on a calendar: the planned workout for today, or the next one.
  const plan = program ? planToday(program, workouts, today) : null;
  const planned =
    plan?.kind === "today"
      ? plan.session.day
      : plan?.kind === "rest" || plan?.kind === "done-today"
        ? (plan.next?.day ?? null)
        : plan?.kind === "not-started"
          ? plan.next.day
          : null;
  const next = planned ?? (program ? nextProgramDay(program, workouts) : null);
  const heading =
    plan?.kind === "today"
      ? "Today in your plan"
      : plan?.kind === "rest" && plan.next
        ? `Rest day · next on ${formatShort(plan.next.date)}`
        : plan?.kind === "not-started"
          ? `Plan starts ${formatShort(plan.next.date)}`
          : `Next up · ${program?.name ?? ""}`;

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
        <Button className="w-full" variant={primary ? "default" : "outline"} onClick={onOpen}>
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
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <BedDouble className="h-4 w-4" />
          Rest day — recover well.
        </p>
        <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs" onClick={onUndoRest}>
          Undo
        </Button>
      </div>
    );
  } else if (program && next) {
    body = (
      <div className="space-y-3">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-primary">{heading}</p>
          <p className="text-lg font-semibold">{next.name}</p>
        </div>
        {next.exercises.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {next.exercises.slice(0, 4).map((pe, i) => (
              <li key={`${pe.exerciseId}-${i}`} className="flex items-center gap-2">
                <ExerciseThumb exerciseId={pe.exerciseId} className="h-6 w-6 rounded" />
                <span className="min-w-0 flex-1 truncate">{findExercise(pe.exerciseId, training.customExercises)?.name ?? "Exercise"}</span>
                <span className="tabular shrink-0 text-muted-foreground">{formatTarget(pe)}</span>
              </li>
            ))}
            {next.exercises.length > 4 ? (
              <li className="text-muted-foreground">+{next.exercises.length - 4} more</li>
            ) : null}
          </ul>
        ) : null}
        <Button className="w-full" variant={plan?.kind === "rest" || !primary ? "outline" : "default"} onClick={() => onStart(program, next)}>
          <Play />
          {plan?.kind === "rest" ? `Do ${next.name} today` : `Start ${next.name}`}
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
  if (meals.length === 0) return null;
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
