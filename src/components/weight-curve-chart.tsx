"use client";

import * as React from "react";
import {
  Area,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { WeekProjection, WeightUnit } from "@/lib/types";
import { daysBetween, formatShort } from "@/lib/dates";
import { fromLb, round } from "@/lib/units";

interface WeightCurveChartProps {
  projection: WeekProjection[];
  unit: WeightUnit;
  /** Goal weight in pounds, drawn as a reference line. */
  goalWeight: number | null;
  /**
   * The member's weigh-ins. Those inside the plan's dates are drawn as small
   * dots on their exact day, a quick check of the plan against reality while
   * editing it. The full comparison (with the trend) is Progress → Plan vs actual.
   */
  weighIns?: readonly { date: string; weightLb: number }[];
}

interface WeighInPoint {
  /** Weeks since the plan's start, fractional: a weigh-in sits on its exact day. */
  week: number;
  date: string;
  actual: number;
}

interface ChartPoint {
  week: number;
  date: string;
  weight: number;
  bodyFat: number;
  fatMass: number;
  leanMass: number;
  calories: number;
}

/**
 * Weight and body-fat trajectory.
 *
 * Two y-axes on purpose: weight and body fat percentage live on completely
 * different scales, and overlaying them is the whole point — a good prep shows
 * body fat falling faster than scale weight.
 */
export function WeightCurveChart({ projection, unit, goalWeight, weighIns = [] }: WeightCurveChartProps) {
  const data = React.useMemo<ChartPoint[]>(
    () =>
      projection.map((week) => ({
        week: week.week,
        date: week.date,
        weight: round(fromLb(week.weight, unit), 1),
        bodyFat: week.bodyFat,
        fatMass: round(fromLb(week.fatMass, unit), 1),
        leanMass: round(fromLb(week.leanMass, unit), 1),
        calories: week.targetCalories,
      })),
    [projection, unit],
  );

  const actual = React.useMemo<WeighInPoint[]>(() => {
    const start = projection[0]?.date;
    const end = projection[projection.length - 1]?.date;
    if (!start || !end) return [];
    return weighIns
      .filter((w) => w.date >= start && w.date <= end)
      .map((w) => ({ week: daysBetween(start, w.date) / 7, date: w.date, actual: round(fromLb(w.weightLb, unit), 1) }));
  }, [projection, weighIns, unit]);

  if (data.length < 2) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Enter a goal below your current weight to see the projection.
      </div>
    );
  }

  const weights = [...data.map((d) => d.weight), ...actual.map((a) => a.actual)];
  const goal = goalWeight === null ? null : round(fromLb(goalWeight, unit), 1);
  const minWeight = Math.min(...weights, goal ?? Infinity);
  const maxWeight = Math.max(...weights);
  const pad = Math.max((maxWeight - minWeight) * 0.15, 2);

  // Keep the x-axis readable on long preps and on narrow screens. The axis is
  // numeric (weeks) so weigh-in dots can sit between week marks.
  const step = Math.max(1, Math.ceil((data.length - 1) / 6));
  const lastWeek = data[data.length - 1]!.week;
  const ticks = data.map((d) => d.week).filter((w) => w % step === 0);

  return (
    <div className="h-72 w-full sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
          <defs>
            <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="week"
            type="number"
            domain={[0, lastWeek]}
            ticks={ticks}
            interval={0}
            allowDecimals={false}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fontSize: 11 }}
            tickFormatter={(week: number) => `W${week}`}
          />
          <YAxis
            yAxisId="weight"
            domain={[
              Math.floor(minWeight - pad),
              Math.ceil(maxWeight + pad * 0.4),
            ]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            width={48}
            tickFormatter={(value: number) => `${value}`}
          />
          <YAxis
            yAxisId="bodyFat"
            orientation="right"
            domain={["dataMin - 2", "dataMax + 2"]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            width={40}
            tickFormatter={(value: number) => `${Math.round(value)}%`}
          />

          <Tooltip
            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const weighIn = payload.find((p) => (p.payload as Partial<WeighInPoint>)?.actual !== undefined)?.payload as
                | WeighInPoint
                | undefined;
              if (weighIn) {
                return (
                  <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
                    <p className="font-semibold text-popover-foreground">Weigh-in · {formatShort(weighIn.date)}</p>
                    <p className="mt-1 tabular">
                      {weighIn.actual} {unit}
                    </p>
                  </div>
                );
              }
              const point = payload[0]?.payload as ChartPoint | undefined;
              if (!point) return null;
              return (
                <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
                  <p className="font-semibold text-popover-foreground">
                    Week {point.week} · {formatShort(point.date)}
                  </p>
                  <dl className="mt-1.5 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular">
                    <dt className="text-muted-foreground">Weight</dt>
                    <dd className="text-right font-medium">
                      {point.weight} {unit}
                    </dd>
                    <dt className="text-muted-foreground">Body fat</dt>
                    <dd className="text-right font-medium">{point.bodyFat}%</dd>
                    <dt className="text-muted-foreground">Fat mass</dt>
                    <dd className="text-right font-medium">
                      {point.fatMass} {unit}
                    </dd>
                    <dt className="text-muted-foreground">Lean mass</dt>
                    <dd className="text-right font-medium">
                      {point.leanMass} {unit}
                    </dd>
                    <dt className="text-muted-foreground">Intake</dt>
                    <dd className="text-right font-medium">{point.calories} kcal</dd>
                  </dl>
                </div>
              );
            }}
          />
          <Legend verticalAlign="top" height={28} iconSize={10} wrapperStyle={{ fontSize: 12 }} />

          {goal !== null ? (
            <ReferenceLine
              yAxisId="weight"
              y={goal}
              stroke="hsl(var(--success))"
              strokeDasharray="5 4"
              label={{
                value: `Goal ${goal}${unit}`,
                position: "insideBottomRight",
                fontSize: 11,
                fill: "hsl(var(--success))",
              }}
            />
          ) : null}

          <Area
            yAxisId="weight"
            type="monotone"
            dataKey="weight"
            name={`Weight (${unit})`}
            legendType="plainline"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            fill="url(#weightFill)"
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="bodyFat"
            type="monotone"
            dataKey="bodyFat"
            name="Body fat (%)"
            legendType="plainline"
            stroke="hsl(var(--macro-fat))"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={false}
            activeDot={{ r: 4 }}
          />
          {actual.length > 0 ? (
            <Scatter
              yAxisId="weight"
              data={actual}
              dataKey="actual"
              name="Weigh-ins"
              fill="hsl(var(--foreground))"
              isAnimationActive={false}
              shape={(props: { cx?: number; cy?: number }) => (
                <circle cx={props.cx} cy={props.cy} r={2.75} fill="hsl(var(--foreground))" fillOpacity={0.85} />
              )}
              legendType="circle"
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
