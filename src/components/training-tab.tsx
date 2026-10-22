"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CloudOff,
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
import { AdvancedFold } from "@/components/ui/advanced-fold";
import { MuscleVolumeCard } from "@/components/muscle-volume-card";
import { underTrained, weeklySets } from "@/lib/muscle-volume";
import { MUSCLE_LABELS } from "@/lib/exercises";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmButton } from "@/components/confirm-button";
import { ExerciseLibraryCard } from "@/components/exercise-library";
import { FormChecksCard } from "@/components/form-checks";
import { PlateCalculatorCard } from "@/components/plate-calculator";
import { ProgramCalendar } from "@/components/program-calendar";
import { NUDGE_IDLE_MIN, NUDGE_REPEAT_MIN } from "@/lib/workout-nudge";
import { ExerciseThumb } from "@/components/exercise-art";
import { LiftProgressCard } from "@/components/lift-progress";
import { planToday, scheduleEnd, sessionStates } from "@/lib/program-schedule";
import { WEEKDAY_LETTER, WEEKDAY_SHORT } from "@/lib/weekday-pattern";
import type { NotificationStatus } from "@/components/fasting-card";
import { ExerciseProgress } from "@/components/exercise-progress";
import { ProgramEditor } from "@/components/program-editor";
import { RestTimerBar, useRestTimer } from "@/components/rest-timer";
import { WorkoutLogger } from "@/components/workout-logger";
import { addDays, daysBetween, formatShort } from "@/lib/dates";
import type { Exercise } from "@/lib/exercises";
import { REST_KEY, weekStartOf, type HabitDef, type HabitLog } from "@/lib/habits";
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
  formatSetEffort,
  formatTarget,
  formatWork,
  isRecordSession,
  nextProgramDay,
  programFromTemplate,
  summarizeWorkout,
  createWorkout,
  swapInProgram,
  type Program,
  type ProgramDay,
  type ProgramTemplate,
  type TrainingSettings,
  type Workout,
} from "@/lib/training";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
  /** Whether form checks (Whop, inside a community) work here. */
  formCheckAvailability: NotificationStatus["availability"];
  /** Workout changes saved on this phone, waiting for signal to upload. */
  unsyncedWorkouts: number;
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
  formCheckAvailability,
  unsyncedWorkouts,
}: TrainingTabProps) {
  const [view, setView] = React.useState<View>({ kind: "home" });
  // An exercise to ask for a form check on, from its page.
  const [askFor, setAskFor] = React.useState<string | null>(null);
  const clearAskFor = React.useCallback(() => setAskFor(null), []);
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
  const swapInMyProgram = (programId: string, dayId: string, fromId: string, toId: string) =>
    onSettingsChange((s) => swapInProgram(s, programId, dayId, fromId, toId));

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
  // Workouts (log, programs, library) or Program (the coach's plan on a calendar).
  const [section, setSection] = React.useState<"workouts" | "program" | "tools">("workouts");
  // Tools: the tile whose card is open below the plate calculator.
  const [toolPanel, setToolPanel] = React.useState<"form" | "muscles" | null>(null);

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
        backLabel={section === "tools" ? "Back to tools" : active ? "Back to workout" : "Back to training"}
        onSaveCustom={ex.custom && findExercise(ex.id, custom) ? addCustom : undefined}
        onDeleteCustom={ex.custom && findExercise(ex.id, custom) ? () => deleteCustom(ex.id) : undefined}
        onFormCheck={
          formCheckAvailability === "ok" && !active && findExercise(ex.id, custom)
            ? () => {
                setAskFor(ex.id);
                setSection("tools");
                goHome();
              }
            : undefined
        }
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
        pendingUploads={unsyncedWorkouts}
        onChange={(next) => onSaveWorkout(next).catch(() => {})}
        onFinish={saveEdit}
        onDiscard={async () => {
          await onDeleteWorkout(w.id);
          goHome();
        }}
        onOpenExercise={(id) => setView({ kind: "exercise", id })}
        onAddCustom={addCustom}
        onSetDone={() => {}}
        onSwapInProgram={swapInMyProgram}
      />
    ) : null;
  }

  if (!body && section === "program") {
    const activeProgram = settings.programs.find((p) => p.id === settings.activeProgramId) ?? null;
    body = (
      <div className="space-y-5">
        {activeProgram ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2 lg:items-start">
            <ActiveProgramCard program={activeProgram} workouts={workouts} today={today} />
            <ProgramDayCards program={activeProgram} custom={custom} onEdit={() => setView({ kind: "program", id: activeProgram.id })} />
          </div>
        ) : null}
        <ProgramCalendar
          settings={settings}
          workouts={workouts}
          today={today}
          live={active}
          onStart={(p, d) => {
            setSection("workouts");
            start(p, d);
          }}
          onMakeActive={setActiveProgram}
          onResume={() => setSection("workouts")}
        />
        <div className="lg:max-w-xl">
          <ProgramsCard
            settings={settings}
            onEdit={(id) => setView({ kind: "program", id })}
            onMakeActive={setActiveProgram}
            onAdd={addProgram}
          />
        </div>
      </div>
    );
  }

  if (!body && section === "tools") {
    const panel = askFor ? "form" : toolPanel;
    body = (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-5">
          <PlateCalculatorCard unit={unit} />
          <ToolTiles
            open={panel}
            onOpen={(p) => setToolPanel((cur) => (cur === p ? null : p))}
            workouts={workouts}
            custom={custom}
            today={today}
          />
          {panel === "form" ? (
            <FormChecksCard
              availability={formCheckAvailability}
              custom={custom}
              onAddCustom={addCustom}
              askFor={askFor}
              onAskForHandled={clearAskFor}
            />
          ) : null}
          {panel === "muscles" ? <MuscleVolumeCard workouts={workouts} customExercises={custom} today={today} /> : null}
        </div>
        <div className="space-y-5">
          <LiftProgressCard workouts={workouts} custom={custom} unit={unit} onOpen={(id) => setView({ kind: "exercise", id })} />
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
        pendingUploads={unsyncedWorkouts}
        onChange={(next) => onSaveWorkout(next).catch(() => {})}
        onFinish={finish}
        onDiscard={async () => {
          rest.skip();
          await onDeleteWorkout(active.id);
        }}
        onOpenExercise={(id) => setView({ kind: "exercise", id })}
        onAddCustom={addCustom}
        onSetDone={(e, sec) => rest.start(sec, e.name)}
        onSwapInProgram={swapInMyProgram}
      />
    );
  }

  if (!body) {
    const activeProgram = settings.programs.find((p) => p.id === settings.activeProgramId) ?? settings.programs[0] ?? null;
    body = (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
        {unsyncedWorkouts > 0 || saveError ? (
          <div className="lg:col-span-2">
            <SyncNotice waiting={unsyncedWorkouts} error={saveError} />
          </div>
        ) : null}
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
            today={today}
            onShowPlan={() => setSection("program")}
            onPickProgram={setActiveProgram}
            onStart={start}
            onAddProgram={addProgram}
          />
          <div className="max-lg:hidden">
            <WorkoutSettingsCard
              settings={settings}
              onRestChange={(restSec) => onSettingsChange((s) => ({ ...s, restSec }))}
              onTrackRirChange={(trackRir) => onSettingsChange((s) => ({ ...s, trackRir }))}
              onFinishRemindersChange={(finishReminders) => onSettingsChange((s) => ({ ...s, finishReminders }))}
            />
          </div>
        </div>
        <div className="space-y-5">
          <WeekTiles workouts={workouts} records={records} unit={unit} today={today} />
          <RecentWorkoutsCard
            workouts={workouts}
            unit={unit}
            records={records}
            onEdit={(id) => setView({ kind: "edit", workoutId: id })}
            onDelete={onDeleteWorkout}
          />
          {/* On a phone the settings come last, under Recent. */}
          <div className="lg:hidden">
            <WorkoutSettingsCard
              settings={settings}
              onRestChange={(restSec) => onSettingsChange((s) => ({ ...s, restSec }))}
              onTrackRirChange={(trackRir) => onSettingsChange((s) => ({ ...s, trackRir }))}
              onFinishRemindersChange={(finishReminders) => onSettingsChange((s) => ({ ...s, finishReminders }))}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(rest.timer && "pb-40")}>
      {view.kind === "home" && !(active && section === "workouts") ? (
        <h2 className="mb-3 text-[1.625rem] font-extrabold leading-tight tracking-tight">Training</h2>
      ) : null}
      {view.kind === "home" ? (
        <SegmentedControl
          ariaLabel="Training section"
          value={section}
          onValueChange={setSection}
          options={[
            { value: "workouts" as const, label: "Workouts" },
            { value: "program" as const, label: "Programs" },
            { value: "tools" as const, label: "Tools" },
          ]}
          className="mb-5 max-w-sm"
        />
      ) : null}
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

/** Workouts kept on this phone until there's signal, or a save the server refused. */
function SyncNotice({ waiting, error }: { waiting: number; error: string | null }) {
  return (
    <p
      role="status"
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
        error ? "border-destructive/50 text-destructive" : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        {error ??
          (waiting === 1
            ? "Your latest workout change is saved on this phone. It'll upload as soon as you're back online, even if you close the app."
            : `${waiting} workout changes are saved on this phone. They'll upload as soon as you're back online, even if you close the app.`)}
      </span>
    </p>
  );
}

/* ================================ cards ================================ */

function TodayCard({
  settings,
  program,
  workouts,
  today,
  onShowPlan,
  onPickProgram,
  onStart,
  onAddProgram,
}: {
  settings: TrainingSettings;
  program: Program | null;
  workouts: readonly Workout[];
  today: string;
  onShowPlan: () => void;
  onPickProgram: (id: string) => void;
  onStart: (program: Program | null, day: ProgramDay | null) => void;
  onAddProgram: (template: ProgramTemplate | null) => void;
}) {
  // A program on a calendar: today's planned workout (or the next one) comes first.
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
        : plan?.kind === "done-today"
          ? plan.next
            ? `Done for today · next on ${formatShort(plan.next.date)}`
            : "Done for today"
          : plan?.kind === "not-started"
            ? `Plan starts ${formatShort(plan.next.date)}`
            : null;
  const custom = settings.customExercises;
  const dayNo = program && next ? program.days.findIndex((d) => d.id === next.id) + 1 : 0;
  const minutes = next ? estimateMinutes(next, settings.restSec) : 0;

  if (!program) {
    return (
      <Card className="border-primary/30 shadow-[0_18px_40px_rgba(0,0,0,0.4)]">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary">Today&apos;s workout</p>
          <p className="text-2xl font-extrabold tracking-tight">Pick a program</p>
          <p className="text-sm text-muted-foreground">Start from a template, or log a workout as you go.</p>
          <ul className="space-y-2">
            {TEMPLATES.map((t) => (
              <li key={t.id} className="space-y-2 rounded-2xl border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.summary}</p>
                  </div>
                  <Button size="sm" className="shrink-0" onClick={() => onAddProgram(t)}>
                    Use this
                  </Button>
                </div>
                <p className="text-[12px] text-muted-foreground">{t.days.map((d) => d.name).join(" · ")}</p>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => onStart(null, null)}>
            <Play />
            Empty workout
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/30 shadow-[0_18px_40px_rgba(0,0,0,0.4)]">
      <CardContent className="space-y-2 p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.1em] text-primary">
            {program.name}
            {next && dayNo > 0 ? ` · day ${dayNo} of ${program.days.length}` : ""}
          </p>
          {minutes > 0 ? <span className="tabular shrink-0 text-xs text-muted-foreground">~{minutes} min</span> : null}
        </div>
        {next ? (
          <>
            <p className="text-[1.875rem] font-extrabold leading-tight tracking-tight">{next.name}</p>
            {heading ? (
              <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                {heading}
                {plan ? (
                  <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={onShowPlan}>
                    See the plan
                  </button>
                ) : null}
              </p>
            ) : null}
            {next.exercises.length > 0 ? (
              <ul className="text-[13px]">
                {next.exercises.map((pe, i) => (
                  <li key={`${pe.exerciseId}-${i}`} className="flex items-center gap-2.5 border-t border-primary/[0.08] py-1.5">
                    <ExerciseThumb exerciseId={pe.exerciseId} className="h-6 w-6" />
                    <span className="min-w-0 flex-1 truncate">{findExercise(pe.exerciseId, custom)?.name ?? "Deleted exercise"}</span>
                    <span className="tabular shrink-0 text-foreground/80">{formatTarget(pe)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No exercises in this day yet — add them as you go, or edit the program.</p>
            )}
            <Button className="h-[3.25rem] w-full text-base" onClick={() => onStart(program, next)}>
              <Play />
              Start {next.name}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">This program has no days yet. Edit it to add some.</p>
        )}

        <div className="space-y-2 border-t border-primary/[0.08] pt-3">
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
          ) : null}
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
        </div>
      </CardContent>
    </Card>
  );
}

/** Roughly how long a day takes: each set about 45 s of work plus its rest. */
function estimateMinutes(day: ProgramDay, defaultRest: number): number {
  const sec = day.exercises.reduce((n, pe) => n + pe.sets * (45 + (pe.restSec ?? defaultRest)), 0);
  return sec > 0 ? Math.max(5, Math.round(sec / 60 / 5) * 5) : 0;
}

/** Rest between sets, reps in reserve and the finish reminder, folded away. */
function WorkoutSettingsCard({
  settings,
  onRestChange,
  onTrackRirChange,
  onFinishRemindersChange,
}: {
  settings: TrainingSettings;
  onRestChange: (sec: number) => void;
  onTrackRirChange: (on: boolean) => void;
  onFinishRemindersChange: (on: boolean) => void;
}) {
  const rirId = React.useId();
  const finishId = React.useId();
  return (
    <Card>
      <CardContent className="p-4 pt-1 sm:p-5 sm:pt-2">
        <AdvancedFold title="Workout settings" hint="Rest timer, reps left, finish reminder">
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
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
              <p className="text-[12px] text-muted-foreground">
                The timer starts when you tick off a set. Program exercises can set their own rest.
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <label htmlFor={rirId} className="min-w-0 flex-1 text-xs font-medium">
                  Ask how many reps were left after each set
                </label>
                <Switch id={rirId} checked={settings.trackRir} onCheckedChange={onTrackRirChange} />
              </div>
              <p className="text-[12px] text-muted-foreground">
                Reps in reserve: 0 means all out. It makes the &ldquo;add weight&rdquo; suggestions smarter: easy sets move you up
                faster, all-out ones hold the weight.
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <label htmlFor={finishId} className="min-w-0 flex-1 text-xs font-medium">
                  Remind me to finish my workout
                </label>
                <Switch id={finishId} checked={settings.finishReminders} onCheckedChange={onFinishRemindersChange} />
              </div>
              <p className="text-[12px] text-muted-foreground">
                If a workout is open with nothing logged for {NUDGE_IDLE_MIN} minutes, you get a notification asking if you&apos;re
                done, then one every {NUDGE_REPEAT_MIN} minutes until you tap Finish (up to an hour).
              </p>
            </div>
          </div>
        </AdvancedFold>
      </CardContent>
    </Card>
  );
}

/** This week in three numbers: workouts finished, weight lifted, records set. */
function WeekTiles({ workouts, records, unit, today }: { workouts: readonly Workout[]; records: Map<string, string[]>; unit: WeightUnit; today: string }) {
  const week = weekStartOf(today);
  const done = workouts.filter((w) => w.finishedAt !== null && w.date >= week && w.date <= today);
  const volume = done.reduce((n, w) => n + summarizeWorkout(w).volume, 0);
  const prs = done.reduce((n, w) => n + (records.get(w.id)?.length ?? 0), 0);
  const lifted = fromLb(volume, unit);
  const liftedText = lifted >= 10_000 ? `${Math.round(lifted / 100) / 10}k` : Math.round(lifted).toLocaleString();
  const tile = "molten-card flex flex-col items-center rounded-[1.375rem] border border-primary/15 bg-card px-2 py-3 text-center";
  return (
    <section aria-label="This week" className="grid grid-cols-3 gap-2">
      <div className={tile}>
        <span className="tabular text-[1.375rem] font-extrabold leading-tight tracking-tight text-[hsl(var(--gold-hi))]">{done.length}</span>
        <span className="text-xs text-muted-foreground">this week</span>
      </div>
      <div className={tile}>
        <span className="tabular text-[1.375rem] font-extrabold leading-tight tracking-tight">{liftedText}</span>
        <span className="text-xs text-muted-foreground">{unit} lifted</span>
      </div>
      <div className={tile}>
        <span className="tabular text-[1.375rem] font-extrabold leading-tight tracking-tight text-success">{prs}</span>
        <span className="text-xs text-muted-foreground">{prs === 1 ? "PR" : "PRs"}</span>
      </div>
    </section>
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
          Your programs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {settings.programs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No programs yet. Build your own, or start from a template.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {settings.programs.map((p) => {
              const isActive = p.id === settings.activeProgramId;
              return (
                <li key={p.id} className="flex items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      {p.name}
                      {isActive ? (
                        <Badge variant="success" className="px-1.5 py-0 text-[11px]">
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
        )}
        {adding ? (
          <div className="space-y-2 rounded-2xl border border-dashed border-primary/45 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">New program</p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAdding(false)} aria-label="Close">
                <X />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                onAdd(null);
                setAdding(false);
              }}
            >
              <Pencil />
              Build my own
            </Button>
            <p className="pt-1 text-xs text-muted-foreground">Or start from a template</p>
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
          </div>
        ) : full ? (
          <p className="text-xs text-muted-foreground">Up to {MAX_PROGRAMS} programs. Delete one to add another.</p>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-[2.875rem] w-full items-center justify-center gap-1.5 rounded-full border border-dashed border-primary/45 text-sm font-bold text-[hsl(var(--gold-hi))] transition-colors hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" />
            New program
          </button>
        )}
      </CardContent>
    </Card>
  );
}

/** Training → Tools: Form check and Sets per muscle, each opening its card. */
function ToolTiles({
  open,
  onOpen,
  workouts,
  custom,
  today,
}: {
  open: "form" | "muscles" | null;
  onOpen: (p: "form" | "muscles") => void;
  workouts: readonly Workout[];
  custom: readonly Exercise[];
  today: string;
}) {
  // A finished week only: midweek, low numbers are just the week so far.
  const low = React.useMemo(() => {
    const last = addDays(weekStartOf(today), -7);
    return underTrained(weeklySets(workouts.filter((w) => w.finishedAt !== null), last, custom));
  }, [workouts, custom, today]);
  const tile = (on: boolean) =>
    cn(
      "molten-card flex flex-col items-start gap-0.5 rounded-[1.375rem] border bg-card p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      on ? "border-primary/45" : "border-primary/15 hover:border-primary/30",
    );
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" aria-expanded={open === "form"} onClick={() => onOpen("form")} className={tile(open === "form")}>
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary">Form check</span>
        <span className="font-bold">Film a set</span>
        <span className="text-xs text-muted-foreground">Get cues on a lift</span>
      </button>
      <button type="button" aria-expanded={open === "muscles"} onClick={() => onOpen("muscles")} className={tile(open === "muscles")}>
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary">Sets per muscle</span>
        <span className="font-bold">Each week</span>
        <span className="text-xs text-muted-foreground">
          {low.length === 0 ? "Every muscle on target" : `${MUSCLE_LABELS[low[0]!]}${low.length > 1 ? ` +${low.length - 1}` : ""} under target`}
        </span>
      </button>
    </div>
  );
}

/** "Upper A" → "UA", "Push" → "PU": a day's badge on the program pages. */
function dayCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** The active program: where it's from, how far in, and this week day by day. */
function ActiveProgramCard({ program, workouts, today }: { program: Program; workouts: readonly Workout[]; today: string }) {
  const schedule = program.schedule;
  const fromCoach = program.id.startsWith("coach_");
  const week = weekStartOf(today);
  const states = React.useMemo(() => (schedule ? sessionStates(program, workouts, today) : []), [program, schedule, workouts, today]);
  const byDate = new Map(states.map((s) => [s.date, s]));
  const end = scheduleEnd(program);
  const weekNo = schedule ? Math.floor(daysBetween(schedule.startDate, today) / 7) + 1 : 0;
  const next = schedule ? null : nextProgramDay(program, workouts);
  const subtitle = schedule
    ? today < schedule.startDate
      ? `${schedule.weekdays.length} days a week · starts ${formatShort(schedule.startDate)}`
      : end && today > end
        ? `${schedule.weekdays.length} days a week · finished ${formatShort(end)}`
        : `${schedule.weekdays.length} days a week · week ${weekNo} of ${schedule.weeks}`
    : `${program.days.length} ${program.days.length === 1 ? "day" : "days"} in turn${next ? ` · next: ${next.name}` : ""}`;
  return (
    <Card className="border-primary/35 shadow-[0_18px_40px_rgba(0,0,0,0.4)]">
      <CardContent className="space-y-2 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary">Active</span>
          {fromCoach ? (
            <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-bold text-success">From your coach</span>
          ) : null}
        </div>
        <p className="text-[1.375rem] font-extrabold leading-tight tracking-tight">{program.name}</p>
        <p className="tabular text-xs text-muted-foreground">{subtitle}</p>
        {schedule ? (
          <div className="grid grid-cols-7 gap-1 pt-1 text-center text-[11px]" role="list" aria-label="This week">
            {Array.from({ length: 7 }, (_, i) => {
              const date = addDays(week, i);
              const s = byDate.get(date);
              const isToday = date === today;
              return (
                <span
                  key={date}
                  role="listitem"
                  aria-label={`${WEEKDAY_SHORT[i]}: ${s ? `${s.day.name}${s.status === "done" ? ", done" : ""}` : "rest"}`}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-xl py-1.5 font-bold",
                    isToday
                      ? "bg-gradient-to-br from-[hsl(var(--gold-hi)/0.3)] to-primary/20"
                      : s
                        ? "bg-[hsl(var(--gold-hi)/0.07)]"
                        : "bg-[hsl(var(--gold-hi)/0.03)] text-muted-foreground",
                    s?.status === "done" && "text-success",
                  )}
                >
                  {WEEKDAY_LETTER[i]}
                  <span className="text-[10px] font-semibold">{s ? dayCode(s.day.name) : "Rest"}</span>
                </span>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** One card per day of the active program; any of them opens the editor. */
function ProgramDayCards({ program, custom, onEdit }: { program: Program; custom: readonly Exercise[]; onEdit: () => void }) {
  return (
    <ul className="space-y-2" aria-label={`${program.name} days`}>
      {program.days.map((d) => {
        const names = d.exercises.map((pe) => findExercise(pe.exerciseId, custom)?.name ?? "Exercise");
        return (
          <li key={d.id}>
            <button
              type="button"
              onClick={onEdit}
              aria-label={`${d.name}: edit the program`}
              className="molten-card flex w-full items-center gap-3 rounded-[1.375rem] border border-primary/15 bg-card p-3.5 text-left transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--gold-hi)/0.22)] to-primary/10 text-sm font-extrabold text-[hsl(var(--gold-hi))]">
                {dayCode(d.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-extrabold">{d.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {names.length === 0 ? "No exercises yet" : `${names.slice(0, 3).join(" · ")}${names.length > 3 ? ` +${names.length - 3}` : ""}`}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
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
            <dt className="text-[12px] text-muted-foreground">Time</dt>
            <dd className="text-sm font-semibold">{s.durationMs === null ? "—" : formatDuration(s.durationMs)}</dd>
          </div>
          <div className="rounded-md bg-background/60 p-2">
            <dt className="text-[12px] text-muted-foreground">Sets</dt>
            <dd className="text-sm font-semibold">{s.sets}</dd>
          </div>
          <div className="rounded-md bg-background/60 p-2">
            <dt className="text-[12px] text-muted-foreground">{s.volume > 0 ? "Lifted" : "Reps"}</dt>
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

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-primary">
          <History className="h-3.5 w-3.5" />
          Recent
        </CardTitle>
        <CardDescription className="tabular text-xs">
          {list.length === 0 ? "Finished workouts show up here." : `${list.length} logged`}
        </CardDescription>
      </CardHeader>
      {list.length > 0 ? (
        <CardContent className="space-y-2">
          <ul className="divide-y divide-primary/[0.08]">
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
                    className="flex w-full items-center gap-3 rounded-xl py-2 text-left hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <span
                      aria-label={formatShort(w.date)}
                      className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-[0.875rem] bg-[hsl(var(--gold-hi)/0.06)] text-center text-[11px] leading-tight"
                    >
                      <b className="tabular text-sm">{Number(w.date.slice(8))}</b>
                      {MONTH_SHORT[Number(w.date.slice(5, 7)) - 1]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold">{w.name}</span>
                        {w.finishedAt === null ? (
                          <Badge variant="warning" className="px-1.5 py-0 text-[11px]">
                            Unfinished
                          </Badge>
                        ) : null}
                      </span>
                      <span className="tabular block truncate text-xs text-muted-foreground">
                        {s.exercises} exercise{s.exercises === 1 ? "" : "s"} · {s.sets} set{s.sets === 1 ? "" : "s"}
                        {s.durationMs ? ` · ${formatDuration(s.durationMs)}` : ""} · {formatWork(s, unit)}
                      </span>
                    </span>
                    {prs.length > 0 ? (
                      <span className="shrink-0 rounded-full bg-gradient-to-br from-[hsl(var(--gold-hi))] to-[hsl(var(--gold-lo))] px-2.5 py-0.5 text-[11px] font-extrabold text-primary-foreground">
                        {prs.length === 1 ? "PR" : `${prs.length} PRs`}
                      </span>
                    ) : null}
                    {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </button>
                  {expanded ? (
                    <div className="space-y-2 rounded-xl bg-muted/20 px-3 py-2.5">
                      <ul className="space-y-1.5">
                        {w.exercises.map((e, i) => (
                          <li key={`${e.exerciseId}-${i}`} className="flex items-center gap-2.5 text-sm">
                            <ExerciseThumb exerciseId={e.exerciseId} className="h-8 w-8" />
                            <span className="min-w-0 flex-1">
                              <span className="font-medium">{e.name}</span>
                              <span className="tabular block text-xs text-muted-foreground">
                                {doneSets(e).map((x) => formatSetEffort(x, unit, e.bodyweight)).join(" · ") || "no completed sets"}
                              </span>
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
