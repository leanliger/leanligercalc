"use client";

import * as React from "react";
import { Dumbbell, Target } from "lucide-react";
import {
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/coach-today";
import type { MemberSummary } from "@/lib/coach";
import { healthZone } from "@/lib/coach";
import {
  EFFORT_LINE,
  MUSCLE_CHART_WEEKS,
  QUADRANTS,
  RESULTS_LINE,
  effortVsResults,
  muscleKeptSeries,
  type EffortPoint,
  type Quadrant,
} from "@/lib/combined-charts";
import { formatShort } from "@/lib/dates";
import type { Workout } from "@/lib/training";
import type { WeighIn } from "@/lib/tracking";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * Two measures on one chart (src/lib/combined-charts.ts): a member's weight
 * against their strength (Insights tab), and every member's consistency
 * against their progress (Members → Chart).
 */

const r1 = (x: number) => Math.round(x * 10) / 10;

/* ------------------------------- muscle kept ------------------------------- */

export function MuscleKeptChart({
  workouts,
  weighIns,
  unit,
  today,
}: {
  workouts: readonly Workout[];
  weighIns: readonly Pick<WeighIn, "date" | "weightLb">[];
  unit: WeightUnit;
  today: string;
}) {
  const series = React.useMemo(() => muscleKeptSeries(workouts, weighIns, today), [workouts, weighIns, today]);
  return (
    <Card>
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Dumbbell className="h-4 w-4 text-primary" />
          Weight vs strength
        </CardTitle>
        <CardDescription>
          Trend weight against a strength index of their main lifts (100 = where each lift started), over {MUSCLE_CHART_WEEKS} weeks.
          {series.lifts.length ? ` Lifts: ${series.lifts.join(", ")}.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <MuscleKeptPlot series={series} unit={unit} />
      </CardContent>
    </Card>
  );
}

/** The weight and strength lines, their changes and a one-line verdict. */
export function MuscleKeptPlot({
  series: { points, weightChangeLb, strengthChange },
  unit,
}: {
  series: Pick<ReturnType<typeof muscleKeptSeries>, "points" | "weightChangeLb" | "strengthChange">;
  unit: WeightUnit;
}) {
  const data = points.map((p) => ({ ...p, weight: p.weightLb === null ? null : r1(fromLb(p.weightLb, unit)) }));
  const weights = data.map((p) => p.weight).filter((v): v is number => v !== null);
  const strengths = data.map((p) => p.strength).filter((v): v is number => v !== null);
  const enough = weights.length >= 2 && strengths.length >= 2;
  const wPad = weights.length ? Math.max((Math.max(...weights) - Math.min(...weights)) * 0.15, 1) : 1;
  const sLo = Math.min(90, ...strengths);
  const sHi = Math.max(110, ...strengths);
  const verdict =
    weightChangeLb === null || strengthChange === null
      ? null
      : weightChangeLb < -1 && strengthChange >= -2
        ? { text: "Weight down, strength holding: muscle kept.", tone: "text-success" }
        : weightChangeLb < -1 && strengthChange < -2
          ? { text: "Weight and strength both down: watch protein, sleep and the size of the deficit.", tone: "text-warning" }
          : strengthChange > 2
            ? { text: "Getting stronger.", tone: "text-success" }
            : { text: "Weight and strength steady.", tone: "text-muted-foreground" };
  // About six date labels, however many weeks.
  const tickEvery = Math.max(0, Math.ceil(data.length / 6) - 1);

  return (
    <>
        {!enough ? (
          <p className="text-sm text-muted-foreground">Needs a few weeks of weigh-ins and at least one lift logged twice to draw.</p>
        ) : (
          <>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 4, left: -8 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} tick={{ fontSize: 11 }} tickFormatter={(d: string) => formatShort(d)} interval={tickEvery} />
                  <YAxis
                    yAxisId="w"
                    domain={[Math.floor(Math.min(...weights) - wPad), Math.ceil(Math.max(...weights) + wPad)]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--primary))" }}
                    width={44}
                  />
                  <YAxis
                    yAxisId="s"
                    orientation="right"
                    domain={[Math.floor(sLo - 2), Math.ceil(sHi + 2)]}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "hsl(var(--success))" }}
                    width={36}
                  />
                  <ReferenceLine yAxisId="s" y={100} stroke="hsl(var(--success))" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Tooltip
                    cursor={{ stroke: "hsl(var(--border))" }}
                    content={({ active, payload }) => {
                      const p = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
                      if (!p) return null;
                      return (
                        <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
                          <p className="font-semibold">Week to {formatShort(p.date)}</p>
                          <p className="tabular text-primary">Weight {p.weight === null ? "—" : `${p.weight} ${unit}`}</p>
                          <p className="tabular text-success">Strength {p.strength === null ? "—" : p.strength}</p>
                        </div>
                      );
                    }}
                  />
                  <Line yAxisId="w" type="monotone" dataKey="weight" name="Weight" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} connectNulls />
                  <Line yAxisId="s" type="monotone" dataKey="strength" name="Strength" stroke="hsl(var(--success))" strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-primary" aria-hidden /> Weight ({unit}, left)
                {weightChangeLb !== null ? <span className="tabular text-muted-foreground"> {weightChangeLb <= 0 ? "−" : "+"}{r1(Math.abs(fromLb(weightChangeLb, unit)))} {unit}</span> : null}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-success" aria-hidden /> Strength index (right)
                {strengthChange !== null ? <span className="tabular text-muted-foreground"> {strengthChange >= 0 ? "+" : "−"}{Math.abs(strengthChange)}%</span> : null}
              </span>
            </div>
            {verdict ? <p className={cn("text-sm font-medium", verdict.tone)}>{verdict.text}</p> : null}
          </>
        )}
    </>
  );
}

/* ----------------------------- effort vs results ----------------------------- */

const ZONE_FILL = { green: "hsl(var(--success))", yellow: "hsl(var(--warning))", red: "hsl(var(--destructive))" } as const;
const QUADRANT_ORDER: Quadrant[] = ["stalling", "drifting", "lucky", "on-track"];

export function EffortResultsChart({ members, onOpen }: { members: MemberSummary[]; onOpen: (id: string) => void }) {
  const { points, missing } = React.useMemo(() => effortVsResults(members), [members]);
  const avatars = React.useMemo(() => new Map(members.map((m) => [m.data.userId, m.data.avatarUrl])), [members]);
  const byQuadrant = (q: Quadrant) => points.filter((p) => p.quadrant === q);

  return (
    <Card>
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" />
          Effort vs results
        </CardTitle>
        <CardDescription>
          Across: how consistent they've been over the last 7 days (days logged, and their habit score). Up: their weekly rate against their plan&apos;s (1× = exactly
          on plan). Colour: health score. Tap a dot to open them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {points.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody has enough weigh-ins against a plan yet to place on the chart.</p>
        ) : (
          <div className="relative h-80 w-full">
            {/* The four corners, named. */}
            <span className="pointer-events-none absolute left-14 top-2 text-[11px] font-semibold text-muted-foreground">Inconsistent, losing anyway</span>
            <span className="pointer-events-none absolute right-3 top-2 text-[11px] font-semibold text-success">Consistent, on track</span>
            <span className="pointer-events-none absolute bottom-10 left-14 text-[11px] font-semibold text-destructive">Inconsistent, stalling</span>
            <span className="pointer-events-none absolute bottom-10 right-3 text-[11px] font-semibold text-warning">Consistent, stalling</span>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 12, bottom: 16, left: -4 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="effort"
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  label={{ value: "Consistency", position: "insideBottom", offset: -10, fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  type="number"
                  dataKey="results"
                  domain={[-0.5, 2]}
                  ticks={[-0.5, 0, 0.5, 1, 1.5, 2]}
                  tickFormatter={(v: number) => `${v}×`}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <ZAxis range={[90, 90]} />
                <ReferenceLine x={EFFORT_LINE} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                <ReferenceLine y={RESULTS_LINE} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                <ReferenceLine y={1} stroke="hsl(var(--success))" strokeOpacity={0.35} />
                <Tooltip
                  cursor={false}
                  content={({ active, payload }) => {
                    const p = active ? (payload?.[0]?.payload as EffortPoint | undefined) : undefined;
                    if (!p) return null;
                    return (
                      <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
                        <p className="font-semibold">{p.name}</p>
                        <p className="tabular">Consistency {p.effort}% · {p.results}× plan</p>
                        <p className="text-muted-foreground">{QUADRANTS[p.quadrant].label}</p>
                      </div>
                    );
                  }}
                />
                <Scatter data={points} onClick={(p: { payload?: EffortPoint }) => p.payload && onOpen(p.payload.id)} className="cursor-pointer">
                  {points.map((p) => (
                    <Cell key={p.id} fill={p.healthScore === null ? "hsl(var(--muted-foreground))" : ZONE_FILL[healthZone(p.healthScore)]} stroke="hsl(var(--background))" strokeWidth={1.5} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* The same, as lists: each corner and what to do about it. */}
        {points.length > 0 ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            {QUADRANT_ORDER.map((q) => {
              const list = byQuadrant(q);
              return (
                <div key={q} className="space-y-1.5 rounded-xl border border-border p-3">
                  <p className="text-sm font-semibold">
                    {QUADRANTS[q].label} <span className="tabular font-normal text-muted-foreground">({list.length})</span>
                  </p>
                  <p className="text-[12px] text-muted-foreground">{QUADRANTS[q].job}</p>
                  {list.length ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {list.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => onOpen(p.id)}
                            className="flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-0.5 pr-2.5 text-[12px] font-medium hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Avatar name={p.name} url={avatars.get(p.id) ?? null} size="h-5 w-5" />
                            {p.name}
                            <span className="tabular text-muted-foreground">
                              {p.effort}% · {p.results}×
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {missing > 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {missing} member{missing === 1 ? "" : "s"} not shown: not enough weigh-ins against a plan yet.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
