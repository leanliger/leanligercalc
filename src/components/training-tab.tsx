"use client";

import * as React from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  History,
  ListOrdered,
  Pencil,
  Play,
  Plus,
  Star,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmButton } from "@/components/confirm-button";
import { ExerciseLibraryCard } from "@/components/exercise-library";
import { ExerciseProgress } from "@/components/exercise-progress";
import { ProgramEditor } from "@/components/program-editor";
import { RestTimerBar, useRestTimer } from "@/components/rest-timer";
import { WorkoutLogger } from "@/components/workout-logger";
import { formatShort } from "@/lib/dates";
import type { Exercise } from "@/lib/exercises";
import { REST_KEY, type HabitDef, type HabitLog } from "@/lib/habits";
import {
  MAX_PROGRAMS,
  REST_PRESETS,
  TEMPLATES,
  activeWorkout,
  doneSets,
  exerciseHistory,
  findExercise,
  formatDuration,
  formatRest,
  formatSet,
  formatTarget,
  formatWork,
  isRecordSession,
  nextProgramDay,
  programFromTemplate,
  summarizeWorkout,
  createWorkout,
  type Program,
  type ProgramDay,
  type ProgramTemplate,
  type TrainingSettings,
  type Workout,
} from "@/lib/training";
import type { WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

type View =
  | { kind: "home" }
  | { kind: "exercise"; id: string }
  | { kind: "program"; id: string }
  | { kind: "edit"; workoutId: string };

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const shortId = () => uuid().replace(/-/g, "").slice(0, 12);

interface TrainingTabProps {
  unit: WeightUnit;
  today: string;
  settings: TrainingSettings;
  onSettingsChange: (update: (prev: TrainingSettings) => TrainingSettings) => void;
  workouts: Workout[];
  /** Shows the change at once and saves it shortly after (`now` saves immediately). */
  onSaveWorkout: (w: Workout, now?: boolean) => Promise<void>;
  onDeleteWorkout: (id: string) => Promise<void>;
  saveError: string | null;
  habits: HabitDef[];
  habitLogs: HabitLog[];
  onSaveHabits: (log: HabitLog) => Promise<void>;
}

/** Which sessions in which workouts set a personal record. */
function useRecords(workouts: readonly Workout[]): Map<string, string[]> {
  return React.useMemo(() => {
    const byWorkout = new Map<string, string[]>();
    const seen = new Map<string, { name: string; bodyweight: boolean }>();
    for (const w of workouts) for (const e of w.exercises) if (!seen.has(e.exerciseId)) seen.set(e.exerciseId, { name: e.name, bodyweight: e.bodyweight });
    for (const [id, { name, bodyweight }] of seen) {
      for (const s of exerciseHistory(workouts, id)) {
        if (!isRecordSession(s, bodyweight)) continue;
        byWorkout.set(s.workoutId, [...(byWorkout.get(s.workoutId) ?? []), name]);
      }
    }
    return byWorkout;
  }, [workouts]);
}

export function TrainingTab({
  unit,
  today,
  settings,
  onSettingsChange,
  workouts,
  onSaveWorkout,
  onDeleteWorkout,
  saveError,
  habits,
  habitLogs,
  onSaveHabits,
}: TrainingTabProps) {
  const [view, setView] = React.useState<View>({ kind: "home" });
  const [finishedId, setFinishedId] = React.useState<string | null>(null);
  const rest = useRestTimer();
  const active = activeWorkout(workouts);
  const records = useRecords(workouts);
  const custom = settings.customExercises;
  const finished = finishedId ? workouts.find((w) => w.id === finishedId) ?? null : null;

  // Each view opens at its top, not wherever the last one was scrolled to.
  const viewKey = view.kind === "home" ? "home" : `${view.kind}:${"id" in view ? view.id : view.workoutId}`;
  const firstView = React.useRef(true);
  React.useEffect(() => {
    if (firstView.current) {
      firstView.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
  }, [viewKey]);

  const goHome = () => setView({ kind: "home" });

  /* ------------------------------- settings ------------------------------- */

  // Every change is an updater on the latest settings (see app-shell).
  const addCustom = (e: Exercise) =>
    onSettingsChange((s) => ({ ...s, customExercises: [e, ...s.customExercises.filter((x) => x.id !== e.id)] }));

  const deleteCustom = (id: string) => {
    onSettingsChange((s) => ({
      ...s,
      customExercises: s.customExercises.filter((x) => x.id !== id),
      // Programs drop it too; logged workouts keep its name.
      programs: s.programs.map((p) => ({
        ...p,
        days: p.days.map((d) => ({ ...d, exercises: d.exercises.filter((x) => x.exerciseId !== id) })),
      })),
    }));
    goHome();
  };

  const saveProgram = (p: Program) =>
    onSettingsChange((s) => ({ ...s, programs: s.programs.map((x) => (x.id === p.id ? p : x)) }));

  const setActiveProgram = (id: string) => onSettingsChange((s) => ({ ...s, activeProgramId: id }));

  const addProgram = (template: ProgramTemplate | null) => {
    const program: Program = template
      ? programFromTemplate(template, shortId)
      : { id: shortId(), name: "My program", days: [{ id: "d1", name: "Day 1", exercises: [] }] };
    onSettingsChange((s) => ({
      ...s,
      programs: [...s.programs, program],
      activeProgramId: s.activeProgramId ?? program.id,
    }));
    if (!template) setView({ kind: "program", id: program.id });
  };

  const deleteProgram = (id: string) => {
    onSettingsChange((s) => {
      const programs = s.programs.filter((p) => p.id !== id);
      return { ...s, programs, activeProgramId: s.activeProgramId === id ? (programs[0]?.id ?? null) : s.activeProgramId };
    });
    goHome();
  };

  /* ------------------------------- workouts ------------------------------- */

  const start = (program: Program | null, day: ProgramDay | null) => {
    setFinishedId(null);
    const w = createWorkout({ id: uuid(), date: today, program, day, custom, workouts });
    onSaveWorkout(w, true).catch(() => {});
    setView({ kind: "home" });
    window.scrollTo({ top: 0 });
  };

  /** Completing a workout ticks "Completed workout" on the Check-in scorecard. */
  const tickWorkoutHabit = (date: string) => {
    const def = habits.find((h) => h.link === "workout");
    if (!def) return;
    const entries = { ...(habitLogs.find((l) => l.date === date)?.entries ?? {}) };
    if (entries[def.id] === true && !entries[REST_KEY]) return;
    delete entries[REST_KEY]; // trained, so it wasn't a rest day
    entries[def.id] = true;
    onSaveHabits({ date, entries }).catch(() => {});
  };

  /** Only completed sets are kept, and exercises with none are dropped. */
  const cleaned = (w: Workout): Workout => ({
    ...w,
    exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length > 0),
  });

  const finish = async (w: Workout) => {
    const done = { ...cleaned(w), finishedAt: Math.max(Date.now(), w.startedAt) };
    rest.skip();
    setFinishedId(done.id);
    tickWorkoutHabit(done.date);
    window.scrollTo({ top: 0 });
    await onSaveWorkout(done, true);
  };

  const saveEdit = async (w: Workout) => {
    await onSaveWorkout({ ...cleaned(w), finishedAt: w.finishedAt ?? w.startedAt }, true);
    goHome();
  };

  /* --------------------------------- views -------------------------------- */

  let body: React.ReactNode;

  if (view.kind === "exercise") {
    const ex =
      findExercise(view.id, custom) ??
      // Deleted exercise: rebuild enough from its history to show the charts.
      (() => {
        const logged = workouts.flatMap((w) => w.exercises).find((e) => e.exerciseId === view.id);
        return logged
          ? ({ id: view.id, name: logged.name, muscle: "core", equipment: "other", cues: [], bodyweight: logged.bodyweight, video: null, custom: true } satisfies Exercise)
          : null;
      })();
    body = ex ? (
      <ExerciseProgress
        exercise={ex}
        workouts={workouts}
        unit={unit}
        onBack={goHome}
        backLabel={active ? "Back to workout" : "Back to training"}
        onSaveCustom={ex.custom && findExercise(ex.id, custom) ? addCustom : undefined}
        onDeleteCustom={ex.custom && findExercise(ex.id, custom) ? () => deleteCustom(ex.id) : undefined}
      />
    ) : null;
  } else if (view.kind === "program") {
    const program = settings.programs.find((p) => p.id === view.id);
    body = program ? (
      <ProgramEditor
        key={program.id}
        program={program}
        custom={custom}
        defaultRest={settings.restSec}
        isActive={settings.activeProgramId === program.id}
        onChange={saveProgram}
        onMakeActive={() => setActiveProgram(program.id)}
        onDelete={() => deleteProgram(program.id)}
        onBack={goHome}
        onAddCustom={addCustom}
      />
    ) : null;
  } else if (view.kind === "edit") {
    const w = workouts.find((x) => x.id === view.workoutId);
    body = w ? (
      <WorkoutLogger
        key={w.id}
        workout={w}
        workouts={workouts}
        unit={unit}
        settings={settings}
        mode="edit"
        saveError={saveError}
        onChange={(next) => onSaveWorkout(next).catch(() => {})}
        onFinish={saveEdit}
        onDiscard={async () => {
          await onDeleteWorkout(w.id);
          goHome();
        }}
        onOpenExercise={(id) => setView({ kind: "exercise", id })}
        onAddCustom={addCustom}
        onSetDone={() => {}}
      />
    ) : null;
  }

  if (!body && active) {
    body = (
      <WorkoutLogger
        key={active.id}
        workout={active}
        workouts={workouts}
        unit={unit}
        settings={settings}
        mode="live"
        saveError={saveError}
        onChange={(next) => onSaveWorkout(next).catch(() => {})}
        onFinish={finish}
        onDiscard={async () => {
          rest.skip();
          await onDeleteWorkout(active.id);
        }}
        onOpenExercise={(id) => setView({ kind: "exercise", id })}
        onAddCustom={addCustom}
        onSetDone={(e, sec) => rest.start(sec, e.name)}
      />
    );
  }

  if (!body) {
    const activeProgram = settings.programs.find((p) => p.id === settings.activeProgramId) ?? settings.programs[0] ?? null;
    body = (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-5">
          {finished ? (
            <FinishedCard
              workout={finished}
              unit={unit}
              records={records.get(finished.id) ?? []}
              ticked={habits.some((h) => h.link === "workout")}
              onClose={() => setFinishedId(null)}
            />
          ) : null}
          <TodayCard
            settings={settings}
            program={activeProgram}
            workouts={workouts}
            onPickProgram={setActiveProgram}
            onStart={start}
            onAddProgram={addProgram}
            onRestChange={(restSec) => onSettingsChange((s) => ({ ...s, restSec }))}
          />
          {settings.programs.length > 0 ? (
            <ProgramsCard
              settings={settings}
              onEdit={(id) => setView({ kind: "program", id })}
              onMakeActive={setActiveProgram}
              onAdd={addProgram}
            />
          ) : null}
        </div>
        <div className="space-y-5">
          <RecentWorkoutsCard
            workouts={workouts}
            unit={unit}
            records={records}
            onEdit={(id) => setView({ kind: "edit", workoutId: id })}
            onDelete={onDeleteWorkout}
          />
          <ExerciseLibraryCard
            custom={custom}
            workouts={workouts}
            unit={unit}
            onOpen={(id) => setView({ kind: "exercise", id })}
            onAddCustom={addCustom}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={cn(rest.timer && "pb-40")}>
      {body}
      <RestTimerBar
        rest={rest}
        onPreset={(sec) => {
          // The chosen length sticks for the rest of this exercise's sets.
          if (!active || !rest.timer) return;
          const label = rest.timer.label;
          onSaveWorkout({
            ...active,
            exercises: active.exercises.map((e) => (e.name === label ? { ...e, restSec: sec } : e)),
          }).catch(() => {});
        }}
      />
    </div>
  );
}

/* ================================ cards ================================ */

function TodayCard({
  settings,
  program,
  workouts,
  onPickProgram,
  onStart,
  onAddProgram,
  onRestChange,
}: {
  settings: TrainingSettings;
  program: Program | null;
  workouts: readonly Workout[];
  onPickProgram: (id: string) => void;
  onStart: (program: Program | null, day: ProgramDay | null) => void;
  onAddProgram: (template: ProgramTemplate | null) => void;
  onRestChange: (sec: number) => void;
}) {
  const next = program ? nextProgramDay(program, workouts) : null;
  const custom = settings.customExercises;

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-primary" />
          Today&apos;s workout
        </CardTitle>
        <CardDescription>
          {program ? "Start the next day in your program, or pick another." : "Pick a program to get started, or log a workout as you go."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!program ? (
          <>
            <ul className="space-y-2">
              {TEMPLATES.map((t) => (
                <li key={t.id} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.summary}</p>
                    </div>
                    <Button size="sm" className="shrink-0" onClick={() => onAddProgram(t)}>
                      Use this
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t.days.map((d) => d.name).join(" · ")}</p>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onAddProgram(null)}>
                <Pencil />
                Build my own
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onStart(null, null)}>
                <Play />
                Empty workout
              </Button>
            </div>
          </>
        ) : (
          <>
            {settings.programs.length > 1 ? (
              <Select value={program.id} onValueChange={onPickProgram}>
                <SelectTrigger aria-label="Program">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {settings.programs.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">
                Program: <span className="font-medium text-foreground">{program.name}</span>
              </p>
            )}

            {next ? (
              <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-primary">Next up</p>
                  <p className="text-[11px] text-muted-foreground">
                    Day {program.days.findIndex((d) => d.id === next.id) + 1} of {program.days.length}
                  </p>
                </div>
                <p className="text-lg font-semibold leading-tight">{next.name}</p>
                {next.exercises.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {next.exercises.map((pe, i) => (
                      <li key={`${pe.exerciseId}-${i}`} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate">{findExercise(pe.exerciseId, custom)?.name ?? "Deleted exercise"}</span>
                        <span className="tabular shrink-0 text-muted-foreground">{formatTarget(pe)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No exercises in this day yet — add them as you go, or edit the program.</p>
                )}
                <Button className="w-full" onClick={() => onStart(program, next)}>
                  <Play />
                  Start {next.name}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">This program has no days yet. Edit it to add some.</p>
            )}

            {program.days.length > 1 ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Or start a different day</p>
                <div className="flex flex-wrap gap-1.5">
                  {program.days
                    .filter((d) => d.id !== next?.id)
                    .map((d) => (
                      <Button key={d.id} variant="outline" size="sm" onClick={() => onStart(program, d)}>
                        {d.name}
                      </Button>
                    ))}
                </div>
              </div>
            ) : null}
            <Button variant="ghost" size="sm" className="-ml-2" onClick={() => onStart(null, null)}>
              <Plus />
              Empty workout
            </Button>
          </>
        )}

        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-xs font-medium">Default rest between sets</p>
          <SegmentedControl
            ariaLabel="Default rest between sets"
            size="sm"
            value={String(settings.restSec)}
            onValueChange={(v) => onRestChange(Number(v))}
            options={[
              ...REST_PRESETS.map((s) => ({ value: String(s), label: formatRest(s) })),
              ...((REST_PRESETS as readonly number[]).includes(settings.restSec)
                ? []
                : [{ value: String(settings.restSec), label: formatRest(settings.restSec) }]),
            ]}
          />
          <p className="text-[11px] text-muted-foreground">
            The timer starts when you tick off a set. Program exercises can set their own rest.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgramsCard({
  settings,
  onEdit,
  onMakeActive,
  onAdd,
}: {
  settings: TrainingSettings;
  onEdit: (id: string) => void;
  onMakeActive: (id: string) => void;
  onAdd: (template: ProgramTemplate | null) => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const full = settings.programs.length >= MAX_PROGRAMS;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListOrdered className="h-4 w-4 text-primary" />
          Programs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y divide-border rounded-md border border-border">
          {settings.programs.map((p) => {
            const isActive = p.id === settings.activeProgramId;
            return (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {p.name}
                    {isActive ? (
                      <Badge variant="success" className="px-1.5 py-0 text-[10px]">
                        Active
                      </Badge>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.days.length} day{p.days.length === 1 ? "" : "s"} · {p.days.map((d) => d.name).join(", ")}
                  </p>
                </div>
                {!isActive ? (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onMakeActive(p.id)} aria-label={`Make ${p.name} active`} title="Make active">
                    <Star />
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" className="h-8" onClick={() => onEdit(p.id)}>
                  <Pencil />
                  Edit
                </Button>
              </li>
            );
          })}
        </ul>
        {adding ? (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">New program</p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAdding(false)} aria-label="Close">
                <X />
              </Button>
            </div>
            {TEMPLATES.map((t) => (
              <Button
                key={t.id}
                variant="outline"
                size="sm"
                className="h-auto w-full justify-start py-2 text-left"
                onClick={() => {
                  onAdd(t);
                  setAdding(false);
                }}
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{t.name}</span>
                  <span className="block whitespace-normal font-normal text-muted-foreground">{t.days.length} days · {t.days.map((d) => d.name).join(", ")}</span>
                </span>
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => onAdd(null)}>
              <Pencil />
              Build my own from scratch
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="-ml-2" disabled={full} onClick={() => setAdding(true)}>
            <Plus />
            {full ? `Up to ${MAX_PROGRAMS} programs` : "Add a program"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function FinishedCard({
  workout,
  unit,
  records,
  ticked,
  onClose,
}: {
  workout: Workout;
  unit: WeightUnit;
  records: string[];
  /** Whether "Completed workout" was ticked on the Check-in scorecard. */
  ticked: boolean;
  onClose: () => void;
}) {
  const s = summarizeWorkout(workout);
  return (
    <Card className="border-success/50 bg-success/[0.06]">
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-success">
            <Check className="h-5 w-5" />
            Workout complete
          </CardTitle>
          <Button variant="ghost" size="icon" className="-mr-2 -mt-1 h-8 w-8" onClick={onClose} aria-label="Dismiss">
            <X />
          </Button>
        </div>
        <CardDescription>
          {workout.name}
          {ticked ? " · ticked off on your Check-in scorecard." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="tabular grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md bg-background/60 p-2">
            <dt className="text-[11px] text-muted-foreground">Time</dt>
            <dd className="text-sm font-semibold">{s.durationMs === null ? "—" : formatDuration(s.durationMs)}</dd>
          </div>
          <div className="rounded-md bg-background/60 p-2">
            <dt className="text-[11px] text-muted-foreground">Sets</dt>
            <dd className="text-sm font-semibold">{s.sets}</dd>
          </div>
          <div className="rounded-md bg-background/60 p-2">
            <dt className="text-[11px] text-muted-foreground">{s.volume > 0 ? "Lifted" : "Reps"}</dt>
            <dd className="text-sm font-semibold">{s.volume > 0 ? formatWork(s, unit) : s.reps}</dd>
          </div>
        </dl>
        {records.length > 0 ? (
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
              <Trophy className="h-4 w-4" />
              {records.length === 1 ? "New personal record" : `${records.length} new personal records`}
            </p>
            <p className="text-xs text-muted-foreground">{records.join(", ")}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

const PAGE = 8;

function RecentWorkoutsCard({
  workouts,
  unit,
  records,
  onEdit,
  onDelete,
}: {
  workouts: readonly Workout[];
  unit: WeightUnit;
  records: Map<string, string[]>;
  onEdit: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [shown, setShown] = React.useState(PAGE);
  const [open, setOpen] = React.useState<string | null>(null);
  const active = activeWorkout(workouts);
  const list = [...workouts].filter((w) => w.id !== active?.id).reverse();
  const thisWeek = workouts.filter((w) => w.finishedAt !== null && Date.now() - w.startedAt < 7 * 86_400_000).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Recent workouts
        </CardTitle>
        <CardDescription>
          {list.length === 0
            ? "Your finished workouts show up here."
            : `${thisWeek} in the last 7 days · ${list.length} logged in total.`}
        </CardDescription>
      </CardHeader>
      {list.length > 0 ? (
        <CardContent className="space-y-2">
          <ul className="divide-y divide-border rounded-md border border-border">
            {list.slice(0, shown).map((w) => {
              const s = summarizeWorkout(w);
              const prs = records.get(w.id) ?? [];
              const expanded = open === w.id;
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : w.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <span className="flex w-11 shrink-0 flex-col items-center rounded-md bg-muted/60 py-1 text-center leading-tight">
                      <CalendarDays className="mb-0.5 h-3 w-3 text-muted-foreground" aria-hidden />
                      <span className="tabular text-[11px] font-semibold">{formatShort(w.date)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{w.name}</span>
                        {w.finishedAt === null ? (
                          <Badge variant="warning" className="px-1.5 py-0 text-[10px]">
                            Unfinished
                          </Badge>
                        ) : null}
                        {prs.length > 0 ? (
                          <Badge variant="default" className="px-1.5 py-0 text-[10px]">
                            <Trophy />
                            {prs.length} PR{prs.length === 1 ? "" : "s"}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="tabular block truncate text-xs text-muted-foreground">
                        {s.exercises} exercise{s.exercises === 1 ? "" : "s"} · {s.sets} set{s.sets === 1 ? "" : "s"}
                        {s.durationMs ? ` · ${formatDuration(s.durationMs)}` : ""} · {formatWork(s, unit)}
                      </span>
                    </span>
                    {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </button>
                  {expanded ? (
                    <div className="space-y-2 border-t border-border bg-muted/20 px-3 py-2.5">
                      <ul className="space-y-1.5">
                        {w.exercises.map((e, i) => (
                          <li key={`${e.exerciseId}-${i}`} className="text-sm">
                            <span className="font-medium">{e.name}</span>
                            <span className="tabular block text-xs text-muted-foreground">
                              {doneSets(e).map((x) => formatSet(x, unit, e.bodyweight)).join(" · ") || "no completed sets"}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {w.note ? <p className="text-xs italic text-muted-foreground">“{w.note}”</p> : null}
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => onEdit(w.id)}>
                          <Pencil />
                          Edit
                        </Button>
                        <ConfirmButton label="Delete" icon={<Trash2 />} confirmLabel="Delete workout" onConfirm={() => onDelete(w.id)} />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {list.length > shown ? (
            <Button variant="ghost" size="sm" onClick={() => setShown((n) => n + PAGE)}>
              Show more
            </Button>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
