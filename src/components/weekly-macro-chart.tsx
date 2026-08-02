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
 * The seven scheduled days laid out in order, so the user can see the actual
 * shape of the week rather than just three summary cards.
 *
 * Days are ordered high → medium → low and then interleaved, which is how these
 * schedules are normally written: hard sessions get the high days, and low days
 * land on rest days rather than back-to-back.
 */
function buildWeek(result: CarbCyclingResult): WeekBar[] {
  const pool: WeekBar[] = [];
  for (const plan of result.days) {
    for (let i = 0; i < plan.count; i++) {
      pool.push({
        day: "",
        type: plan.type,
        calories: plan.calories,
        carbs: plan.carbs,
        protein: plan.protein,
        fat: plan.fat,
      });
    }
  }

  // Spread the high days evenly through the week instead of stacking them.
  const highs = pool.filter((d) => d.type === "high");
  const mediums = pool.filter((d) => d.type === "medium");
  const lows = pool.filter((d) => d.type === "low");
  const ordered: WeekBar[] = [];
  const total = pool.length;
  const spacing = highs.length > 0 ? Math.max(Math.floor(total / highs.length), 1) : total;

  let highIndex = 0;
  let lowIndex = 0;
  let mediumIndex = 0;

  for (let i = 0; i < total; i++) {
    let next: WeekBar | undefined;
    if (highIndex < highs.length && i % spacing === 0) {
      next = highs[highIndex++];
    } else if (mediumIndex < mediums.length) {
      next = mediums[mediumIndex++];
    } else if (lowIndex < lows.length) {
      next = lows[lowIndex++];
    } else if (highIndex < highs.length) {
      next = highs[highIndex++];
    }
    if (next) ordered.push(next);
  }

  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return ordered.map((entry, index) => ({ ...entry, day: labels[index] ?? `D${index + 1}` }));
}

export function WeeklyMacroChart({ result }: { result: CarbCyclingResult }) {
  const data = React.useMemo(() => buildWeek(result), [result]);

  if (data.length === 0) {
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
