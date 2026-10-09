"use client";

import * as React from "react";
import { ArrowLeftRight, CalendarDays, Check, ChevronLeft, ChevronRight, Play, Star, UserCheck, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExerciseThumb } from "@/components/exercise-art";
import { addMonths, formatLong, formatMonthYear, formatShort, monthGrid, monthKeyOf } from "@/lib/dates";
import {
  planToday,
  scheduleEnd,
  scheduleSummary,
  sessionStates,
  weekdayOf,
  type SessionState,
} from "@/lib/program-schedule";
import { findExercise, formatDuration, formatTarget, summarizeWorkout, type Program, type ProgramDay, type TrainingSettings, type Workout } from "@/lib/training";
import { WEEKDAY_LETTER, WEEKDAY_SHORT } from "@/lib/weekday-pattern";
import { cn } from "@/lib/utils";

const STATUS_CELL: Record<SessionState["status"], string> = {
  done: "border-success/50 bg-success/15 text-success",
  missed: "border-dashed border-muted-foreground/40 text-muted-foreground",
  today: "border-primary bg-primary/15 text-primary ring-2 ring-primary/40",
  upcoming: "border-primary/40 bg-primary/5 text-foreground",
};

const STATUS_TEXT: Record<SessionState["status"], string> = {
  done: "Done",
  missed: "Missed",
  today: "Today",
  upcoming: "Planned",
};

/** "Mon · Tue · Thu · Fri" */
const weekdaysText = (days: readonly number[]) => days.map((d) => WEEKDAY_SHORT[d]).join(" · ");
const isCoachProgram = (p: Program) => p.id.startsWith("coach_");

/** Training → Program: the coach's plan on a calendar. */
export function ProgramCalendar({
  settings,
  workouts,
  today,
  live,
  onStart,
  onMakeActive,
  onResume,
  onShowWorkouts,
}: {
  settings: TrainingSettings;
  workouts: readonly Workout[];
  today: string;
  /** A workout already in progress (starting another isn't offered). */
  live: Workout | null;
  onStart: (program: Program, day: ProgramDay) => void;
  onMakeActive: (id: string) => void;
  onResume: () => void;
  onShowWorkouts: () => void;
}) {
  const scheduled = settings.programs.filter((p) => p.schedule);
  const [chosenId, setChosenId] = React.useState<string | null>(null);
  const program =
    scheduled.find((p) => p.id === chosenId) ?? scheduled.find((p) => p.id === settings.activeProgramId) ?? scheduled[scheduled.length - 1] ?? null;

  if (!program || !program.schedule) {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <CalendarDays className="h-6 w-6 text-primary" />
          <div className="space-y-1">
            <p className="font-semibold">No program on your calendar yet</p>
            <p className="text-sm text-muted-foreground">
              When your coach assigns you a program with a schedule, every workout shows up here by date, so you know exactly
              what to do each day. Your own programs are under Workouts.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onShowWorkouts}>
            Go to Workouts
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <ScheduledProgram
      key={program.id}
      program={program}
      programs={scheduled}
      isActive={program.id === settings.activeProgramId}
      settings={settings}
      workouts={workouts}
      today={today}
      live={live}
      onChoose={setChosenId}
      onStart={onStart}
      onMakeActive={onMakeActive}
      onResume={onResume}
    />
  );
}

