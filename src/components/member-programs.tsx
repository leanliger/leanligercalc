"use client";

import * as React from "react";
import { CalendarDays, ChevronDown, Copy, ListOrdered, Pencil, Plus, Repeat, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExerciseThumb } from "@/components/exercise-art";
import { ProgramCalendarPanel } from "@/components/program-calendar";
import { daysBetween, formatShort } from "@/lib/dates";
import { planToday, scheduleEnd, scheduleSessions, scheduleSummary, weekdayOf } from "@/lib/program-schedule";
import {
  MAX_PROGRAMS,
  TEMPLATES,
  findExercise,
  formatTarget,
  nextProgramDay,
  type Program,
  type ProgramDay,
  type ProgramTemplate,
  type TrainingSettings,
  type Workout,
} from "@/lib/training";
import { WEEKDAY_SHORT } from "@/lib/weekday-pattern";
import { cn } from "@/lib/utils";

/**
 * Training → Programs: the program they're on (where it's from, its
 * schedule, the coach's note, progress, Switch and Edit), its calendar with
 * the chosen day's workout, the days in it, and their other programs, each
 * with a plain "Switch to this". A program from the coach isn't edited in
 * place: "Make my own copy" copies its days into one of their own.
 */

const isCoach = (p: Program) => p.id.startsWith("coach_");

/** "Mon · Tue · Thu · Sat" */
const weekdaysText = (days: readonly number[]) => days.map((d) => WEEKDAY_SHORT[d]).join(" · ");

/** The day a program was last trained, or null. */
function lastDone(program: Program, workouts: readonly Workout[]): string | null {
  let last: string | null = null;
  for (const w of workouts) if (w.finishedAt !== null && w.programId === program.id && (!last || w.date > last)) last = w.date;
  return last;
}

/** A program in one line: its schedule, or its days in turn. */
function programLine(p: Program, workouts: readonly Workout[], today: string): string {
  const s = p.schedule;
  if (s) {
    const end = scheduleEnd(p);
    const week = Math.floor(daysBetween(s.startDate, today) / 7) + 1;
    const when = today < s.startDate ? `starts ${formatShort(s.startDate)}` : end && today > end ? `finished ${formatShort(end)}` : `week ${week} of ${s.weeks}`;
    return `${weekdaysText(s.weekdays)} · ${when} · ${formatShort(s.startDate)} – ${end ? formatShort(end) : "?"}`;
  }
  const last = lastDone(p, workouts);
  return `${p.days.length} ${p.days.length === 1 ? "day" : "days"} in turn, no schedule${last ? ` · last done ${formatShort(last)}` : ""}`;
}

function SourceBadge({ program }: { program: Program }) {
  return isCoach(program) ? (
    <Badge variant="success" className="px-2 py-0 text-[11px]">
      From your coach
    </Badge>
  ) : (
    <Badge variant="secondary" className="px-2 py-0 text-[11px]">
      Your own
    </Badge>
  );
}

