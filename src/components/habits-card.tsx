"use client";

import * as React from "react";
import {
  BedDouble,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardCheck,
  ListChecks,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
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
import { DAY_LABELS } from "@/lib/carb-cycling";
import { addDays, formatShort } from "@/lib/dates";
import {
  DEFAULT_HABITS,
  HABIT_NAME_MAX,
  HABIT_UNIT_MAX,
  MAX_HABITS,
  MAX_REST_DAYS_PER_WEEK,
  REST_KEY,
  WEEKLY_TARGET_PERCENT,
  ZONES,
  counts,
  dayProgress,
  formatHabitValue,
  isDone,
  isRestDay,
  newHabitId,
  restDaysInWeek,
  weekStartOf,
  weeklyScore,
  type Cell,
  type HabitDef,
  type HabitEntries,
  type HabitKind,
  type HabitLog,
  type Zone,
} from "@/lib/habits";
import { REVIEW_FIELD_MAX, emptyReview, type WeeklyReview } from "@/lib/reviews";
import type { RoadmapDay } from "@/lib/types";
import type { Macros } from "@/lib/food";
import { cn } from "@/lib/utils";

const SAVE_DEBOUNCE_MS = 500;

/** Sensible +/− step for a count habit, from the size of its target. */
function stepFor(def: HabitDef): number {
  const t = def.target ?? 1;
  if (t >= 1000) return 500;
  if (t >= 50) return 5;
  if (t > 10) return 1;
  return 0.5;
}

const ZONE_STYLE: Record<Zone, { box: string; text: string; badge: "success" | "warning" | "danger" }> = {
  green: { box: "border-success/40 bg-success/10", text: "text-success", badge: "success" },
  yellow: { box: "border-warning/40 bg-warning/[0.09]", text: "text-warning", badge: "warning" },
  red: { box: "border-destructive/50 bg-destructive/[0.09]", text: "text-destructive", badge: "danger" },
};

/* ============================== daily checklist ============================== */

interface HabitsCardProps {
  habits: HabitDef[];
  logs: HabitLog[];
  today: string;
  /** Roadmap numbers for a date, when it falls inside the plan. */
  dayPlanFor: (date: string) => RoadmapDay | null;
  /** What the food log says was eaten that day, if anything was logged. */
  eatenFor?: (date: string) => Macros | null;
  onSave: (log: HabitLog) => Promise<void>;
  onHabitsChange: (habits: HabitDef[]) => void;
}

export function HabitsCard({
  habits,
  logs,
  today,
  dayPlanFor,
  eatenFor,
  onSave,
  onHabitsChange,
}: HabitsCardProps) {
  const [date, setDate] = React.useState(today);
  const [editing, setEditing] = React.useState(false);
  const logMap = React.useMemo(() => new Map(logs.map((l) => [l.date, l.entries])), [logs]);
  const saved = React.useMemo(() => logMap.get(date) ?? {}, [logMap, date]);
  const [draft, setDraft] = React.useState<HabitEntries>(saved);
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const pending = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = React.useRef(false);

  // New data for the shown day resets the draft — unless an unsaved change is
  // in flight, which must not be clobbered.
  React.useEffect(() => {
    if (!dirty.current) setDraft(saved);
  }, [saved]);

  // Changing day always resets.
  const changeDate = (next: string) => {
    if (pending.current) clearTimeout(pending.current);
    dirty.current = false;
    setStatus("idle");
    setDraft(logMap.get(next) ?? {});
    setDate(next);
  };

  React.useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  const update = (key: string, value: boolean | number | undefined) => {
    const next = { ...draft };
    if (value === undefined || value === false || value === 0) delete next[key];
    else next[key] = value;
    setDraft(next);
    dirty.current = true;
    setStatus("saving");
    if (pending.current) clearTimeout(pending.current);
    const forDate = date;
    pending.current = setTimeout(() => {
      onSave({ date: forDate, entries: next })
        .then(() => {
          dirty.current = false;
          setStatus("saved");
        })
        .catch(() => setStatus("error"));
    }, SAVE_DEBOUNCE_MS);
  };

  const plan = dayPlanFor(date);
  const progress = dayProgress(habits, draft);
  const isToday = date === today;
  const rest = isRestDay(draft);
  const hasWorkout = habits.some((h) => h.link === "workout");
  // Rest days already used this week, not counting the day being shown.
  const restUsed =
    restDaysInWeek(logMap, weekStartOf(date)) - (isRestDay(logMap.get(date)) ? 1 : 0);
  const restLimitReached = !rest && restUsed >= MAX_REST_DAYS_PER_WEEK;

  const eaten = eatenFor?.(date) ?? null;
  const hint = (h: HabitDef): string | null => {
    if (!plan || plan.isGoalDay) return null;
    if (h.link === "protein") {
      return eaten ? `${Math.round(eaten.protein)} / ${plan.protein} g` : `${plan.protein} g today`;
    }
    if (h.link === "calories") {
      return eaten
        ? `${Math.round(eaten.kcal).toLocaleString()} / ${plan.calories.toLocaleString()} kcal`
        : `${plan.calories.toLocaleString()} kcal today`;
    }
    return null;
  };

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" />
              Daily non-negotiables
            </CardTitle>
            <CardDescription>
              {editing ? "Rename, reorder, remove or add habits." : "Tick off each target you hit. Saves as you go."}
            </CardDescription>
          </div>
          <Button
            variant={editing ? "default" : "ghost"}
            size="sm"
            className="h-8 shrink-0 px-2"
            onClick={() => setEditing((e) => !e)}
          >
            {editing ? <Check /> : <Pencil />}
            {editing ? "Done" : "Edit"}
          </Button>
        </div>

        {!editing ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => changeDate(addDays(date, -1))} aria-label="Previous day">
                  <ChevronLeft />
                </Button>
                <span className="min-w-[6.5rem] text-center text-sm font-medium" aria-live="polite">
                  {isToday ? "Today" : formatShort(date)}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => changeDate(addDays(date, 1))}
                  disabled={date >= today}
                  aria-label="Next day"
                >
                  <ChevronRight />
                </Button>
              </div>
              <Badge
                variant={progress.total > 0 && progress.done === progress.total ? "success" : "secondary"}
                className="tabular"
              >
                {progress.done} / {progress.total}
              </Badge>
            </div>

            {plan && !plan.isGoalDay ? (
              <p className="tabular rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                {DAY_LABELS[plan.type]} day · {plan.calories.toLocaleString()} kcal · P{plan.protein} C{plan.carbs} F{plan.fat}
              </p>
            ) : null}
          </>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-2">
        {editing ? (
          <HabitEditor habits={habits} onChange={onHabitsChange} />
        ) : habits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No habits yet. Tap <strong>Edit</strong> to add some.
          </p>
        ) : (
          <>
            {hasWorkout ? (
              <button
                type="button"
                aria-pressed={rest}
                disabled={restLimitReached}
                onClick={() => update(REST_KEY, !rest)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-xs transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  rest ? "border-primary/50 bg-primary/10" : "border-dashed border-border hover:bg-muted/40",
                )}
              >
                <BedDouble className={cn("h-4 w-4 shrink-0", rest ? "text-primary" : "text-muted-foreground")} />
                <span className="font-medium">{rest ? "Rest day" : "Mark as rest day"}</span>
                <span className="ml-auto text-muted-foreground">
                  {restLimitReached
                    ? `${MAX_REST_DAYS_PER_WEEK} used this week`
                    : `${restUsed + (rest ? 1 : 0)} of ${MAX_REST_DAYS_PER_WEEK} this week`}
                </span>
              </button>
            ) : null}

            <ul className="space-y-1.5">
              {habits.map((h) =>
                !counts(h, draft) ? (
                  <li key={h.id} className="flex items-center gap-3 rounded-md border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                    <BedDouble className="h-4 w-4 shrink-0" />
                    <span>{h.name}</span>
                    <span className="ml-auto text-xs">Rest day — not counted</span>
                  </li>
                ) : h.kind === "check" ? (
                  <CheckRow key={h.id} def={h} hint={hint(h)} value={draft[h.id]} onChange={(v) => update(h.id, v)} />
                ) : (
                  <CountRow key={`${h.id}-${date}`} def={h} value={draft[h.id]} onChange={(v) => update(h.id, v)} />
                ),
              )}
            </ul>
            <p
              role="status"
              aria-live="polite"
              className={cn("min-h-4 text-right text-[11px]", status === "error" ? "text-destructive" : "text-muted-foreground")}
            >
              {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save — try again" : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CheckRow({
  def,
  hint,
  value,
  onChange,
}: {
  def: HabitDef;
  hint: string | null;
  value: boolean | number | undefined;
  onChange: (v: boolean) => void;
}) {
  const done = isDone(def, value);
  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        onClick={() => onChange(!done)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          done ? "border-success/40 bg-success/10" : "border-border hover:bg-muted/40",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
            done ? "border-success bg-success text-success-foreground" : "border-muted-foreground/50",
          )}
        >
          {done ? <Check className="h-3.5 w-3.5" /> : null}
        </span>
        <span className="min-w-0 flex-1 font-medium">{def.name}</span>
        {hint ? <span className="tabular shrink-0 text-xs text-muted-foreground">{hint}</span> : null}
      </button>
    </li>
  );
}

