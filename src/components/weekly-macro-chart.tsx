"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DAY_LABELS } from "@/lib/carb-cycling";
import type { CarbCyclingResult, DayType } from "@/lib/types";
import { WEEKDAY_SHORT } from "@/lib/weekday-pattern";

const DAY_COLORS: Record<DayType, string> = {
  high: "hsl(var(--day-high))",
  medium: "hsl(var(--day-medium))",
  low: "hsl(var(--day-low))",
};

interface WeekBar {
  day: string;
  type: DayType;
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
}

/**
 * The seven days laid out Monday to Sunday using the same weekday pattern the
 * roadmap calendar uses, so "Monday" means the same thing in both places.
 */
function buildWeek(result: CarbCyclingResult, pattern: readonly DayType[]): WeekBar[] {
  const byType = new Map(result.days.map((d) => [d.type, d]));
  return pattern.flatMap((type, index) => {
    const plan = byType.get(type);
    if (!plan) return [];
    return [
      {
        day: WEEKDAY_SHORT[index] ?? `D${index + 1}`,
        type,
        calories: plan.calories,
        carbs: plan.carbs,
        protein: plan.protein,
        fat: plan.fat,
      },
    ];
  });
}

export function WeeklyMacroChart({
  result,
  pattern,
  maintenance,
}: {
  result: CarbCyclingResult;
  pattern: readonly DayType[];
  /** Maintenance calories, drawn as a line so it's clear where every day sits against it. */
  maintenance?: number;
}) {
  const data = React.useMemo(() => buildWeek(result, pattern), [result, pattern]);

  if (data.length === 0 || result.baseline.carbs <= 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Set a 7-day schedule to see the weekly shape.
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.calories), maintenance ?? 0);
  // Round steps on the calorie axis (0, 1,000, 2,000, 3,000), with room above the maintenance line.
  const step = max * 1.1 <= 2000 ? 500 : 1000;
  const top = Math.ceil((max * 1.1) / step) * step;
  const yTicks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {/* Right margin leaves room for the "target" label beside its line. */}
        <BarChart data={data} margin={{ top: 8, right: 40, bottom: 0, left: -12 }}>
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            domain={[0, top]}
            ticks={yTicks}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            width={52}
          />
          <ReferenceLine
            y={result.baseline.calories}
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            label={{
              value: "target",
              position: "right",
              fontSize: 10,
              fill: "hsl(var(--muted-foreground))",
            }}
          />
          {maintenance ? (
            <ReferenceLine
              y={maintenance}
              stroke="hsl(var(--success))"
              label={{
                value: "maintenance",
                position: "insideTopRight",
                fontSize: 10,
                fill: "hsl(var(--success))",
              }}
            />
          ) : null}
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as WeekBar | undefined;
              if (!point) return null;
              return (
                <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
                  <p className="font-semibold">
                    {point.day} · {DAY_LABELS[point.type]}
                  </p>
                  <p className="tabular mt-1 font-medium">
                    {point.calories.toLocaleString()} kcal
                  </p>
                  <p className="tabular mt-0.5 text-muted-foreground">
                    P {point.protein}g · C {point.carbs}g · F {point.fat}g
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="calories" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {data.map((entry, index) => (
              <Cell key={index} fill={DAY_COLORS[entry.type]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
