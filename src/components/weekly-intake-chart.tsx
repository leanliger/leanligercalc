"use client";

import * as React from "react";
import { Bar, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SegmentedControl } from "@/components/ui/segmented";
import { formatShort } from "@/lib/dates";
import type { WeighIn } from "@/lib/tracking";
import type { WeightUnit } from "@/lib/types";
import { fromLb, round } from "@/lib/units";
import { weeklyIntake, type DayTotals, type IntakeWeek } from "@/lib/weekly-intake";

const RANGES = [8, 12, 26] as const;
type Range = (typeof RANGES)[number];

interface Point extends IntakeWeek {
  weight: number | null;
}

/**
 * Weekly weigh-ins vs calories: each week's average logged day as a bar,
 * stacked protein / fat / carbs by their calories, with the week's average
 * weight as a line on its own axis. Weeks without food logged have no bar;
 * weeks without weigh-ins are skipped by the line.
 */
export function WeeklyIntakeChart({
  days,
  weighIns,
  unit,
  today,
  onNeedFrom,
}: {
  /** Daily food totals (dayTotals() of the food logs, or the coach's copy). */
  days: readonly DayTotals[];
  weighIns: readonly WeighIn[];
  unit: WeightUnit;
  today: string;
  /** Ask for older food logs to be loaded back to this date. */
  onNeedFrom?: (date: string) => void;
}) {
  const [weeks, setWeeks] = React.useState<Range>(12);
  const data: Point[] = React.useMemo(
    () =>
      weeklyIntake(days, weighIns, weeks, today).map((w) => ({
        ...w,
        weight: w.weightLb === null ? null : round(fromLb(w.weightLb, unit), 1),
      })),
    [days, weighIns, weeks, today, unit],
  );
  const firstWeek = data[0]?.weekStart;
  React.useEffect(() => {
    if (firstWeek) onNeedFrom?.(firstWeek);
  }, [firstWeek, onNeedFrom]);

  const weights = data.map((d) => d.weight).filter((v): v is number => v !== null);
  const anyFood = data.some((d) => d.kcal !== null);
  const pad = weights.length ? Math.max((Math.max(...weights) - Math.min(...weights)) * 0.15, 1) : 1;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Weekly weigh-ins vs calories</h3>
        <SegmentedControl
          ariaLabel="Weeks shown"
          size="sm"
          value={String(weeks)}
          onValueChange={(v) => setWeeks(Number(v) as Range)}
          options={RANGES.map((n) => ({ value: String(n), label: `${n} wk` }))}
          className="w-auto"
        />
      </div>
      {!anyFood && weights.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Log food and weigh in for a couple of weeks and this fills in.
        </p>
      ) : (
        <div className="h-72 w-full" role="img" aria-label={describe(data, unit)}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 0, bottom: 4, left: -8 }}>
              <XAxis
                dataKey="weekStart"
                tickLine={false}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tick={{ fontSize: 11 }}
                interval={weeks > 12 ? 2 : weeks > 8 ? 1 : 0}
                tickFormatter={(d: string) => formatShort(d)}
              />
              <YAxis
                yAxisId="weight"
                domain={weights.length ? [Math.floor(Math.min(...weights) - pad), Math.ceil(Math.max(...weights) + pad)] : [0, 1]}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                width={44}
              />
              <YAxis
                yAxisId="kcal"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                width={44}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v))}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                content={({ active, payload }) => {
                  const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                  if (!p) return null;
                  return (
                    <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-lg">
                      <p className="font-semibold">Week of {formatShort(p.weekStart)}</p>
                      <dl className="tabular mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
                        <dt className="text-muted-foreground">Avg weight</dt>
                        <dd className="text-right font-medium">{p.weight === null ? "—" : `${p.weight} ${unit}`}</dd>
                        <dt className="text-muted-foreground">Avg calories</dt>
                        <dd className="text-right font-medium">{p.kcal === null ? "—" : `${p.kcal.toLocaleString()} kcal`}</dd>
                        {p.kcal !== null ? (
                          <>
                            <dt className="text-macro-protein">Protein</dt>
                            <dd className="text-right">{p.protein} g</dd>
                            <dt className="text-macro-fat">Fat</dt>
                            <dd className="text-right">{p.fat} g</dd>
                            <dt className="text-macro-carb">Carbs</dt>
                            <dd className="text-right">{p.carbs} g</dd>
                          </>
                        ) : null}
                        <dt className="text-muted-foreground">Logged</dt>
                        <dd className="text-right">
                          {p.foodDays} food · {p.weighIns} weigh-in{p.weighIns === 1 ? "" : "s"}
                        </dd>
                      </dl>
                    </div>
                  );
                }}
              />
              <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="kcal" dataKey="proteinKcal" name="Protein" stackId="kcal" fill="hsl(var(--macro-protein))" fillOpacity={0.55} isAnimationActive={false} />
              <Bar yAxisId="kcal" dataKey="fatKcal" name="Fat" stackId="kcal" fill="hsl(var(--macro-fat))" fillOpacity={0.55} isAnimationActive={false} />
              <Bar yAxisId="kcal" dataKey="carbsKcal" name="Carbs" stackId="kcal" fill="hsl(var(--macro-carb))" fillOpacity={0.55} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Line
                yAxisId="weight"
                dataKey="weight"
                name={`Weight (${unit})`}
                type="monotone"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-[12px] text-muted-foreground">
        Bars: your average logged day each week (left: weight in {unit}, right: calories). Weeks with only a few food days logged are
        less reliable.
      </p>
    </div>
  );
}

function describe(data: Point[], unit: WeightUnit): string {
  const w = data.filter((d) => d.weight !== null);
  const k = data.filter((d) => d.kcal !== null);
  const parts = [];
  if (w.length >= 2) parts.push(`Average weight from ${w[0]!.weight} to ${w[w.length - 1]!.weight} ${unit}`);
  if (k.length) parts.push(`average calories ${Math.min(...k.map((d) => d.kcal!))} to ${Math.max(...k.map((d) => d.kcal!))} kcal a day`);
  return `Weekly weigh-ins vs calories over ${data.length} weeks. ${parts.join(", ")}.`;
}
