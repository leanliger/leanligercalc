"use client";

import * as React from "react";
import { ArrowLeft, ExternalLink, Pencil, Trash2, Trophy, Video } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import { ConfirmButton } from "@/components/confirm-button";
import { CustomExerciseForm } from "@/components/exercise-library";
import { ExerciseDrawings } from "@/components/exercise-art";
import { formatShort } from "@/lib/dates";
import { EQUIPMENT_LABELS, MUSCLE_LABELS, demoUrl, type Exercise } from "@/lib/exercises";
import {
  e1rm,
  exerciseHistory,
  formatLoad,
  formatSet,
  formatSetEffort,
  isRecordSession,
  type ExerciseSession,
  type Workout,
} from "@/lib/training";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";
import { cn } from "@/lib/utils";

type Metric = "e1rm" | "weight" | "volume" | "reps" | "totalReps";

const WEIGHTED: { value: Metric; label: string }[] = [
  { value: "e1rm", label: "Est. 1RM" },
  { value: "weight", label: "Best weight" },
  { value: "volume", label: "Volume" },
];
const BODYWEIGHT: { value: Metric; label: string }[] = [
  { value: "reps", label: "Best set" },
  { value: "totalReps", label: "Total reps" },
];

const METRIC_HELP: Record<Metric, string> = {
  e1rm: "Estimated one-rep max from your best set each session (weight × (1 + reps ÷ 30)).",
  weight: "The heaviest weight you lifted each session.",
  volume: "Total weight moved each session: weight × reps, added up over every set.",
  reps: "Most reps in one set each session.",
  totalReps: "All reps across every set each session.",
};

function metricValue(s: ExerciseSession, m: Metric, unit: WeightUnit): number {
  switch (m) {
    case "e1rm":
      return Math.round(fromLb(s.e1rm, unit) * 10) / 10;
    case "weight":
      return Math.round(fromLb(s.bestWeight, unit) * 10) / 10;
    case "volume":
      return Math.round(fromLb(s.volume, unit));
    case "reps":
      return s.bestReps;
    case "totalReps":
      return s.totalReps;
  }
}

function metricUnit(m: Metric, unit: WeightUnit): string {
  return m === "reps" || m === "totalReps" ? "reps" : unit;
}

interface Point {
  t: number;
  date: string;
  value: number;
  pr: boolean;
  sets: string;
}

