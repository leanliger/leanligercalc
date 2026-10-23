"use client";

import * as React from "react";
import { ArrowDown, ArrowLeftRight, ArrowUp, Check, ChevronsUp, CloudOff, Disc3, Flag, Minus, Pause, Plus, Trash2, TrendingUp, Trophy } from "lucide-react";
import { BarPicker, LoadTypePicker, PlateResult, useBar, type LoadType } from "@/components/plate-calculator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useGymMode } from "@/components/gym-mode";
import { ConfirmButton } from "@/components/confirm-button";
import { ExercisePicker } from "@/components/exercise-library";
import { ExerciseThumb } from "@/components/exercise-art";
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
  progressionAdvice,
  formatRir,
  formatSetEffort,
  isOneSide,
  weakerSide,
  RIR_CHOICES,
  MAX_RIR,
  type AdviceKind,
  summarizeWorkout,
  swapExercise,
  type DoneSet,
  type TrainingSettings,
  type Workout,
  type WorkoutExercise,
  type WorkoutSet,
} from "@/lib/training";
import type { WeightUnit } from "@/lib/types";
import { fromLb, toLb } from "@/lib/units";
import { cn } from "@/lib/utils";

const ROW_GRID = "grid grid-cols-[1.5rem_minmax(0,1fr)_4.375rem_4rem_2.875rem] items-center gap-1.5";
/** The set boxes (weight, reps) and the done button, outside gym mode. */
const SET_BOX = "h-11 rounded-[0.875rem] border-primary/15 bg-[hsl(var(--gold-hi)/0.06)] text-[1.0625rem] font-extrabold";
/** Gym mode: thumb-sized boxes and a big done button; "Previous" is left out (it's in "Last time" above). */
const ROW_GRID_GYM = "grid grid-cols-[1.75rem_minmax(0,1.3fr)_minmax(0,1fr)_4.5rem] items-center gap-2";
/** One-side exercises: Set · weight · Left · Right · Done (last time's set goes under the row). */
const ROW_GRID_SIDES = "grid grid-cols-[1.5rem_minmax(0,1fr)_3.5rem_3.5rem_2.875rem] items-center gap-1.5";
const ROW_GRID_SIDES_GYM = "grid grid-cols-[1.75rem_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_4.5rem] items-center gap-2";

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
/** Whether the screen is being kept on: "on", "blocked" (refused, e.g. inside Whop's frame) or "unsupported". */
type WakeLockStatus = "idle" | "on" | "blocked" | "unsupported";

