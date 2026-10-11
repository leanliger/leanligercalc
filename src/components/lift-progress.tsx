"use client";

import * as React from "react";
import { ChevronRight, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented";
import { ExerciseThumb } from "@/components/exercise-art";
import { formatShort } from "@/lib/dates";
import type { Exercise } from "@/lib/exercises";
import { exerciseHistory, findExercise, type ExerciseSession, type Workout } from "@/lib/training";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * Every weighted lift on one chart: estimated 1RM per session (or % change
 * since the first session, so a 60 lb curl and a 300 lb squat share a scale),
 * up to four lifts at once, and a list of each lift's best and its change.
 * Tapping a lift opens its own page (exercise-progress.tsx).
 */

const MAX_LINES = 4;
const COLORS = ["hsl(var(--primary))", "hsl(var(--macro-carb))", "hsl(var(--macro-fat))", "hsl(var(--success))"];

type Mode = "e1rm" | "change";

/** The big lifts come first, so the chart opens on what most people want to see. */
const MAIN_LIFTS = [
  "back-squat", "bench-press", "deadlift", "overhead-press", "barbell-row",
  "romanian-deadlift", "incline-bench-press", "front-squat", "hip-thrust",
];
const rank = (id: string) => (MAIN_LIFTS.includes(id) ? MAIN_LIFTS.indexOf(id) : MAIN_LIFTS.length);

interface Lift {
  exercise: Exercise;
  history: ExerciseSession[];
  best: number;
  first: ExerciseSession;
  last: ExerciseSession;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function LiftProgressCard({
  workouts,
  custom,
  unit,
  onOpen,
}: {
  workouts: readonly Workout[];
  custom: readonly Exercise[];
  unit: WeightUnit;
  onOpen: (exerciseId: string) => void;
}) {
  // Weighted lifts from finished workouts: the main lifts, then the most-trained.
  const lifts = React.useMemo(() => {
    const finished = workouts.filter((w) => w.finishedAt !== null);
    const ids = new Set(finished.flatMap((w) => w.exercises.map((e) => e.exerciseId)));
    const out: Lift[] = [];
    for (const id of ids) {
      const exercise = findExercise(id, custom);
      if (!exercise || exercise.bodyweight) continue;
      const history = exerciseHistory(finished, id).filter((s) => s.e1rm > 0);
      if (history.length === 0) continue;
      out.push({ exercise, history, best: Math.max(...history.map((s) => s.e1rm)), first: history[0]!, last: history[history.length - 1]! });
    }
    return out.sort(
      (a, b) =>
        rank(a.exercise.id) - rank(b.exercise.id) ||
        b.history.length - a.history.length ||
        (a.last.date < b.last.date ? 1 : a.last.date > b.last.date ? -1 : 0),
    );
  }, [workouts, custom]);

  const [chosen, setChosen] = React.useState<string[] | null>(null);
  const [mode, setMode] = React.useState<Mode>("e1rm");
  // Until the member picks, the first three with more than one session.
  const shown = (chosen ?? lifts.filter((l) => l.history.length > 1).slice(0, 3).map((l) => l.exercise.id)).filter((id) =>
    lifts.some((l) => l.exercise.id === id),
  );
  const toggle = (id: string) => {
    const next = shown.includes(id) ? shown.filter((x) => x !== id) : [...shown, id].slice(-MAX_LINES);
    setChosen(next);
  };

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4 text-primary" />
          Lift progress
        </CardTitle>
        <CardDescription>
          Estimated 1-rep max each session, from your best set. Pick up to {MAX_LINES} lifts to compare.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {lifts.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Finish a few workouts with weighted lifts and your progress shows up here.
          </p>
        ) : (
          <>
            <SegmentedControl
              ariaLabel="Chart shows"
              size="sm"
              value={mode}
              onValueChange={setMode}
              options={[
                { value: "e1rm" as const, label: `Est. 1RM (${unit})` },
                { value: "change" as const, label: "% change" },
              ]}
            />
            <LiftsChart lifts={lifts.filter((l) => shown.includes(l.exercise.id))} order={shown} mode={mode} unit={unit} />
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lifts on the chart">
              {lifts.map((l) => {
                const i = shown.indexOf(l.exercise.id);
                return (
                  <button
                    key={l.exercise.id}
                    type="button"
                    aria-pressed={i >= 0}
                    onClick={() => toggle(l.exercise.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                      i >= 0 ? "border-foreground/30 bg-muted font-medium" : "border-border text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: i >= 0 ? COLORS[i] : "hsl(var(--border))" }} />
                    {l.exercise.name}
                  </button>
                );
              })}
            </div>
            <ul className="divide-y divide-border rounded-md border border-border">
              {lifts.map((l) => {
                const change = l.last.e1rm - l.first.e1rm;
                return (
                  <li key={l.exercise.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(l.exercise.id)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/40"
                    >
                      <ExerciseThumb exerciseId={l.exercise.id} className="h-8 w-8 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{l.exercise.name}</span>
                        <span className="tabular block text-[11px] text-muted-foreground">
                          Best {round1(fromLb(l.best, unit)).toLocaleString()} {unit} · {l.history.length}{" "}
                          {l.history.length === 1 ? "session" : "sessions"}
                        </span>
                      </span>
                      {l.history.length > 1 ? (
                        <span
                          className={cn(
                            "tabular shrink-0 text-right text-xs font-semibold",
                            change > 0.05 ? "text-success" : change < -0.05 ? "text-warning" : "text-muted-foreground",
                          )}
                        >
                          {change > 0.05 ? "+" : change < -0.05 ? "−" : "±"}
                          {round1(Math.abs(fromLb(change, unit)))} {unit}
                          <span className="block text-[10px] font-normal text-muted-foreground">since {formatShort(l.first.date)}</span>
                        </span>
                      ) : null}
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface Point {
  t: number;
  date: string;
  value: number;
}

function LiftsChart({ lifts, order, mode, unit }: { lifts: Lift[]; order: string[]; mode: Mode; unit: WeightUnit }) {
  const series = React.useMemo(
    () =>
      [...lifts]
        .sort((a, b) => order.indexOf(a.exercise.id) - order.indexOf(b.exercise.id))
        .map((l) => ({
          id: l.exercise.id,
          name: l.exercise.name,
          color: COLORS[order.indexOf(l.exercise.id)] ?? COLORS[0]!,
          points: l.history.map(
            (s, i): Point => ({
              t: Date.parse(`${s.date}T00:00:00Z`) + i, // same-day sessions stay in order
              date: s.date,
              value: mode === "change" ? round1((s.e1rm / l.first.e1rm - 1) * 100) : round1(fromLb(s.e1rm, unit)),
            }),
          ),
        })),
    [lifts, order, mode, unit],
  );

  if (series.length === 0 || series.every((s) => s.points.length < 2)) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {series.length === 0
          ? "Pick a lift below to chart it."
          : "One session so far. The line appears after the next one."}
      </p>
    );
  }

  const values = series.flatMap((s) => s.points.map((p) => p.value));
  const ts = series.flatMap((s) => s.points.map((p) => p.t));
  const suffix = mode === "change" ? "%" : ` ${unit}`;

  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart margin={{ top: 8, right: 8, bottom: 4, left: -4 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={[Math.min(...ts), Math.max(...ts)]}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fontSize: 11 }}
            tickFormatter={(t: number) => formatShort(new Date(t).toISOString().slice(0, 10))}
            minTickGap={24}
            allowDuplicatedCategory={false}
          />
          <YAxis
            dataKey="value"
            domain={mode === "change" ? [Math.min(0, Math.floor(Math.min(...values))), "auto"] : ["auto", "auto"]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            width={44}
            tickFormatter={(v: number) => (mode === "change" ? `${v}%` : String(v))}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--border))" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const first = payload[0]?.payload as Point | undefined;
              return (
                <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
                  {first ? <p className="font-semibold">{formatShort(first.date)}</p> : null}
                  {payload.map((p) => (
                    <p key={String(p.name)} className="tabular mt-1 flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                      {p.name}: <span className="font-semibold">{(p.payload as Point).value.toLocaleString()}{suffix}</span>
                    </p>
                  ))}
                </div>
              );
            }}
          />
          {series.map((s) => (
            <Line
              key={s.id}
              data={s.points}
              dataKey="value"
              name={s.name}
              type="monotone"
              stroke={s.color}
              strokeWidth={2.25}
              dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