export function MemberPrograms({
  settings,
  workouts,
  today,
  live,
  onStart,
  onResume,
  onMakeActive,
  onEdit,
  onCopy,
  onAdd,
}: {
  settings: TrainingSettings;
  workouts: readonly Workout[];
  today: string;
  /** A workout already in progress. */
  live: Workout | null;
  onStart: (program: Program, day: ProgramDay) => void;
  onResume: () => void;
  onMakeActive: (id: string) => void;
  onEdit: (id: string) => void;
  /** Make my own copy of a coach's program (and open it). */
  onCopy: (id: string) => void;
  onAdd: (template: ProgramTemplate | null) => void;
}) {
  const programs = settings.programs;
  const active = programs.find((p) => p.id === settings.activeProgramId) ?? programs[0] ?? null;
  const others = programs.filter((p) => p.id !== active?.id);

  if (!active) {
    return (
      <div className="space-y-5 lg:max-w-xl">
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <CalendarDays className="h-6 w-6 text-primary" />
            <div className="space-y-1">
              <p className="font-semibold">No program yet</p>
              <p className="text-sm text-muted-foreground">
                Start one from a template or build your own. When your coach sends you a program, it shows up here with its calendar.
              </p>
            </div>
          </CardContent>
        </Card>
        <OtherPrograms programs={[]} workouts={workouts} today={today} full={false} onMakeActive={onMakeActive} onEdit={onEdit} onCopy={onCopy} onAdd={onAdd} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ProgramHeader
        program={active}
        others={others}
        workouts={workouts}
        today={today}
        onMakeActive={onMakeActive}
        onEdit={onEdit}
        onCopy={onCopy}
      />
      {active.schedule ? (
        <ProgramCalendarPanel key={active.id} program={active} settings={settings} workouts={workouts} today={today} live={live} onStart={onStart} onResume={onResume} />
      ) : (
        <NextUp program={active} workouts={workouts} live={live} onStart={onStart} onResume={onResume} />
      )}
      <ProgramDays program={active} settings={settings} />
      <OtherPrograms
        programs={others}
        workouts={workouts}
        today={today}
        full={programs.length >= MAX_PROGRAMS}
        onMakeActive={onMakeActive}
        onEdit={onEdit}
        onCopy={onCopy}
        onAdd={onAdd}
      />
    </div>
  );
}

/* ------------------------------- the header ------------------------------- */

function ProgramHeader({
  program,
  others,
  workouts,
  today,
  onMakeActive,
  onEdit,
  onCopy,
}: {
  program: Program;
  others: Program[];
  workouts: readonly Workout[];
  today: string;
  onMakeActive: (id: string) => void;
  onEdit: (id: string) => void;
  onCopy: (id: string) => void;
}) {
  const [switching, setSwitching] = React.useState(false);
  const s = program.schedule;
  const summary = s ? scheduleSummary(program, workouts, today) : null;
  const plan = s ? planToday(program, workouts, today) : null;
  const pct = summary && summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : 0;
  const nextText = !plan
    ? (() => {
        const next = nextProgramDay(program, workouts);
        return next ? `next: ${next.name}` : null;
      })()
    : plan.kind === "today"
      ? `next: ${plan.session.day.name} today`
      : plan.kind === "done-today"
        ? plan.next
          ? `done today · next: ${plan.next.day.name} ${formatShort(plan.next.date)}`
          : "done today · that was the last one"
        : plan.kind === "rest"
          ? plan.next
            ? `rest day · next: ${plan.next.day.name} ${WEEKDAY_SHORT[weekdayOf(plan.next.date)]}`
            : "rest day"
          : plan.kind === "not-started"
            ? `starts ${formatShort(plan.next.date)} with ${plan.next.day.name}`
            : `finished ${formatShort(plan.end)}: ask your coach what's next`;

  return (
    <Card className="border-primary/35">
      <CardContent className="space-y-2.5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary">Your program</span>
          <SourceBadge program={program} />
          <span className="ml-auto flex flex-wrap gap-1.5">
            {others.length > 0 ? (
              <Button size="sm" variant="outline" onClick={() => setSwitching((v) => !v)} aria-expanded={switching}>
                <Repeat />
                Switch program
                <ChevronDown className={cn("transition-transform", switching && "rotate-180")} />
              </Button>
            ) : null}
            {isCoach(program) ? (
              <Button size="sm" variant="outline" onClick={() => onCopy(program.id)} title="Your coach's version stays as they sent it">
                <Copy />
                Make my own copy
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => onEdit(program.id)}>
                <Pencil />
                Edit
              </Button>
            )}
          </span>
        </div>
        {switching ? (
          <ul className="space-y-1 rounded-xl border border-border p-1.5" aria-label="Switch to">
            {others.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onMakeActive(p.id);
                    setSwitching(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold">
                      {p.name} <SourceBadge program={p} />
                    </span>
                    <span className="block truncate text-[12px] text-muted-foreground">{programLine(p, workouts, today)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-primary">Switch to this</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-[1.375rem] font-extrabold leading-tight tracking-tight">{program.name}</p>
        <p className="tabular text-sm text-muted-foreground">{programLine(program, workouts, today)}</p>
        {s?.note ? (
          <p className="whitespace-pre-line rounded-md bg-muted/40 px-3 py-2 text-sm italic">
            &ldquo;{s.note}&rdquo;{isCoach(program) ? <span className="not-italic text-muted-foreground"> · your coach</span> : null}
          </p>
        ) : null}
        {summary ? (
          <div className="space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
            </div>
            <p className="tabular text-[12px] text-muted-foreground">
              {summary.done} of {summary.total} done
              {summary.missed > 0 ? (
                <>
                  {" · "}
                  <span className="text-destructive">{summary.missed} missed</span>
                </>
              ) : null}
              {nextText ? ` · ${nextText}` : ""}
            </p>
          </div>
        ) : nextText ? (
          <p className="text-[12px] text-muted-foreground">{nextText[0]!.toUpperCase() + nextText.slice(1)}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ---------------------- no calendar: the next day up ---------------------- */

function NextUp({
  program,
  workouts,
  live,
  onStart,
  onResume,
}: {
  program: Program;
  workouts: readonly Workout[];
  live: Workout | null;
  onStart: (program: Program, day: ProgramDay) => void;
  onResume: () => void;
}) {
  const next = nextProgramDay(program, workouts);
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <CalendarDays className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">No calendar for this program.</span>{" "}
          <span className="text-muted-foreground">Its days go in turn, whenever you train. A program from your coach comes with dates.</span>
        </p>
        {live ? (
          <Button size="sm" variant="outline" onClick={onResume}>
            Resume {live.name}
          </Button>
        ) : next ? (
          <Button size="sm" onClick={() => onStart(program, next)}>
            Start {next.name}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ------------------------------ its days ------------------------------ */

function ProgramDays({ program, settings }: { program: Program; settings: TrainingSettings }) {
  const [open, setOpen] = React.useState<string | null>(null);
  // The weekday each day falls on, when the schedule always puts it on the same one.
  const fixedWeekday = React.useMemo(() => {
    const seen = new Map<string, Set<number>>();
    for (const s of scheduleSessions(program)) seen.set(s.day.id, (seen.get(s.day.id) ?? new Set()).add(weekdayOf(s.date)));
    return new Map([...seen].filter(([, set]) => set.size === 1).map(([id, set]) => [id, WEEKDAY_SHORT[[...set][0]!]!]));
  }, [program]);
  const name = (id: string) => findExercise(id, settings.customExercises)?.name ?? "Exercise";
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListOrdered className="h-4 w-4 text-primary" />
          Days in this program
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {program.days.map((d) => {
            const on = open === d.id;
            const names = d.exercises.map((pe) => name(pe.exerciseId));
            return (
              <li key={d.id} className={cn("rounded-xl border bg-muted/20", on ? "border-primary/40 sm:col-span-2 xl:col-span-2" : "border-border")}>
                <button
                  type="button"
                  onClick={() => setOpen(on ? null : d.id)}
                  aria-expanded={on}
                  className="flex w-full items-start gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">
                      {d.name}
                      {fixedWeekday.get(d.id) ? <span className="font-normal text-muted-foreground"> · {fixedWeekday.get(d.id)}</span> : null}
                    </span>
                    {!on ? (
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {names.length === 0 ? "No exercises yet" : `${names.slice(0, 2).join(" · ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`}
                      </span>
                    ) : null}
                  </span>
                  <ChevronDown className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", on && "rotate-180")} aria-hidden />
                </button>
                {on ? (
                  <ul className="space-y-1 px-3 pb-3 text-sm">
                    {d.exercises.map((pe, i) => (
                      <li key={`${pe.exerciseId}-${i}`} className="flex items-center gap-2.5">
                        <ExerciseThumb exerciseId={pe.exerciseId} className="h-7 w-7" />
                        <span className="min-w-0 flex-1 truncate">{name(pe.exerciseId)}</span>
                        <span className="tabular shrink-0 text-muted-foreground">{formatTarget(pe)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="text-[12px] text-muted-foreground">
          Tap a day to see all its exercises. {isCoach(program) ? "To change them, make your own copy." : "Changes go through Edit."}
        </p>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ the others ------------------------------ */

function OtherPrograms({
  programs,
  workouts,
  today,
  full,
  onMakeActive,
  onEdit,
  onCopy,
  onAdd,
}: {
  programs: Program[];
  workouts: readonly Workout[];
  today: string;
  full: boolean;
  onMakeActive: (id: string) => void;
  onEdit: (id: string) => void;
  onCopy: (id: string) => void;
  onAdd: (template: ProgramTemplate | null) => void;
}) {
  const [adding, setAdding] = React.useState(false);
  return (
    <Card className="lg:max-w-3xl">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex-1 text-base">{programs.length ? "Other programs" : "Programs"}</CardTitle>
          {!full && !adding ? (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus />
              New program
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {programs.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {programs.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold">
                    {p.name} <SourceBadge program={p} />
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">{programLine(p, workouts, today)}</p>
                </div>
                <Button size="sm" variant="outline" className="h-8" onClick={() => onMakeActive(p.id)}>
                  Switch to this
                </Button>
                {isCoach(p) ? (
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => onCopy(p.id)}>
                    <Copy />
                    Copy
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => onEdit(p.id)}>
                    <Pencil />
                    Edit
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : null}
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
                  <span className="block whitespace-normal font-normal text-muted-foreground">
                    {t.days.length} days · {t.days.map((d) => d.name).join(", ")}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        ) : full ? (
          <p className="text-xs text-muted-foreground">Up to {MAX_PROGRAMS} programs. Delete one to add another.</p>
        ) : programs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other programs. Add one from a template or build your own.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
