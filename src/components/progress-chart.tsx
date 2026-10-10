"use client";

import * as React from "react";
import {
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { predictedWeightOn, trendSeries } from "@/lib/adaptive";
import { addDays, formatShort } from "@/lib/dates";
import type { FatLossResult, WeightUnit } from "@/lib/types";
import type { WeighIn } from "@/lib/tracking";
import { fromLb, round } from "@/lib/units";

interface ProgressChartProps {
  timeline: FatLossResult;
  weighIns: WeighIn[];
  unit: WeightUnit;
  today: string | null;
  /** Show the whole plan, or zoom to where the weigh-ins are. */
  range?: "plan" | "recent";
  height?: string;
}

interface Point {
  date: string;
  predicted: number | null;
  actual: number | null;
  trend: number | null;
}

/**
 * Predicted vs actual weight. Three series, deliberately different marks:
 *
 *   plan    dashed line  — what the timeline expects
 *   actual  dots only    — individual weigh-ins (noisy by nature)
 *   trend   solid line   — smoothed weigh-ins; the one to judge progress by
 */
export function ProgressChart({
  timeline,
  weighIns,
  unit,
  today,
  range = "plan",
  height = "h-72",
}: ProgressChartProps) {
  const data = React.useMemo<Point[]>(() => {
    if (!timeline.feasible) return [];
    const start = timeline.requiredStartDate;
    const relevant = weighIns.filter((w) => w.date >= addDays(start, -7));
    const lastLogged = relevant[relevant.length - 1]?.date;

    let from = relevant[0] && relevant[0].date < start ? relevant[0].date : start;
    let to = lastLogged && lastLogged > timeline.finishDate ? lastLogged : timeline.finishDate;
    if (range === "recent" && lastLogged) {
      // Five weeks back from the latest weigh-in, two weeks ahead.
      from = [addDays(lastLogged, -35), from].sort().pop()!;
      to = [addDays(lastLogged, 14), to].sort()[0]!;
    }

    const actual = new Map(relevant.map((w) => [w.date, w.weightLb]));
    const trend = new Map(trendSeries(relevant).map((t) => [t.date, t.trend]));
    const points: Point[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const p = predictedWeightOn(timeline, d);
      const a = actual.get(d);
      const t = trend.get(d);
      points.push({
        date: d,
        predicted: p === null || d < timeline.requiredStartDate ? null : round(fromLb(p, unit), 1),
        actual: a === undefined ? null : round(fromLb(a, unit), 1),
        trend: t === undefined ? null : round(fromLb(t, unit), 1),
      });
    }
    return points;
  }, [timeline, weighIns, unit, range]);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Set a goal in Plan → Timeline to see the plan.
      </div>
    );
  }

  const values = data.flatMap((p) => [p.predicted, p.actual, p.trend]).filter((v): v is number => v !== null);
  const goal = round(fromLb(timeline.endWeight, unit), 1);
  // In the zoomed view the goal can be 20+ lb below the data; stretching the
  // axis to include it would flatten the weeks being examined into a sliver.
  const min = range === 'recent' ? Math.min(...values) : Math.min(...values, goal);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.08, 1);
  const tickInterval = Math.max(Math.floor(data.length / 8), 0);
  const showToday = today !== null && today >= data[0]!.date && today <= data[data.length - 1]!.date;

  return (
    <div className={`${height} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
          <XAxis
            dataKey="date"
            interval={tickInterval}
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fontSize: 11 }}
            tickFormatter={(d: string) => formatShort(d)}
          />
          <YAxis
            domain={[Math.floor(min - pad), Math.ceil(max + pad)]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--border))" }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
              if (!p) return null;
              const diff = p.trend !== null && p.predicted !== null ? round(p.trend - p.predicted, 1) : null;
              return (
                <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
                  <p className="font-semibold">{formatShort(p.date)}</p>
                  <dl className="tabular mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
                    {p.predicted !== null ? (
                      <>
                        <dt className="text-muted-foreground">Plan</dt>
                        <dd className="text-right">{p.predicted} {unit}</dd>
                      </>
                    ) : null}
                    {p.actual !== null ? (
                      <>
                        <dt className="text-muted-foreground">Weigh-in</dt>
                        <dd className="text-right font-medium">{p.actual} {unit}</dd>
                      </>
                    ) : null}
                    {p.trend !== null ? (
                      <>
                        <dt className="text-muted-foreground">Trend</dt>
                        <dd className="text-right font-medium">{p.trend} {unit}</dd>
                      </>
                    ) : null}
                    {diff !== null ? (
                      <>
                        <dt className="text-muted-foreground">vs plan</dt>
                        <dd className="text-right">{diff > 0 ? "+" : ""}{diff} {unit}</dd>
                      </>
                    ) : null}
                  </dl>
                </div>
              );
            }}
          />
          <Legend verticalAlign="top" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine
            y={goal}
            stroke="hsl(var(--success))"
            strokeDasharray="5 4"
            label={{ value: `Goal ${goal}`, position: "insideBottomRight", fontSize: 11, fill: "hsl(var(--success))" }}
          />
          {showToday ? (
            <ReferenceLine
              x={today!}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="2 3"
              label={{ value: "Today", position: "insideTopLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
          ) : null}
          <Line
            dataKey="predicted"
            name="Plan"
            type="monotone"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            dataKey="actual"
            name="Weigh-ins"
            // Width 0 hides the connecting line but keeps a real colour, which
            // the legend uses for both its marker and its label text.
            stroke="hsl(var(--macro-carb))"
            strokeWidth={0}
            legendType="circle"
            dot={{ r: 2.5, fill: "hsl(var(--macro-carb))", stroke: "none" }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Line
            dataKey="trend"
            name="Trend"
            type="monotone"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
