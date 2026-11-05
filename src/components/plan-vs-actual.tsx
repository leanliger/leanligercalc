"use client";

import * as React from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, Play, Redo2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatShort } from "@/lib/dates";
import type { Exercise } from "@/lib/exercises";
import { dayLines, planVsActual, type DayKind, type PlanDay } from "@/lib/plan-actual";
import type { Program, ProgramDay, Workout } from "@/lib/training";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";
import { weekdayIndex } from "@/lib/weekday-pattern";
import { cn } from "@/lib/utils";

/**
 * Plan vs actual (src/lib/plan-actual.ts): a month of days, each with what
 * the program planned and what they did, and a day's exercises side by side.
 * Coaches: a member → Training → Program & calendar; members: Training →
 * Programs, where it is their program's calendar (with start buttons).
 *
 * A day's box holds its date and one line: the session's whole name (or
 * "Rest"), shrunk to fit rather than wrapped; how it went is the box's colour
 * (legend below), and the day panel spells it out.
 */

const KIND: Record<DayKind, { label: string; cell: string; text: string }> = {
  done: { label: "Done", cell: "border-success/50 bg-success/15", text: "text-success" },
  part: { label: "Cut short", cell: "border-warning/50 bg-warning/15", text: "text-warning" },
  missed: { label: "Missed", cell: "border-dashed border-destructive/60", text: "text-destructive" },
  rest: { label: "Rest day", cell: "border-border bg-muted/40", text: "text-primary" },
  off: { label: "Rest", cell: "border-transparent", text: "text-muted-foreground" },
  extra: { label: "Extra", cell: "border-primary/50", text: "text-primary" },
  today: { label: "Today", cell: "border-primary ring-2 ring-primary/40", text: "text-primary" },
  planned: { label: "Planned", cell: "border-dashed border-border", text: "text-muted-foreground" },
};

const LINE_TONE = { hit: "text-success", short: "text-warning", skipped: "text-destructive", extra: "text-primary" } as const;