function ScheduledProgram({
  program,
  programs,
  isActive,
  settings,
  workouts,
  today,
  live,
  onChoose,
  onStart,
  onMakeActive,
  onResume,
}: {
  program: Program;
  programs: Program[];
  isActive: boolean;
  settings: TrainingSettings;
  workouts: readonly Workout[];
  today: string;
  live: Workout | null;
  onChoose: (id: string) => void;
  onStart: (program: Program, day: ProgramDay) => void;
  onMakeActive: (id: string) => void;
  onResume: () => void;
}) {
  const schedule = program.schedule!;
  const end = scheduleEnd(program)!;
  const states = React.useMemo(() => sessionStates(program, workouts, today), [program, workouts, today]);
  const byDate = React.useMemo(() => new Map(states.map((s) => [s.date, s])), [states]);
  // Workouts from this program done on days with no session of their own (none moved there).
  const extraDates = React.useMemo(() => {
    const counted = new Set(states.map((s) => s.workout?.id).filter(Boolean));
    return new Set(workouts.filter((w) => w.finishedAt !== null && w.programId === program.id && !counted.has(w.id)).map((w) => w.date));
  }, [states, workouts, program.id]);
  const summary = scheduleSummary(program, workouts, today);
  const plan = planToday(program, workouts, today);

  const firstMonth = monthKeyOf(schedule.startDate);
  const lastMonth = monthKeyOf(end);
  const startMonth = today < schedule.startDate ? firstMonth : today > end ? lastMonth : monthKeyOf(today);
  const [month, setMonth] = React.useState(startMonth);
  const defaultSelected = byDate.has(today) ? today : (states.find((s) => s.date >= today)?.date ?? states[states.length - 1]?.date ?? null);
  const [selected, setSelected] = React.useState<string | null>(defaultSelected);
  const selectedState = selected ? (byDate.get(selected) ?? null) : null;

  const rows: (string | null)[][] = [];
  const cells = monthGrid(month);
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const pct = summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      <div className="space-y-5">
        {/* ------------------------------ the plan ------------------------------ */}
        <Card>
          <CardHeader className="space-y-3 pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  {program.name}
                  {isCoachProgram(program) ? (
                    <Badge variant="secondary">
                      <UserCheck />
                      From your coach
                    </Badge>
                  ) : null}
                </CardTitle>
                <CardDescription className="tabular">
                  {weekdaysText(schedule.weekdays)} · {schedule.weeks} {schedule.weeks === 1 ? "week" : "weeks"} · {formatShort(schedule.startDate)} – {formatShort(end)}
                </CardDescription>
              </div>
              {isActive ? (
                <Badge variant="success">
                  <Check />
                  Active
                </Badge>
              ) : (
                <Button variant="outline" size="sm" onClick={() => onMakeActive(program.id)}>
                  <Star />
                  Make active
                </Button>
              )}
            </div>
            {programs.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                {programs.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onChoose(p.id)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      p.id === program.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            ) : null}
            {schedule.note ? <p className="whitespace-pre-line rounded-md bg-muted/40 px-3 py-2 text-xs italic">&ldquo;{schedule.note}&rdquo;</p> : null}
            <div className="space-y-1">
              <div className="tabular flex justify-between text-xs">
                <span className="font-medium">
                  {summary.done} of {summary.total} workouts done
                </span>
                <span className="text-muted-foreground">{summary.missed > 0 ? `${summary.missed} missed` : `${pct}%`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <TodayStrip plan={plan} live={live} program={program} onStart={onStart} onResume={onResume} />
          </CardContent>
        </Card>

        {/* ------------------------------ calendar ------------------------------ */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">{formatMonthYear(month)}</CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={month <= firstMonth} onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={month >= lastMonth} onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
                <ChevronRight />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div role="grid" aria-label={`${formatMonthYear(month)} training plan`} className="space-y-1">
              <div role="row" className="grid grid-cols-7 gap-1">
                {WEEKDAY_SHORT.map((label, i) => (
                  <div key={label} role="columnheader" aria-label={label} className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <span className="sm:hidden">{WEEKDAY_LETTER[i]}</span>
                    <span className="hidden sm:inline">{label}</span>
                  </div>
                ))}
              </div>
              {rows.map((row, r) => (
                <div key={r} role="row" className="grid grid-cols-7 gap-1">
                  {row.map((iso, c) => {
                    if (!iso) return <div key={c} role="gridcell" aria-hidden className="min-h-14 sm:min-h-20" />;
                    const s = byDate.get(iso);
                    const n = Number(iso.slice(8));
                    if (!s) {
                      const extra = extraDates.has(iso);
                      return (
                        <div
                          key={iso}
                          role="gridcell"
                          className={cn(
                            "min-h-14 rounded-md border border-transparent p-1 text-[11px] text-muted-foreground/50 sm:min-h-20 sm:p-1.5",
                            iso === today && "border-border text-foreground",
                          )}
                        >
                          {n}
                          {extra ? <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-success" title="Extra workout from this program" /> : null}
                        </div>
                      );
                    }
                    return (
                      <div key={iso} role="gridcell" aria-selected={iso === selected}>
                        <button
                          type="button"
                          onClick={() => setSelected(iso)}
                          aria-label={`${formatLong(iso)}: ${s.day.name}, ${STATUS_TEXT[s.status].toLowerCase()}`}
                          className={cn(
                            "flex min-h-14 w-full flex-col items-start gap-0.5 rounded-md border p-1 text-left sm:min-h-20 sm:p-1.5",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            STATUS_CELL[s.status],
                            iso === selected && "outline outline-2 outline-offset-1 outline-foreground/60",
                          )}
                        >
                          <span className="flex w-full items-center justify-between text-[11px] font-semibold">
                            {n}
                            {s.status === "done" ? (s.moved ? <ArrowLeftRight className="h-3 w-3" /> : <Check className="h-3 w-3" />) : s.status === "missed" ? <X className="h-3 w-3" /> : null}
                          </span>
                          <span className="line-clamp-2 text-[10px] font-medium leading-tight sm:text-[11px]">{s.day.name}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-success/50 bg-success/15" /> Done</span>
              <span className="flex items-center gap-1"><ArrowLeftRight className="h-3 w-3" /> Done on another day</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-primary bg-primary/15" /> Today</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-primary/40 bg-primary/5" /> Planned</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-muted-foreground/40" /> Missed</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------ the day ------------------------------ */}
      <SessionDetail
        session={selectedState}
        program={program}
        settings={settings}
        today={today}
        live={live}
        onStart={onStart}
        onResume={onResume}
      />
    </div>
  );
}

function TodayStrip({
  plan,
  live,
  program,
  onStart,
  onResume,
}: {
  plan: ReturnType<typeof planToday>;
  live: Workout | null;
  program: Program;
  onStart: (program: Program, day: ProgramDay) => void;
  onResume: () => void;
}) {
  if (live) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
        <p className="text-sm">
          <span className="font-semibold">{live.name}</span> is in progress.
        </p>
        <Button size="sm" onClick={onResume}>
          <Play />
          Resume
        </Button>
      </div>
    );
  }
  if (!plan) return null;
  const line = (label: string, text: string, day?: ProgramDay, startLabel?: string) => (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
      <p className="min-w-0 text-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-primary">{label}</span>
        <span className="block font-medium">{text}</span>
      </p>
      {day ? (
        <Button size="sm" onClick={() => onStart(program, day)}>
          <Play />
          {startLabel ?? `Start ${day.name}`}
        </Button>
      ) : null}
    </div>
  );
  switch (plan.kind) {
    case "today":
      return line("Today in your plan", plan.session.day.name, plan.session.day);
    case "done-today":
      return line("Done for today", plan.next ? `Next: ${formatShort(plan.next.date)} · ${plan.next.day.name}` : "That was the last one in this plan.");
    case "rest":
      return plan.next
        ? line("Rest day", `Next: ${WEEKDAY_SHORT[weekdayOf(plan.next.date)]}, ${formatShort(plan.next.date)} · ${plan.next.day.name}`, plan.next.day, "Do it today")
        : line("Rest day", "No more workouts in this plan.");
    case "not-started":
      return line("Starts soon", `${formatShort(plan.next.date)} · ${plan.next.day.name}`);
    case "finished":
      return line("Plan finished", `It ended ${formatShort(plan.end)}. Ask your coach what's next.`);
  }
}

function SessionDetail({
  session,
  program,
  settings,
  today,
  live,
  onStart,
  onResume,
}: {
  session: SessionState | null;
  program: Program;
  settings: TrainingSettings;
  today: string;
  live: Workout | null;
  onStart: (program: Program, day: ProgramDay) => void;
  onResume: () => void;
}) {
  if (!session) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">Tap a day on the calendar to see its workout.</CardContent>
      </Card>
    );
  }
  const s = session;
  const summary = s.workout ? summarizeWorkout(s.workout) : null;
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {formatLong(s.date)} · workout {s.index + 1}
        </p>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {s.day.name}
          <Badge variant={s.status === "done" ? "success" : s.status === "today" ? "default" : "secondary"}>{STATUS_TEXT[s.status]}</Badge>
        </CardTitle>
        {s.status === "done" && s.workout ? (
          <CardDescription className="tabular">
            {s.moved ? `Done ${formatShort(s.workout.date)} (moved) · ` : ""}
            {summary!.sets} sets{summary!.durationMs ? ` · ${formatDuration(summary!.durationMs)}` : ""}
          </CardDescription>
        ) : s.status === "missed" ? (
          <CardDescription>Not logged. Doing it within {3} days still counts for it.</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1 text-sm">
          {s.day.exercises.map((pe, i) => (
            <li key={`${pe.exerciseId}-${i}`} className="flex items-center gap-2.5">
              <ExerciseThumb exerciseId={pe.exerciseId} className="h-7 w-7" />
              <span className="min-w-0 flex-1 truncate">{findExercise(pe.exerciseId, settings.customExercises)?.name ?? "Exercise"}</span>
              <span className="tabular shrink-0 text-muted-foreground">{formatTarget(pe)}</span>
            </li>
          ))}
        </ul>
        {s.status !== "done" && s.date <= today ? (
          live ? (
            <Button variant="outline" className="w-full" onClick={onResume}>
              <Play />
              Resume {live.name} first
            </Button>
          ) : (
            <Button className="w-full" onClick={() => onStart(program, s.day)}>
              <Play />
              Start {s.day.name}
            </Button>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