function useWakeLock(active: boolean): WakeLockStatus {
  const [status, setStatus] = React.useState<WakeLockStatus>("idle");
  React.useEffect(() => {
    if (!active) return setStatus("idle");
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return setStatus("unsupported");
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const request = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (stopped) void next.release();
        else {
          lock = next;
          setStatus("on");
          next.addEventListener?.("release", () => !stopped && setStatus("idle"));
        }
      } catch {
        // Not allowed here (e.g. inside an iframe without permission).
        if (!stopped) setStatus("blocked");
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
  return status;
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
  const wake = useWakeLock(live);
  const [gymOn, setGym] = useGymMode();
  const gym = live && gymOn;
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
      ...(isOneSide(e.id) ? { oneSide: true } : {}),
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
      <Card className="border-primary/35">
        <CardHeader className="space-y-2 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="tabular text-[11px] font-bold uppercase tracking-[0.1em] text-[hsl(var(--gold-hi))]">
                {live ? `In progress · ${formatDuration(now - workout.startedAt)}` : `Editing · ${formatLong(workout.date)}`}
              </p>
              <CardTitle className="truncate text-xl font-extrabold tracking-tight">{workout.name}</CardTitle>
              <p className="tabular text-xs text-muted-foreground">
                {summary.sets} of {totalSets} sets · {formatWork(summary, unit)}
                {summary.volume > 0 ? " lifted" : ""}
              </p>
            </div>
            <Button onClick={finish} disabled={busy} className={cn("h-11 shrink-0 px-5 font-extrabold", gym && "h-12 text-base")}>
              {live ? <Flag /> : <Check />}
              {live ? "Finish" : "Done"}
            </Button>
          </div>
          {live ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Switch checked={gymOn} onCheckedChange={setGym} aria-label="Gym mode" />
                Gym mode
              </label>
              <span className="text-xs text-muted-foreground">
                {!gymOn
                  ? "Big buttons and a full-screen rest timer, for chalky hands."
                  : wake === "on"
                    ? "Screen stays on while you train."
                    : wake === "idle"
                      ? "Keeping your screen on…"
                    : "Your phone may still lock here: set Auto-Lock to Never while you train (iPhone Settings → Display & Brightness)."}
              </span>
            </div>
          ) : null}
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
          gym={gym}
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
          barbell={findExercise(e.exerciseId, settings.customExercises)?.equipment === "barbell"}
          trackRir={settings.trackRir}
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
  gym,
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
  barbell,
  trackRir,
  swap,
}: {
  /** Gym mode: bigger everything. */
  gym: boolean;
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
  /** A barbell lift: offers the plate calculator for the next set. */
  barbell: boolean;
  /** Ask how many reps were left after each completed set. */
  trackRir: boolean;
  /** Swapping for another exercise; null when there's nothing left to swap. */
  swap: SwapOptions | null;
}) {
  const [swapping, setSwapping] = React.useState(false);
  const [showPlates, setShowPlates] = React.useState(false);
  const advice = progressionAdvice(exercise.target, last, exercise.bodyweight, unit);
  const bw = exercise.bodyweight;
  const rest = exercise.restSec ?? defaultRest;
  const doneCount = exercise.sets.filter((s) => s.done).length;
  const oneSide = exercise.oneSide === true;
  const behind = oneSide ? weakerSide(last) : null;

  const setSet = (i: number, s: WorkoutSet) => {
    const sets = exercise.sets.map((x, j) => (j === i ? s : x));
    // Ticking a set fills an empty next set with the same numbers.
    const next = sets[i + 1];
    if (s.done && !exercise.sets[i]!.done && next && !next.done && next.weight === null && next.reps === null) {
      sets[i + 1] = { ...next, weight: s.weight, reps: s.reps, ...(s.left !== undefined ? { left: s.left, right: s.right } : {}) };
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
          <ExerciseThumb exerciseId={exercise.exerciseId} className="h-11 w-11" />
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onOpen}
              className="text-left text-[1.0625rem] font-extrabold leading-snug tracking-tight underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
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
        {oneSide ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="rounded-full bg-primary/[0.12] px-2.5 py-1 font-bold text-[hsl(var(--gold-hi))]">One side at a time · reps for each side</span>
            <span className="text-muted-foreground">Right copies Left as you type; change it if it differed.</span>
          </p>
        ) : null}
        <p className="tabular text-xs text-muted-foreground">
          {last.length > 0
            ? `Last time: ${last.map((s) => formatSetEffort(s, unit, bw)).join(", ")}`
            : "First time logging this — pick a weight you can lift with good form."}
        </p>
        {behind ? (
          <p className="text-xs font-bold text-warning">
            Last time your {behind.side} side was {behind.by} rep{behind.by === 1 ? "" : "s"} behind. Start with it, and match it on the other side.
          </p>
        ) : null}
        {swap && swapping ? <SwapPicker exercise={exercise} options={swap} onDone={() => setSwapping(false)} /> : null}
        {advice ? (
          <p className={cn("flex items-start gap-1.5 text-xs font-medium", ADVICE_STYLE[advice.kind].text)}>
            {ADVICE_STYLE[advice.kind].icon}
            {advice.text}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-1.5 p-4 pt-1 sm:p-6 sm:pt-1">
        <div
          className={cn(oneSide ? (gym ? ROW_GRID_SIDES_GYM : ROW_GRID_SIDES) : gym ? ROW_GRID_GYM : ROW_GRID, "px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground")}
          aria-hidden
        >
          <span className="text-center">Set</span>
          {gym || oneSide ? null : <span>Previous</span>}
          <span className="text-center">{bw ? `+${unit}` : unit}</span>
          {oneSide ? (
            <>
              <span className={cn("text-center", behind?.side === "left" && "text-warning")}>Left</span>
              <span className={cn("text-center", behind?.side === "right" && "text-warning")}>Right</span>
            </>
          ) : (
            <span className="text-center">Reps</span>
          )}
          <span className="text-center">Done</span>
        </div>
        {exercise.sets.map((s, i) => (
          <SetRow
            key={`${i}-${unit}`}
            gym={gym}
            n={i + 1}
            set={s}
            prev={last[i] ?? null}
            unit={unit}
            bodyweight={bw}
            oneSide={oneSide}
            pr={isPR(s)}
            trackRir={trackRir}
            onChange={(next) => setSet(i, next)}
            onDone={() => {
              if (live) onSetDone();
            }}
          />
        ))}
        <div className="flex items-center gap-1 pt-1">
          <Button variant={gym ? "outline" : "ghost"} size="sm" className={gym ? "h-12 px-4 text-base" : "h-8 px-2"} onClick={addSet} disabled={exercise.sets.length >= MAX_SETS}>
            <Plus />
            Add set
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(gym ? "h-12 px-4 text-base" : "h-8 px-2", "text-muted-foreground")}
            onClick={() => onChange({ ...exercise, sets: exercise.sets.slice(0, -1) })}
            disabled={exercise.sets.length === 0}
          >
            <Minus />
            Remove set
          </Button>
          {barbell && !bw ? (
            <Button
              variant="ghost"
              size="sm"
              className={cn("ml-auto h-8 px-2", showPlates && "text-primary")}
              aria-expanded={showPlates}
              onClick={() => setShowPlates((v) => !v)}
            >
              <Disc3 />
              Plates
            </Button>
          ) : null}
        </div>
        {barbell && !bw && showPlates ? <NextSetPlates sets={exercise.sets} unit={unit} /> : null}
      </CardContent>
    </Card>
  );
}