function CountRow({
  def,
  value,
  onChange,
}: {
  def: HabitDef;
  value: boolean | number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  const current = typeof value === "number" ? value : 0;
  const [text, setText] = React.useState(current ? String(current) : "");
  const done = isDone(def, value);
  const target = def.target ?? 1;
  const step = stepFor(def);
  const pct = Math.min((current / target) * 100, 100);
  const inputId = React.useId();

  const commit = (n: number) => {
    const clean = Math.max(Math.round(n * 100) / 100, 0);
    setText(clean ? String(clean) : "");
    onChange(clean || undefined);
  };

  return (
    <li className={cn("space-y-2 rounded-md border px-3 py-2.5", done ? "border-success/40 bg-success/10" : "border-border")}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
            done ? "border-success bg-success text-success-foreground" : "border-muted-foreground/50",
          )}
        >
          {done ? <Check className="h-3.5 w-3.5" /> : null}
        </span>
        <label htmlFor={inputId} className="text-sm font-medium">
          {def.name}
        </label>
        <span className="tabular ml-auto text-xs text-muted-foreground">
          goal {formatHabitValue(target)} {def.unit ?? ""}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => commit(current - step)} disabled={current <= 0} aria-label={`Decrease ${def.name}`}>
          <Minus />
        </Button>
        <div className="relative min-w-0 flex-1">
          <Input
            id={inputId}
            type="number"
            inputMode="decimal"
            min={0}
            step={step}
            value={text}
            placeholder="0"
            onChange={(e) => {
              setText(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value === "") onChange(undefined);
              else if (Number.isFinite(n) && n >= 0) onChange(Math.round(n * 100) / 100);
            }}
            className="h-8 pr-14 text-center"
          />
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
            {def.unit ?? ""}
          </span>
        </div>
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={() => commit(current + step)} aria-label={`Increase ${def.name}`}>
          <Plus />
        </Button>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className={cn("h-full rounded-full", done ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

/* ================================== editor ================================== */

const LINK_LABEL = {
  protein: "Shows today's protein target",
  calories: "Shows today's calorie target",
  workout: "Excused on rest days",
} as const;

function HabitEditor({ habits, onChange }: { habits: HabitDef[]; onChange: (habits: HabitDef[]) => void }) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<HabitKind>("check");
  const [target, setTarget] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const patch = (id: string, p: Partial<HabitDef>) => onChange(habits.map((h) => (h.id === id ? { ...h, ...p } : h)));

  const add = () => {
    setError(null);
    const n = name.trim();
    if (!n) return setError("Give the habit a name.");
    if (habits.length >= MAX_HABITS) return setError(`Up to ${MAX_HABITS} habits.`);
    let t: number | null = null;
    if (kind === "count") {
      t = Number(target);
      if (!Number.isFinite(t) || t <= 0) return setError("Set a daily target above 0.");
    }
    onChange([
      ...habits,
      {
        id: newHabitId(),
        name: n.slice(0, HABIT_NAME_MAX),
        kind,
        target: t,
        unit: kind === "count" ? unit.trim().slice(0, HABIT_UNIT_MAX) || null : null,
        link: null,
      },
    ]);
    setName("");
    setTarget("");
    setUnit("");
  };

  const move = (index: number, delta: number) => {
    const next = [...habits];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {habits.map((h, i) => (
          <li key={h.id} className="space-y-2 rounded-md border border-border p-2.5">
            <div className="flex items-center gap-1.5">
              <Input
                value={h.name}
                maxLength={HABIT_NAME_MAX}
                onChange={(e) => patch(h.id, { name: e.target.value })}
                onBlur={(e) => !e.target.value.trim() && patch(h.id, { name: "Untitled habit" })}
                aria-label="Habit name"
                className="h-8"
              />
              <div className="flex shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${h.name} up`}>
                  <ChevronUp />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-7" disabled={i === habits.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${h.name} down`}>
                  <ChevronDown />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-7 text-destructive" onClick={() => onChange(habits.filter((x) => x.id !== h.id))} aria-label={`Remove ${h.name}`}>
                  <Trash2 />
                </Button>
              </div>
            </div>
            {h.kind === "count" ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Daily goal</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={h.target ?? ""}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    if (Number.isFinite(t) && t > 0) patch(h.id, { target: t });
                  }}
                  aria-label={`${h.name} daily goal`}
                  className="h-7 w-24 text-xs"
                />
                <Input
                  value={h.unit ?? ""}
                  maxLength={HABIT_UNIT_MAX}
                  placeholder="unit"
                  onChange={(e) => patch(h.id, { unit: e.target.value || null })}
                  aria-label={`${h.name} unit`}
                  className="h-7 w-20 text-xs"
                />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Tick box{h.link ? ` · ${LINK_LABEL[h.link]}` : ""}</p>
            )}
          </li>
        ))}
      </ul>

      <div className="space-y-2 rounded-md border border-dashed border-border p-2.5">
        <p className="text-xs font-medium">Add a habit</p>
        <Input value={name} maxLength={HABIT_NAME_MAX} placeholder="e.g. Posing practice, Supplements" onChange={(e) => setName(e.target.value)} aria-label="New habit name" className="h-8" />
        <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted/50 p-1" role="radiogroup" aria-label="Habit type">
          {(["check", "count"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn("rounded-sm px-2 py-1 text-xs font-medium", kind === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}
            >
              {k === "check" ? "Tick box" : "Number goal"}
            </button>
          ))}
        </div>
        {kind === "count" ? (
          <div className="flex gap-1.5">
            <Input type="number" inputMode="decimal" min={0} value={target} placeholder="Daily goal" onChange={(e) => setTarget(e.target.value)} aria-label="Daily goal" className="h-8" />
            <Input value={unit} maxLength={HABIT_UNIT_MAX} placeholder="Unit (oz, steps…)" onChange={(e) => setUnit(e.target.value)} aria-label="Unit" className="h-8" />
          </div>
        ) : null}
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1" onClick={add} disabled={habits.length >= MAX_HABITS}>
            <Plus />
            Add habit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_HABITS.map((h) => ({ ...h })))} title="Restore the scorecard's seven habits">
            <RotateCcw />
            Scorecard
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Adding or removing habits changes the weekly score&apos;s total. Days already logged are kept.
        </p>
      </div>
    </div>
  );
}

