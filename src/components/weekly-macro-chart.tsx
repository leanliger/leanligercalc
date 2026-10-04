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
}: {
  result: CarbCyclingResult;
  pattern: readonly DayType[];
}) {
  const data = React.useMemo(() => buildWeek(result, pattern), [result, pattern]);

  if (data.length === 0 || result.baseline.carbs <= 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Set a 7-day schedule to see the weekly shape.
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.calories));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            domain={[0, Math.ceil((max * 1.15) / 100) * 100]}
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
              value: "baseline",
              position: "right",
              fontSize: 10,
              fill: "hsl(var(--muted-foreground))",
            }}
          />
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