export function PlanVsActualCard({
  program,
  workouts,
  restDays,
  today,
  unit,
  custom,
  who,
  live,
  onStart,
  onResume,
}: {
  /** Their active program; its calendar is the plan. */
  program: Program | null;
  workouts: readonly Workout[];
  /** Days they ticked "rest day". */
  restDays: ReadonlySet<string>;
  today: string;
  unit: WeightUnit;
  custom: readonly Exercise[];
  /** The member's first name on the coach's copy. */
  who?: string;
  /** Member's copy: a workout in progress, and starting a planned session. */
  live?: Workout | null;
  onStart?: (day: ProgramDay) => void;
  onResume?: () => void;
}) {
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const [picked, setPicked] = React.useState(today);
  const { days, summary } = React.useMemo(() => planVsActual(program, workouts, restDays, `${month}-01`, today), [program, workouts, restDays, month, today]);
  const day = days.find((d) => d.date === picked) ?? days[0]!;
  const shift = (n: number) => {
    const d = new Date(`${month}-15T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    const m = d.toISOString().slice(0, 7);
    setMonth(m);
    setPicked(m === today.slice(0, 7) ? today : `${m}-01`);
  };
  const monthName = new Date(`${month}-15T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
  const lead = weekdayIndex(days[0]!.date);
  // The planned session's name; a session moved elsewhere keeps its name (struck through) here.
  const name = (d: PlanDay) =>
    d.kind === "extra" ? "Extra" : d.kind === "off" ? (d.movedTo ? (d.plan?.name ?? "Moved") : "Rest") : d.plan?.name ?? (d.workouts[0]?.name || "Workout");

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex flex-1 items-center gap-2 text-base">
            <CalendarCheck className="h-4 w-4 text-primary" />
            Plan vs actual
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Previous month" onClick={() => shift(-1)}>
              <ChevronLeft />
            </Button>
            <span className="w-32 text-center text-xs font-medium">{monthName}</span>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Next month" disabled={month >= today.slice(0, 7)} onClick={() => shift(1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
        <CardDescription>
          {program?.schedule
            ? onStart
              ? "Each day of your plan against what you did. Tap a day to see it, or to start today's workout."
              : `Each day of ${program.name}'s calendar against what ${who ? `${who} did` : "you did"}. A rest day ticked on a planned day is excused: it doesn't count against workout adherence.`
            : `${who ? `${who}'s` : "Your"} workouts and rest days. Put a program on a calendar to compare them with a plan.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tally value={summary.done} label="done as planned" />
          <Tally value={summary.part} label="cut short" tone={summary.part ? "text-warning" : undefined} />
          <Tally value={summary.missed} label="missed" tone={summary.missed ? "text-destructive" : undefined} />
          <Tally value={summary.rest} label="rest on a plan day" tone={summary.rest ? "text-primary" : undefined} />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div>
            <div className="grid grid-cols-7 gap-1">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className="text-center text-[10px] font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <div key={`lead-${i}`} />
              ))}
              {days.map((d) => {
                const k = KIND[d.kind];
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setPicked(d.date)}
                    aria-pressed={d.date === picked}
                    aria-label={`${formatShort(d.date)}: ${name(d)}, ${k.label}`}
                    className={cn(
                      "flex h-11 min-w-0 flex-col justify-between overflow-hidden rounded-lg border px-0.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-14 sm:px-1",
                      k.cell,
                      d.movedTo && "border-dashed border-border",
                      d.date === picked && "outline outline-2 outline-primary",
                    )}
                  >
                    <span className="tabular flex w-full items-center justify-between gap-0.5 text-[9px] leading-none text-muted-foreground sm:text-[10px]">
                      {Number(d.date.slice(8))}
                      <span className="flex items-center gap-0.5">
                        {d.record ? <Trophy className="h-2.5 w-2.5 text-primary" aria-label="record" /> : null}
                        {d.movedFrom || d.movedTo ? <Redo2 className={cn("h-2.5 w-2.5", d.movedFrom ? k.text : "text-muted-foreground")} aria-label="moved" /> : null}
                      </span>
                    </span>
                    <FitText
                      text={name(d)}
                      className={cn("font-semibold", d.movedTo ? "font-normal text-muted-foreground line-through" : d.kind === "off" ? "font-normal text-muted-foreground" : k.text)}
                    />
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {(["done", "part", "missed", "rest", "extra"] as const).map((k) => (
                <span key={k} className="flex items-center gap-1">
                  <span className={cn("h-2.5 w-2.5 rounded-sm border", KIND[k].cell)} aria-hidden />
                  {KIND[k].label}
                </span>
              ))}
              <span className="flex items-center gap-1">
                <Trophy className="h-3 w-3 text-primary" aria-hidden /> record
              </span>
              <span className="flex items-center gap-1">
                <Redo2 className="h-3 w-3" aria-hidden /> moved
              </span>
            </div>
          </div>

          <DayDetail day={day} unit={unit} custom={custom} who={who} today={today} live={live ?? null} onStart={onStart} onResume={onResume} />
        </div>
      </CardContent>
    </Card>
  );
}

function DayDetail({
  day: d,
  unit,
  custom,
  who,
  today,
  live,
  onStart,
  onResume,
}: {
  day: PlanDay;
  unit: WeightUnit;
  custom: readonly Exercise[];
  who?: string;
  today: string;
  live: Workout | null;
  onStart?: (day: ProgramDay) => void;
  onResume?: () => void;
}) {
  // Member's copy: today's session, a missed one, or a later one done today instead.
  const startable = onStart && d.plan && (d.kind === "today" || d.kind === "missed" || d.kind === "planned") ? d.plan : null;
  const startLabel = !startable ? "" : d.kind === "today" ? `Start ${startable.name}` : d.kind === "missed" ? `Do ${startable.name} today` : "Do it today instead";
  const w = d.workouts[0] ?? null;
  const lines = d.kind === "off" && !w ? [] : dayLines(d.plan, w, custom);
  const lb = (x: number) => Math.round(fromLb(x, unit) * 10) / 10;
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][weekdayIndex(d.date)];
  return (
    <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
      <div>
        <p className="font-semibold">
          {weekday} {formatShort(d.date)} · {d.kind === "extra" ? "Extra workout" : d.plan ? d.plan.name : d.kind === "off" ? "Rest" : (w?.name ?? "Workout")}
        </p>
        <p className={cn("text-[12px]", KIND[d.kind].text)}>
          {d.movedTo ? "Moved" : KIND[d.kind].label}
          {d.movedFrom ? ` · moved from ${formatShort(d.movedFrom)}` : ""}
          {d.movedTo ? ` · done on ${formatShort(d.movedTo)} instead` : ""}
        </p>
      </div>
      {d.kind === "rest" ? (
        <p className="text-muted-foreground">
          {who ?? "You"} ticked &ldquo;rest day&rdquo;{d.plan ? ` instead of ${d.plan.name}` : ""}. It&apos;s excused: it doesn&apos;t count against workout adherence.
        </p>
      ) : d.kind === "off" && !w ? (
        <p className="text-muted-foreground">
          {d.movedTo ? `${d.plan?.name ?? "The session"} was planned today and done on ${formatShort(d.movedTo)}, so it still counts as done.` : "Rest: nothing planned, nothing logged."}
        </p>
      ) : d.kind === "missed" ? (
        <p className="text-destructive">Planned, but no workout and no rest day ticked.</p>
      ) : null}
      {lines.length ? (
        <div className="space-y-1">
          <div className="grid grid-cols-[minmax(0,1.1fr)_3.5rem_minmax(0,1.5fr)] gap-2 border-b border-border pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>Exercise</span>
            <span>Plan</span>
            <span>{d.date > today || d.kind === "planned" ? "" : "Hit"}</span>
          </div>
          {lines.map((l) => (
            <div key={l.exerciseId} className="grid grid-cols-[minmax(0,1.1fr)_3.5rem_minmax(0,1.5fr)] items-start gap-2 text-[13px]">
              <span className="truncate">{l.name}</span>
              <span className="tabular text-[12px] text-muted-foreground">{l.target ?? "—"}</span>
              <span className={cn("tabular text-[12px]", d.kind === "planned" || d.kind === "today" ? "text-muted-foreground" : LINE_TONE[l.status])}>
                {d.kind === "planned" || (d.kind === "today" && !l.sets.length)
                  ? "planned"
                  : l.sets.length
                    ? `${l.status === "short" ? `${l.sets.length} sets: ` : ""}${l.sets.map((s) => (s.weight ? `${lb(s.weight)}×${s.reps}` : `${s.reps} reps`)).join(", ")}`
                    : "skipped"}
                {l.status === "extra" ? " (added)" : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {d.workouts.length > 1 ? <p className="text-[12px] text-muted-foreground">+{d.workouts.length - 1} more workout that day.</p> : null}
      {d.record ? (
        <p className="flex items-center gap-1 text-[12px] text-primary">
          <Trophy className="h-3 w-3" aria-hidden /> A personal record that day.
        </p>
      ) : null}
      {startable ? (
        live ? (
          <Button variant="outline" className="w-full" onClick={onResume}>
            <Play />
            Resume {live.name} first
          </Button>
        ) : (
          <Button className="w-full" variant={d.kind === "today" ? "default" : "outline"} onClick={() => onStart!(startable)}>
            <Play />
            {startLabel}
          </Button>
        )
      ) : null}
    </div>
  );
}

/** One line of text, shrunk (down to 6.5px) until it fits its box instead of wrapping. */
function FitText({ text, className }: { text: string; className?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = "";
      let size = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth && size > 6.5) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  return (
    <span ref={ref} className={cn("block w-full whitespace-nowrap text-center text-[9px] leading-tight tracking-tight sm:text-[11px]", className)}>
      {text}
    </span>
  );
}

function Tally({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className={cn("tabular text-lg font-semibold", tone)}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