/* ============================= weekly scorecard ============================= */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CellMark({ cell, date }: { cell: Cell; date: string }) {
  const label =
    cell === "done" ? "done" : cell === "missed" ? "missed" : cell === "rest" ? "rest day" : cell === "upcoming" ? "not yet" : "before you started";
  return (
    <span title={`${formatShort(date)}: ${label}`} className="inline-flex h-5 w-5 items-center justify-center">
      {cell === "done" ? (
        <span className="flex h-5 w-5 items-center justify-center rounded bg-success text-success-foreground">
          <Check className="h-3.5 w-3.5" />
        </span>
      ) : cell === "missed" ? (
        <span className="h-4 w-4 rounded border border-muted-foreground/50" />
      ) : cell === "rest" ? (
        <BedDouble className="h-3.5 w-3.5 text-muted-foreground" />
      ) : cell === "upcoming" ? (
        <span className="h-4 w-4 rounded border border-dashed border-muted-foreground/30" />
      ) : (
        <span className="h-1 w-3 rounded bg-muted" />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

interface WeeklyScorecardProps {
  habits: HabitDef[];
  logs: HabitLog[];
  reviews: WeeklyReview[];
  today: string;
  /** Average calorie/protein targets for a Mon–Sun week, if it's in the plan. */
  weekTargets: (weekStart: string) => { calories: number; protein: number } | null;
  onSaveReview: (review: WeeklyReview) => Promise<void>;
}

export function WeeklyScorecard({ habits, logs, reviews, today, weekTargets, onSaveReview }: WeeklyScorecardProps) {
  const thisWeek = weekStartOf(today);
  const [weekStart, setWeekStart] = React.useState(thisWeek);
  const logMap = React.useMemo(() => new Map(logs.map((l) => [l.date, l.entries])), [logs]);
  const firstLog = logs[0]?.date ?? null;
  const score = weeklyScore(habits, logMap, weekStart, today, firstLog);
  const targets = weekTargets(weekStart);
  const inProgress = !score.complete;

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              Weekly scorecard
            </CardTitle>
            <CardDescription>
              Target: {WEEKLY_TARGET_PERCENT}%+ consistency. Rest days excuse the workout only.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
              <ChevronLeft />
            </Button>
            <span className="min-w-[8.5rem] text-center text-sm font-medium" aria-live="polite">
              {weekStart === thisWeek ? "This week" : `Week of ${formatShort(weekStart)}`}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              disabled={weekStart >= thisWeek}
              aria-label="Next week"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
        {targets ? (
          <p className="tabular text-xs text-muted-foreground">
            This week&apos;s plan: ~{targets.calories.toLocaleString()} kcal · ~{targets.protein} g protein a day
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {habits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add habits to start scoring your week.</p>
        ) : (
          <>
          {/* Phones: name on its own line, the whole Mon–Sun row beneath it, so
              the full week is visible without sideways scrolling. */}
          <div className="space-y-2.5 sm:hidden">
            <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_2.75rem] text-center text-[10px] font-medium uppercase text-muted-foreground">
              {WEEKDAYS.map((d, i) => (
                <span key={d} className={cn(score.days[i] === today && "text-primary")}>
                  {d[0]}
                </span>
              ))}
              <span className="text-right">Total</span>
            </div>
            {score.rows.map((row) => (
              <div key={row.def.id} className="space-y-1 border-t border-border/60 pt-2">
                <p className="text-xs font-medium leading-snug">{row.def.name}</p>
                <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_2.75rem] items-center text-center">
                  {row.cells.map((cell, i) => (
                    <span key={score.days[i]} className="flex justify-center">
                      <CellMark cell={cell} date={score.days[i]!} />
                    </span>
                  ))}
                  <span className="tabular text-right text-xs text-muted-foreground">
                    {row.done}/{row.possible}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="relative scrollbar-thin hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-2 text-left font-medium">Habit</th>
                  {WEEKDAYS.map((d, i) => (
                    <th key={d} scope="col" className={cn("w-9 py-1.5 text-center font-medium", score.days[i] === today && "text-primary")}>
                      {d}
                    </th>
                  ))}
                  <th scope="col" className="py-1.5 pl-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {score.rows.map((row) => (
                  <tr key={row.def.id} className="border-t border-border/60">
                    <th scope="row" className="max-w-[11rem] truncate py-2 pr-2 text-left text-xs font-medium sm:text-sm" title={row.def.name}>
                      {row.def.name}
                    </th>
                    {row.cells.map((cell, i) => (
                      <td key={score.days[i]} className="py-2 text-center">
                        <CellMark cell={cell} date={score.days[i]!} />
                      </td>
                    ))}
                    <td className="tabular py-2 pl-2 text-right text-muted-foreground">
                      {row.done}/{row.possible}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        {score.percent !== null && score.zone ? (
          <div className={cn("space-y-1 rounded-lg border p-3", ZONE_STYLE[score.zone].box)}>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className={cn("tabular text-2xl font-semibold", ZONE_STYLE[score.zone].text)}>
                {score.percent}%
              </span>
              <Badge variant={ZONE_STYLE[score.zone].badge}>{ZONES[score.zone].label}</Badge>
              <span className="tabular text-xs text-muted-foreground">
                {score.done} of {score.possible} ticks{inProgress ? " so far" : ""}
                {score.restDays > 0 ? ` · ${score.restDays} rest day${score.restDays === 1 ? "" : "s"}` : ""}
              </span>
            </div>
            <p className="text-sm">
              <span className="font-medium">{ZONES[score.zone].headline}</span> {ZONES[score.zone].advice}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No ticks logged for this week yet.</p>
        )}

        <WeeklyReviewForm
          key={weekStart}
          weekStart={weekStart}
          saved={reviews.find((r) => r.weekStart === weekStart) ?? null}
          onSave={onSaveReview}
        />
      </CardContent>
    </Card>
  );
}

/* ============================== weekly self-audit ============================== */

function WeeklyReviewForm({
  weekStart,
  saved,
  onSave,
}: {
  weekStart: string;
  saved: WeeklyReview | null;
  onSave: (review: WeeklyReview) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState<WeeklyReview>(saved ?? emptyReview(weekStart));
  const [status, setStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const pending = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  const change = (next: WeeklyReview) => {
    setDraft(next);
    setStatus("saving");
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      onSave(next)
        .then(() => setStatus("saved"))
        .catch(() => setStatus("error"));
    }, 700);
  };

  const field =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Weekly self-audit</h3>
        <span
          role="status"
          aria-live="polite"
          className={cn("text-[11px]", status === "error" ? "text-destructive" : "text-muted-foreground")}
        >
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Couldn't save" : ""}
        </span>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          The friction audit: what trigger caused your biggest slip-up?
        </span>
        <textarea
          className={cn(field, "min-h-[4.5rem] resize-y")}
          value={draft.friction}
          maxLength={REVIEW_FIELD_MAX}
          onChange={(e) => change({ ...draft, friction: e.target.value })}
        />
      </label>
    </div>
  );
}
