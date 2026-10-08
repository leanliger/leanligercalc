"use client";

import * as React from "react";
import { ArrowDown, ArrowLeftRight, ArrowUp, Check, CloudOff, Flag, Minus, Plus, Trash2, TrendingUp, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/confirm-button";
import { ExercisePicker } from "@/components/exercise-library";
import { formatLong } from "@/lib/dates";
import type { Exercise } from "@/lib/exercises";
import {
  MAX_REPS,
  MAX_SETS,
  MAX_WEIGHT_LB,
  MAX_WORKOUT_EXERCISES,
  NOTE_MAX,
  bestBefore,
  canSwap,
  e1rm,
  findExercise,
  formatDuration,
  formatLoad,
  formatRest,
  formatSet,
  formatTarget,
  formatWork,
  lastPerformance,
  prefillSets,
  programDayWith,
  shouldAddWeight,
  summarizeWorkout,
  swapExercise,
  type DoneSet,
  type TrainingSettings,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from "@/lib/training";
import type { WeightUnit } from "@/lib/types";
import { toLb } from "@/lib/units";
import { cn } from "@/lib/utils";

const ROW_GRID = "grid grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_3.75rem_2.5rem] items-center gap-1.5";

function useNow(intervalMs: number, active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

/** Keep the screen awake during a workout, where the browser allows it. */
function useWakeLock(active: boolean): void {
  React.useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const request = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (stopped) void next.release();
        else lock = next;
      } catch {
        /* not allowed here (e.g. inside an iframe without permission) */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}

export interface WorkoutLoggerProps {
  workout: Workout;
  workouts: readonly Workout[];
  unit: WeightUnit;
  settings: TrainingSettings;
  /** live: a workout in progress. edit: fixing a finished one. */
  mode: "live" | "edit";
  saveError: string | null;
  /** Changes saved on this phone, waiting for signal. */
  pendingUploads?: number;
  onChange: (w: Workout) => void;
  /** Finish (live) or Done (edit). */
  onFinish: (w: Workout) => Promise<void>;
  /** Discard (live) or Delete (edit). */
  onDiscard: () => Promise<void>;
  onOpenExercise: (id: string) => void;
  onAddCustom: (e: Exercise) => void;
  /** A set was ticked off: start the rest timer. */
  onSetDone: (exercise: WorkoutExercise, restSec: number) => void;
  /** Use one exercise instead of another on a program day from now on. */
  onSwapInProgram: (programId: string, dayId: string, fromId: string, toId: string) => void;
}

export function WorkoutLogger({
  workout,
  workouts,
  unit,
  settings,
  mode,
  saveError,
  pendingUploads = 0,
  onChange,
  onFinish,
  onDiscard,
  onOpenExercise,
  onAddCustom,
  onSetDone,
  onSwapInProgram,
}: WorkoutLoggerProps) {
  const live = mode === "live";
  const now = useNow(15_000, live);
  useWakeLock(live);
  const [picking, setPicking] = React.useState(false);
  const [finishError, setFinishError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const summary = summarizeWorkout(workout);
  const totalSets = workout.exercises.reduce((n, e) => n + e.sets.length, 0);

  const setExercise = (i: number, next: WorkoutExercise) =>
    onChange({ ...workout, exercises: workout.exercises.map((e, j) => (j === i ? next : e)) });

  const move = (i: number, dir: -1 | 1) => {
    const list = [...workout.exercises];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    onChange({ ...workout, exercises: list });
  };

  const addExercise = (e: Exercise) => {
    setPicking(false);
    const last = lastPerformance(workouts, e.id, workout.id);
    const next: WorkoutExercise = {
      exerciseId: e.id,
      name: e.name,
      bodyweight: e.bodyweight,
      target: null,
      restSec: null,
      sets: prefillSets(Math.max(1, Math.min(last.length || 3, MAX_SETS)), last, e.bodyweight),
    };
    onChange({ ...workout, exercises: [...workout.exercises, next] });
  };

  const finish = async () => {
    if (summary.sets === 0) {
      setFinishError(
        live
          ? "Tick off at least one set to finish, or discard this workout."
          : "A workout needs at least one completed set. Delete it instead if you didn't train.",
      );
      return;
    }
    setFinishError(null);
    setBusy(true);
    try {
      await onFinish(workout);
    } catch {
      /* the save error shows below */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card className="border-primary/40">
        <CardHeader className="space-y-2 p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
                {live ? "Workout in progress" : `Editing · ${formatLong(workout.date)}`}
              </p>
              <CardTitle className="truncate text-lg">{workout.name}</CardTitle>
              <p className="tabular text-xs text-muted-foreground">
                {live ? `${formatDuration(now - workout.startedAt)} · ` : ""}
                {summary.sets} of {totalSets} sets · {formatWork(summary, unit)}
                {summary.volume > 0 ? " lifted" : ""}
              </p>
            </div>
            <Button onClick={finish} disabled={busy} className="shrink-0">
              {live ? <Flag /> : <Check />}
              {live ? "Finish" : "Done"}
            </Button>
          </div>
          {finishError ? (
            <p role="alert" className="text-xs text-destructive">
              {finishError}
            </p>
          ) : null}
          {saveError ? (
            <p role="status" className="text-xs text-destructive">
              Not saved yet: {saveError} It will retry on your next change.
            </p>
          ) : pendingUploads > 0 ? (
            <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CloudOff className="h-3.5 w-3.5 shrink-0" />
              No signal? Every set is saved on this phone and uploads when you&apos;re back online.
            </p>
          ) : null}
        </CardHeader>
      </Card>

      {workout.exercises.length === 0 && !picking ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No exercises yet. Add your first one below.
        </p>
      ) : null}

      {workout.exercises.map((e, i) => (
        <ExerciseBlock
          key={`${e.exerciseId}-${i}`}
          exercise={e}
          index={i}
          count={workout.exercises.length}
          last={lastPerformance(workouts, e.exerciseId, workout.id)}
          best={bestBefore(workouts, e.exerciseId, workout.id)}
          unit={unit}
          defaultRest={settings.restSec}
          live={live}
          onChange={(next) => setExercise(i, next)}
          onRemove={() => onChange({ ...workout, exercises: workout.exercises.filter((_, j) => j !== i) })}
          onMove={(dir) => move(i, dir)}
          onOpen={() => onOpenExercise(e.exerciseId)}
          onSetDone={() => onSetDone(e, e.restSec ?? settings.restSec)}
          swap={
            canSwap(workout, i)
              ? {
                  custom: settings.customExercises,
                  exclude: workout.exercises.map((x) => x.exerciseId),
                  programDay: programDayWith(settings, workout, e.exerciseId),
                  onAddCustom,
                  onSwap: (replacement, inProgram) => {
                    const pd = programDayWith(settings, workout, e.exerciseId);
                    if (inProgram && pd) onSwapInProgram(pd.program.id, pd.day.id, e.exerciseId, replacement.id);
                    onChange(swapExercise(workout, i, replacement, workouts));
                  },
                }
              : null
          }
        />
      ))}

      {picking ? (
        <ExercisePicker
          custom={settings.customExercises}
          onPick={addExercise}
          onClose={() => setPicking(false)}
          onAddCustom={onAddCustom}
          exclude={workout.exercises.map((e) => e.exerciseId)}
        />
      ) : workout.exercises.length < MAX_WORKOUT_EXERCISES ? (
        <Button variant="outline" className="w-full" onClick={() => setPicking(true)}>
          <Plus />
          Add exercise
        </Button>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-4 sm:p-6">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Workout note (optional)</span>
            <Input
              value={workout.note}
              maxLength={NOTE_MAX}
              onChange={(ev) => onChange({ ...workout, note: ev.target.value })}
              placeholder="Energy, sleep, anything that affected today"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button onClick={finish} disabled={busy}>
              {live ? <Flag /> : <Check />}
              {live ? "Finish workout" : "Done"}
            </Button>
            <ConfirmButton
              label={live ? "Discard workout" : "Delete workout"}
              icon={<Trash2 />}
              confirmLabel={live ? "Yes, discard it" : "Yes, delete it"}
              onConfirm={onDiscard}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ExerciseBlock({
  exercise,
  index,
  count,
  last,
  best,
  unit,
  defaultRest,
  live,
  onChange,
  onRemove,
  onMove,
  onOpen,
  onSetDone,
  swap,
}: {
  exercise: WorkoutExercise;
  index: number;
  count: number;
  last: DoneSet[];
  best: { e1rm: number; reps: number };
  unit: WeightUnit;
  defaultRest: number;
  live: boolean;
  onChange: (e: WorkoutExercise) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onOpen: () => void;
  onSetDone: () => void;
  /** Swapping for another exercise; null when there's nothing left to swap. */
  swap: SwapOptions | null;
}) {
  const [swapping, setSwapping] = React.useState(false);
  const bw = exercise.bodyweight;
  const rest = exercise.restSec ?? defaultRest;
  const doneCount = exercise.sets.filter((s) => s.done).length;

  const setSet = (i: number, s: WorkoutSet) => {
    const sets = exercise.sets.map((x, j) => (j === i ? s : x));
    // Ticking a set fills an empty next set with the same numbers.
    const next = sets[i + 1];
    if (s.done && !exercise.sets[i]!.done && next && !next.done && next.weight === null && next.reps === null) {
      sets[i + 1] = { ...next, weight: s.weight, reps: s.reps };
    }
    onChange({ ...exercise, sets });
  };

  const isPR = (s: WorkoutSet): boolean => {
    if (!s.done || s.reps === null) return false;
    if (bw) return best.reps > 0 && s.reps > best.reps;
    return best.e1rm > 0 && e1rm(s.weight ?? 0, s.reps) > best.e1rm + 0.01;
  };

  const addSet = () => {
    const prev = exercise.sets[exercise.sets.length - 1];
    onChange({
      ...exercise,
      sets: [...exercise.sets, { weight: prev?.weight ?? null, reps: prev?.reps ?? null, done: false }],
    });
  };

  return (
    <Card className={cn(exercise.sets.length > 0 && doneCount === exercise.sets.length && "border-success/40")}>
      <CardHeader className="space-y-1.5 p-4 pb-2 sm:p-6 sm:pb-2">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onOpen}
              className="text-left text-base font-semibold leading-snug underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {exercise.name}
            </button>
            <p className="tabular text-xs text-muted-foreground">
              {exercise.target ? `${formatTarget(exercise.target)} reps · ` : ""}rest {formatRest(rest)}
            </p>
          </div>
          <div className="flex shrink-0 items-center">
            {swap ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                aria-expanded={swapping}
                onClick={() => setSwapping((v) => !v)}
                aria-label={`Swap ${exercise.name} for another exercise`}
              >
                <ArrowLeftRight />
                <span className="hidden sm:inline" aria-hidden>
                  Swap
                </span>
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move ${exercise.name} up`}>
              <ArrowUp />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move ${exercise.name} down`}>
              <ArrowDown />
            </Button>
            <ConfirmButton
              size="icon"
              className="h-8 w-8"
              label={<span className="sr-only">Remove {exercise.name}</span>}
              icon={<Trash2 />}
              confirmLabel="Remove"
              onConfirm={onRemove}
            />
          </div>
        </div>
        <p className="tabular text-xs text-muted-foreground">
          {last.length > 0
            ? `Last time: ${last.map((s) => formatSet(s, unit, bw)).join(", ")}`
            : "First time logging this — pick a weight you can lift with good form."}
        </p>
        {swap && swapping ? <SwapPicker exercise={exercise} options={swap} onDone={() => setSwapping(false)} /> : null}
        {shouldAddWeight(exercise.target, last) ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-success">
            <TrendingUp className="h-3.5 w-3.5 shrink-0" />
            You hit the top of the rep range on every set last time. Try a little more weight.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-1.5 p-4 pt-1 sm:p-6 sm:pt-1">
        <div className={cn(ROW_GRID, "px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground")} aria-hidden>
          <span className="text-center">Set</span>
          <span>Previous</span>
          <span className="text-center">{bw ? `+${unit}` : unit}</span>
          <span className="text-center">Reps</span>
          <span className="text-center">Done</span>
        </div>
        {exercise.sets.map((s, i) => (
          <SetRow
            key={`${i}-${unit}`}
            n={i + 1}
            set={s}
            prev={last[i] ?? null}
            unit={unit}
            bodyweight={bw}
            pr={isPR(s)}
            onChange={(next) => setSet(i, next)}
            onDone={() => {
              if (live) onSetDone();
            }}
          />
        ))}
        <div className="flex items-center gap-1 pt-1">
          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={addSet} disabled={exercise.sets.length >= MAX_SETS}>
            <Plus />
            Add set
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-muted-foreground"
            onClick={() => onChange({ ...exercise, sets: exercise.sets.slice(0, -1) })}
            disabled={exercise.sets.length === 0}
          >
            <Minus />
            Remove set
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface SwapOptions {
  custom: readonly Exercise[];
  exclude: readonly string[];
  /** The program day this exercise came from, for "use it there from now on". */
  programDay: ReturnType<typeof programDayWith>;
  onAddCustom: (e: Exercise) => void;
  onSwap: (replacement: Exercise, inProgram: boolean) => void;
}

/** Pick a replacement, starting with exercises for the same muscle. */
function SwapPicker({ exercise, options, onDone }: { exercise: WorkoutExercise; options: SwapOptions; onDone: () => void }) {
  const [inProgram, setInProgram] = React.useState(false);
  const checkId = React.useId();
  const muscle = findExercise(exercise.exerciseId, options.custom)?.muscle ?? "all";
  const done = exercise.sets.filter((s) => s.done).length;
  return (
    <div className="pt-1">
      <ExercisePicker
        title={`Swap ${exercise.name} for…`}
        custom={options.custom}
        exclude={options.exclude}
        initialMuscle={muscle}
        onAddCustom={options.onAddCustom}
        onClose={onDone}
        onPick={(e) => {
          options.onSwap(e, inProgram);
          onDone();
        }}
        footer={
          done > 0 || options.programDay ? (
            <div className="space-y-1.5">
              {done > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {done === 1 ? "Your done set stays" : `Your ${done} done sets stay`} logged on {exercise.name}; the rest move to the new exercise.
                </p>
              ) : null}
              {options.programDay ? (
                <label htmlFor={checkId} className="flex items-start gap-2 text-xs">
                  <input
                    id={checkId}
                    type="checkbox"
                    checked={inProgram}
                    onChange={(e) => setInProgram(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  <span>
                    Also use it in{" "}
                    <span className="font-medium">
                      {options.programDay.program.name} · {options.programDay.day.name}
                    </span>{" "}
                    from now on
                  </span>
                </label>
              ) : null}
            </div>
          ) : null
        }
      />
    </div>
  );
}

function SetRow({
  n,
  set,
  prev,
  unit,
  bodyweight,
  pr,
  onChange,
  onDone,
}: {
  n: number;
  set: WorkoutSet;
  prev: DoneSet | null;
  unit: WeightUnit;
  bodyweight: boolean;
  pr: boolean;
  onChange: (s: WorkoutSet) => void;
  onDone: () => void;
}) {
  const [weight, setWeight] = React.useState(set.weight === null ? "" : formatLoad(set.weight, unit));
  const [reps, setReps] = React.useState(set.reps === null ? "" : String(set.reps));
  const [missing, setMissing] = React.useState(false);
  const repsRef = React.useRef<HTMLInputElement>(null);

  // Follow values filled in from outside (e.g. copied from the set above),
  // without fighting what's being typed.
  React.useEffect(() => {
    const t = weight.trim().replace(",", ".");
    const typed = t === "" ? null : Math.round(toLb(Number(t), unit) * 100) / 100;
    if (typed !== set.weight) setWeight(set.weight === null ? "" : formatLoad(set.weight, unit));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the stored value changes
  }, [set.weight]);
  React.useEffect(() => {
    const typed = reps.trim() === "" ? null : Number(reps);
    if (typed !== set.reps) setReps(set.reps === null ? "" : String(set.reps));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the stored value changes
  }, [set.reps]);

  const changeWeight = (text: string) => {
    setWeight(text);
    const t = text.trim().replace(",", ".");
    if (t === "") return onChange({ ...set, weight: null });
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return;
    const lb = Math.round(toLb(n, unit) * 100) / 100;
    if (lb <= MAX_WEIGHT_LB) onChange({ ...set, weight: lb });
  };

  const changeReps = (text: string) => {
    setReps(text);
    setMissing(false);
    const t = text.trim();
    if (t === "") return onChange({ ...set, reps: null, done: false });
    const n = Number(t);
    if (Number.isInteger(n) && n >= 0 && n <= MAX_REPS) onChange({ ...set, reps: n, done: set.done && n > 0 });
  };

  const toggle = () => {
    if (!set.done && (set.reps === null || set.reps < 1)) {
      setMissing(true);
      repsRef.current?.focus();
      return;
    }
    onChange({ ...set, done: !set.done });
    if (!set.done) onDone();
  };

  return (
    <div className={cn(ROW_GRID, "rounded-md px-1 py-1 transition-colors", set.done && "bg-success/10")}>
      <span className="flex justify-center text-xs font-semibold tabular">
        {pr ? (
          <span title="Personal record" className="text-primary">
            <Trophy className="h-4 w-4" aria-hidden />
            <span className="sr-only">Set {n}, personal record</span>
          </span>
        ) : (
          n
        )}
      </span>
      <span className="tabular truncate text-xs text-muted-foreground">{prev ? formatSet(prev, unit, bodyweight) : "—"}</span>
      <Input
        value={weight}
        onChange={(e) => changeWeight(e.target.value)}
        inputMode="decimal"
        enterKeyHint="next"
        placeholder={bodyweight ? "0" : unit}
        aria-label={`Set ${n} ${bodyweight ? "added weight" : "weight"} (${unit})`}
        className="h-9 px-1.5 text-center"
      />
      <Input
        ref={repsRef}
        value={reps}
        onChange={(e) => changeReps(e.target.value)}
        inputMode="numeric"
        enterKeyHint="done"
        placeholder="reps"
        aria-label={`Set ${n} reps`}
        aria-invalid={missing || undefined}
        className={cn("h-9 px-1.5 text-center", missing && "border-destructive ring-1 ring-destructive")}
      />
      <button
        type="button"
        role="checkbox"
        aria-checked={set.done}
        aria-label={`Set ${n} done`}
        onClick={toggle}
        className={cn(
          "flex h-9 w-full items-center justify-center rounded-md border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          set.done ? "border-success bg-success text-success-foreground" : "border-border hover:bg-muted/50",
        )}
      >
        <Check className={cn("h-4 w-4", !set.done && "opacity-30")} />
      </button>
    </div>
  );
}