const ADVICE_STYLE: Record<AdviceKind, { text: string; icon: React.ReactNode }> = {
  "add-weight": { text: "text-success", icon: <TrendingUp className="mt-px h-3.5 w-3.5 shrink-0" /> },
  "add-reps": { text: "text-primary", icon: <ChevronsUp className="mt-px h-3.5 w-3.5 shrink-0" /> },
  hold: { text: "text-muted-foreground", icon: <Pause className="mt-px h-3.5 w-3.5 shrink-0" /> },
};

/** "How many more reps could you have done?" for a completed set: one tap, tap again to clear. */
function RirPicker({ n, value, onChange }: { n: number; value: number | null; onChange: (rir: number | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 pb-1.5 pl-9">
      <span className="text-[12px] text-muted-foreground">{value === null ? "Reps left in the tank?" : "Effort:"}</span>
      <div role="radiogroup" aria-label={`Set ${n}: reps left in reserve`} className="flex gap-1">
        {RIR_CHOICES.map((r) => {
          const on = value === r;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={r === 0 ? "0, all out" : r >= MAX_RIR ? `${MAX_RIR} or more` : String(r)}
              onClick={() => onChange(on ? null : r)}
              className={cn(
                "h-6 min-w-[1.75rem] rounded-full border px-1.5 text-[12px] font-medium tabular transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              {r >= MAX_RIR ? `${MAX_RIR}+` : r}
            </button>
          );
        })}
      </div>
      {value !== null ? <span className="text-[12px] text-muted-foreground">{formatRir(value)}</span> : null}
    </div>
  );
}

/** Plates for the next set still to do (or the last one with a weight). */
function NextSetPlates({ sets, unit }: { sets: readonly WorkoutSet[]; unit: WeightUnit }) {
  const [bar, setBar] = useBar(unit);
  const [type, setType] = React.useState<LoadType>("barbell");
  const next = sets.find((s) => !s.done && s.weight !== null) ?? [...sets].reverse().find((s) => s.weight !== null) ?? null;
  const total = next?.weight != null ? Math.round(fromLb(next.weight, unit) * 100) / 100 : null;
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <LoadTypePicker value={type} onChange={setType} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-xs font-medium">
          {total === null ? "Enter a weight to see the plates." : `Loading ${total} ${unit}`}
        </p>
        {type === "barbell" ? <BarPicker unit={unit} bar={bar} onBar={setBar} className="w-36" /> : null}
      </div>
      {total !== null ? <PlateResult total={total} bar={bar} unit={unit} type={type} /> : null}
    </div>
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
  gym,
  n,
  set,
  prev,
  unit,
  bodyweight,
  oneSide,
  pr,
  trackRir,
  onChange,
  onDone,
}: {
  gym: boolean;
  n: number;
  set: WorkoutSet;
  prev: DoneSet | null;
  unit: WeightUnit;
  bodyweight: boolean;
  /** Reps are per side: a Left and a Right box on every set. */
  oneSide: boolean;
  pr: boolean;
  trackRir: boolean;
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

  // One-side exercises: a Left and a Right box on every set. Saved as before:
  // reps (the weaker side) plus left/right only when the sides differed.
  const storedSide = (v: number | undefined) => v ?? set.reps;
  const asText = (v: number | null) => (v === null ? "" : String(v));
  const [leftText, setLeftText] = React.useState(asText(storedSide(set.left)));
  const [rightText, setRightText] = React.useState(asText(storedSide(set.right)));
  // Right follows Left until it's typed in itself (most sets match).
  const [rightTouched, setRightTouched] = React.useState(set.left !== undefined && set.left !== set.right);
  const rightRef = React.useRef<HTMLInputElement>(null);
  const sentSides = React.useRef<string | null>(null);
  const sidesKey = (s: WorkoutSet) => `${s.reps}|${s.left}|${s.right}`;
  // Follow sides filled in from outside (copied from the set above), not our own changes.
  React.useEffect(() => {
    if (!oneSide || sentSides.current === sidesKey(set)) return;
    setLeftText(asText(storedSide(set.left)));
    setRightText(asText(storedSide(set.right)));
    setRightTouched(set.left !== undefined && set.left !== set.right);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the stored values change
  }, [set.reps, set.left, set.right]);
  const parseReps = (t: string): number | null | false => {
    const s = t.trim();
    if (s === "") return null;
    const n = Number(s);
    return Number.isInteger(n) && n >= 0 && n <= MAX_REPS ? n : false;
  };
  const commitSides = (lText: string, rText: string) => {
    const left = parseReps(lText);
    const right = parseReps(rText);
    if (left === false || right === false) return;
    setMissing(false);
    let next: WorkoutSet;
    if (left === null && right === null) next = { ...set, reps: null, left: undefined, right: undefined, done: false };
    // One side still to type: not done yet.
    else if (left === null || right === null) next = { ...set, reps: (left ?? right)!, left: undefined, right: undefined, done: false };
    else if (left === right) next = { ...set, reps: left, left: undefined, right: undefined, done: set.done && left > 0 };
    // Records and advice follow the weaker side.
    else next = { ...set, left, right, reps: Math.min(left, right), done: set.done && Math.max(left, right) > 0 };
    sentSides.current = sidesKey(next);
    onChange(next);
  };
  const changeLeft = (text: string) => {
    setLeftText(text);
    if (!rightTouched) setRightText(text);
    commitSides(text, rightTouched ? rightText : text);
  };
  const changeRight = (text: string) => {
    setRightText(text);
    setRightTouched(true);
    commitSides(leftText, text);
  };
  const leftN = parseReps(leftText);
  const rightN = parseReps(rightText);
  // While the sides differ, the weaker one is outlined.
  const weakerBox =
    typeof leftN === "number" && typeof rightN === "number" && leftN !== rightN ? (leftN < rightN ? "left" : "right") : null;

  const toggle = () => {
    if (oneSide && !set.done && (leftText.trim() === "" || rightText.trim() === "")) {
      setMissing(true);
      (leftText.trim() === "" ? repsRef : rightRef).current?.focus();
      return;
    }
    if (!set.done && (set.reps === null || set.reps < 1)) {
      setMissing(true);
      repsRef.current?.focus();
      return;
    }
    // Un-ticking a set clears how hard it was.
    onChange(set.done ? { ...set, done: false, rir: null } : { ...set, done: true });
    if (!set.done) onDone();
  };

  return (
    <div className={cn("rounded-2xl transition-colors", set.done && "bg-success/[0.08]")}>
    <div className={cn(oneSide ? (gym ? ROW_GRID_SIDES_GYM : ROW_GRID_SIDES) : gym ? ROW_GRID_GYM : ROW_GRID, "px-1 py-1")}>
      <span className={cn("flex justify-center font-extrabold tabular", gym ? "text-base" : "text-sm")}>
        {pr ? (
          <span title="Personal record" className="text-primary">
            <Trophy className="h-4 w-4" aria-hidden />
            <span className="sr-only">Set {n}, personal record</span>
          </span>
        ) : (
          n
        )}
      </span>
      {gym || oneSide ? null : <span className="tabular truncate text-xs text-muted-foreground">{prev ? formatSet(prev, unit, bodyweight) : "—"}</span>}
      <Input
        value={weight}
        onChange={(e) => changeWeight(e.target.value)}
        inputMode="decimal"
        enterKeyHint="next"
        placeholder={bodyweight ? "0" : unit}
        aria-label={`Set ${n} ${bodyweight ? "added weight" : "weight"} (${unit})`}
        className={cn("px-1.5 text-center", gym ? "h-14 text-xl font-semibold" : SET_BOX)}
      />
      {oneSide ? (
        <>
          <Input
            ref={repsRef}
            value={leftText}
            onChange={(e) => changeLeft(e.target.value)}
            inputMode="numeric"
            enterKeyHint="next"
            placeholder="L"
            aria-label={`Set ${n} left side reps`}
            aria-invalid={(missing && leftText.trim() === "") || undefined}
            className={cn(
              "px-1.5 text-center",
              gym ? "h-14 text-xl font-semibold" : SET_BOX,
              weakerBox === "left" && "border-warning ring-1 ring-warning",
              missing && leftText.trim() === "" && "border-destructive ring-1 ring-destructive",
            )}
          />
          <Input
            ref={rightRef}
            value={rightText}
            onChange={(e) => changeRight(e.target.value)}
            inputMode="numeric"
            enterKeyHint="done"
            placeholder="R"
            aria-label={`Set ${n} right side reps`}
            aria-invalid={(missing && rightText.trim() === "") || undefined}
            className={cn(
              "px-1.5 text-center",
              gym ? "h-14 text-xl font-semibold" : SET_BOX,
              !rightTouched && "text-foreground/70",
              weakerBox === "right" && "border-warning ring-1 ring-warning",
              missing && rightText.trim() === "" && "border-destructive ring-1 ring-destructive",
            )}
          />
        </>
      ) : (
        <Input
          ref={repsRef}
          value={reps}
          onChange={(e) => changeReps(e.target.value)}
          inputMode="numeric"
          enterKeyHint="done"
          placeholder="reps"
          aria-label={`Set ${n} reps`}
          aria-invalid={missing || undefined}
          className={cn("px-1.5 text-center", gym ? "h-14 text-xl font-semibold" : SET_BOX, missing && "border-destructive ring-1 ring-destructive")}
        />
      )}
      <button
        type="button"
        role="checkbox"
        aria-checked={set.done}
        aria-label={`Set ${n} done`}
        onClick={toggle}
        className={cn(
          "flex w-full items-center justify-center border transition-colors",
          gym ? "h-14 rounded-md" : "h-11 rounded-[0.875rem]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          set.done
            ? "border-transparent bg-gradient-to-br from-[hsl(148_62%_70%)] to-[hsl(152_55%_40%)] text-[hsl(150_60%_8%)] shadow-[0_0_14px_hsl(var(--success)/0.4)]"
            : "border-primary/20 text-muted-foreground hover:bg-muted/50",
        )}
      >
        <Check className={cn(gym ? "h-7 w-7" : "h-4 w-4", !set.done && "opacity-30", set.done && "animate-pop")} />
      </button>
    </div>
    {oneSide ? (
      // Last time's set for this row, sides included, under the boxes so they have room on a phone.
      <p className={cn("tabular px-1 pb-1.5 text-[11px] text-muted-foreground", gym ? "pl-10" : "pl-9")}>
        {prev ? `Last: ${formatSet(prev, unit, bodyweight)}` : "Last: —"}
        {weakerBox ? <span className="ml-2 font-semibold text-warning">{weakerBox === "left" ? "Left" : "Right"} behind by {Math.abs((leftN as number) - (rightN as number))}</span> : null}
      </p>
    ) : null}
    {set.done && trackRir ? <RirPicker n={n} value={typeof set.rir === "number" ? set.rir : null} onChange={(rir) => onChange({ ...set, rir })} /> : null}
    </div>
  );
}