export function ExerciseProgress({
  exercise,
  workouts,
  unit,
  onBack,
  backLabel,
  onSaveCustom,
  onDeleteCustom,
  onFormCheck,
}: {
  exercise: Exercise;
  workouts: readonly Workout[];
  unit: WeightUnit;
  onBack: () => void;
  backLabel: string;
  onSaveCustom?: (e: Exercise) => void;
  onDeleteCustom?: () => void;
  /** Ask the coach for a form check on this exercise. */
  onFormCheck?: () => void;
}) {
  const history = React.useMemo(() => exerciseHistory(workouts, exercise.id), [workouts, exercise.id]);
  const options = exercise.bodyweight ? BODYWEIGHT : WEIGHTED;
  const [metric, setMetric] = React.useState<Metric>(options[0]!.value);
  const shown = options.some((o) => o.value === metric) ? metric : options[0]!.value;
  const [editing, setEditing] = React.useState(false);

  const last = history[history.length - 1];
  const bestSession = history.reduce<ExerciseSession | null>(
    (b, s) => (!b || (exercise.bodyweight ? s.bestReps > b.bestReps : s.e1rm > b.e1rm) ? s : b),
    null,
  );
  const bestSet = bestSession
    ? [...bestSession.sets].sort((a, b) => (exercise.bodyweight ? b.reps - a.reps : e1rm(b.weight, b.reps) - e1rm(a.weight, a.reps)))[0]!
    : null;

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" onClick={onBack}>
        <ArrowLeft />
        {backLabel}
      </Button>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <Card>
          <CardHeader className="space-y-2 pb-3">
            <CardTitle className="text-lg">{exercise.name}</CardTitle>
            <CardDescription>
              {MUSCLE_LABELS[exercise.muscle]} · {EQUIPMENT_LABELS[exercise.equipment]}
              {exercise.custom ? " · your exercise" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {editing && onSaveCustom ? (
              <CustomExerciseForm
                initial={exercise}
                onCancel={() => setEditing(false)}
                onSave={(e) => {
                  onSaveCustom(e);
                  setEditing(false);
                }}
              />
            ) : (
              <>
                <ExerciseDrawings exerciseId={exercise.id} name={exercise.name} />
                {exercise.cues.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Form cues</p>
                    <ul className="space-y-1 text-sm">
                      {exercise.cues.map((c) => (
                        <li key={c} className="flex gap-2">
                          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <a
                  href={demoUrl(exercise)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <ExternalLink />
                  Watch a demo
                </a>
                {onFormCheck ? (
                  <Button variant="outline" size="sm" onClick={onFormCheck}>
                    <Video />
                    Get a form check
                  </Button>
                ) : null}
                {exercise.custom && (onSaveCustom || onDeleteCustom) ? (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    {onSaveCustom ? (
                      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                        <Pencil />
                        Edit exercise
                      </Button>
                    ) : null}
                    {onDeleteCustom ? (
                      <ConfirmButton label="Delete exercise" icon={<Trash2 />} confirmLabel="Delete it (history stays)" onConfirm={onDeleteCustom} />
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Tile
              label={exercise.bodyweight ? "Best set" : "Best est. 1RM"}
              value={
                bestSession
                  ? exercise.bodyweight
                    ? `${bestSession.bestReps} reps`
                    : `${formatLoad(bestSession.e1rm, unit)} ${unit}`
                  : "—"
              }
              sub={bestSet && bestSession ? `${formatSet(bestSet, unit, exercise.bodyweight)} · ${formatShort(bestSession.date)}` : "no sets yet"}
              emphasis
            />
            <Tile
              label="Heaviest"
              value={history.length > 0 ? `${formatLoad(Math.max(...history.map((s) => s.bestWeight)), unit)} ${unit}` : "—"}
              sub={exercise.bodyweight ? "added weight" : "any reps"}
            />
            <Tile label="Sessions" value={String(history.length)} sub={history.length > 0 ? `since ${formatShort(history[0]!.date)}` : "—"} />
            <Tile
              label="Last time"
              value={last ? formatShort(last.date) : "—"}
              sub={last ? last.sets.map((s) => formatSet(s, unit, exercise.bodyweight)).slice(0, 2).join(", ") + (last.sets.length > 2 ? "…" : "") : "—"}
            />
          </div>

          <Card>
            <CardHeader className="space-y-3 pb-2">
              <CardTitle className="text-sm">Progress</CardTitle>
              <SegmentedControl ariaLabel="Chart" value={shown} onValueChange={setMetric} options={options} size="sm" className="max-w-sm" />
              <CardDescription className="text-xs">{METRIC_HELP[shown]}</CardDescription>
            </CardHeader>
            <CardContent>
              <ProgressChart history={history} metric={shown} unit={unit} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">History</CardTitle>
              <CardDescription>
                {history.length === 0 ? "Nothing logged yet." : `${history.length} session${history.length === 1 ? "" : "s"}, newest first.`}
              </CardDescription>
            </CardHeader>
            {history.length > 0 ? (
              <CardContent>
                <ul className="scrollbar-thin max-h-[28rem] divide-y divide-border overflow-y-auto rounded-lg border border-border">
                  {[...history].reverse().map((s) => (
                    <li key={s.workoutId} className="space-y-0.5 px-3 py-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{formatShort(s.date)}</span>
                        {isRecordSession(s, exercise.bodyweight) ? (
                          <Badge variant="default" className="px-1.5 py-0 text-[10px]">
                            <Trophy />
                            PR
                          </Badge>
                        ) : null}
                        <span className="tabular ml-auto text-xs text-muted-foreground">
                          {exercise.bodyweight ? `${s.totalReps} reps` : `est. 1RM ${formatLoad(s.e1rm, unit)} ${unit}`}
                        </span>
                      </div>
                      <p className="tabular text-xs text-muted-foreground">
                        {s.sets.map((x) => formatSetEffort(x, unit, exercise.bodyweight)).join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, emphasis }: { label: string; value: string; sub: string; emphasis?: boolean }) {
  return (
    <div className={cn("space-y-1 rounded-lg border p-3", emphasis ? "border-primary/40 bg-primary/5" : "border-border")}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("tabular text-lg font-semibold leading-tight", emphasis && "text-primary")}>{value}</p>
      <p className="tabular truncate text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

/** 3–6 evenly spaced round ticks around a range, e.g. 1200, 1400 … 2200. */
function niceTicks(min: number, max: number): number[] {
  const span = Math.max(max - min, 1);
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  // Whole numbers only: reps and pounds don't need finer ticks.
  const step = Math.max(1, ([1, 2, 2.5, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag);
  let lo = Math.floor((min - span * 0.1) / step) * step;
  if (min >= 0 && lo < 0) lo = 0;
  const hi = Math.ceil((max + span * 0.1) / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

function ProgressChart({ history, metric, unit }: { history: ExerciseSession[]; metric: Metric; unit: WeightUnit }) {
  const mu = metricUnit(metric, unit);
  const bodyweight = metric === "reps" || metric === "totalReps";
  const data = React.useMemo(() => {
    let best = -Infinity;
    return history.map((s, i): Point => {
      const value = metricValue(s, metric, unit);
      const pr = i > 0 && value > best;
      best = Math.max(best, value);
      return {
        t: Date.parse(`${s.date}T00:00:00Z`) + i, // sessions on the same day stay in order
        date: s.date,
        value,
        pr,
        sets: s.sets.map((x) => formatSet(x, unit, bodyweight)).join(", "),
      };
    });
  }, [history, metric, unit, bodyweight]);

  if (data.length < 2) {
    return (
      <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {data.length === 0
          ? "Log this exercise in a workout and your progress chart starts here."
          : "One session so far — the chart appears after the next one."}
      </p>
    );
  }

  const ticks = niceTicks(Math.min(...data.map((p) => p.value)), Math.max(...data.map((p) => p.value)));
  const prCount = data.filter((p) => p.pr).length;

  return (
    <div className="space-y-2">
      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: -4 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickLine={false}
              axisLine={{ stroke: "hsl(var(--border))" }}
              tick={{ fontSize: 11 }}
              tickFormatter={(t: number) => formatShort(new Date(t).toISOString().slice(0, 10))}
              minTickGap={24}
            />
            <YAxis
              domain={[ticks[0]!, ticks[ticks.length - 1]!]}
              ticks={ticks}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              width={44}
              tickFormatter={(v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : String(v))}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))" }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                if (!p) return null;
                return (
                  <div className="max-w-[16rem] rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
                    <p className="font-semibold">
                      {formatShort(p.date)}
                      {p.pr ? <span className="ml-2 text-primary">Personal record</span> : null}
                    </p>
                    <p className="tabular mt-1 text-sm font-semibold">
                      {p.value.toLocaleString()} {mu}
                    </p>
                    <p className="tabular mt-1 text-muted-foreground">{p.sets}</p>
                  </div>
                );
              }}
            />
            <Line
              dataKey="value"
              type="monotone"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; payload?: Point; index?: number }) => {
                const { cx, cy, payload, index } = props;
                if (cx === undefined || cy === undefined) return <g key={index} />;
                return payload?.pr ? (
                  <g key={index}>
                    <circle cx={cx} cy={cy} r={7} fill="hsl(var(--primary))" fillOpacity={0.2} />
                    <circle cx={cx} cy={cy} r={4.5} fill="hsl(var(--primary))" stroke="hsl(var(--card))" strokeWidth={1.5} />
                  </g>
                ) : (
                  <circle key={index} cx={cx} cy={cy} r={2.5} fill="hsl(var(--primary))" />
                );
              }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/20" />
        Personal record ({prCount}) · values in {mu}
      </p>
    </div>
  );
}
