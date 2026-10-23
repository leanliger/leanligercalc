"use client";

import * as React from "react";
import { Bar, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { SegmentedControl } from "@/components/ui/segmented";
import { addDays, formatShort } from "@/lib/dates";
import type { WeighIn } from "@/lib/tracking";
import type { WeightUnit } from "@/lib/types";
import { fromLb, round } from "@/lib/units";
import { cn } from "@/lib/utils";
import { weeklyIntake, type DayTotals, type IntakeWeek } from "@/lib/weekly-intake";

const RANGES = [8, 12, 26] as const;
type Range = (typeof RANGES)[number];
/** A week's average this far over its target gets the "over target" mark. */
const OVER_BY = 100;

interface Point extends IntakeWeek {
  weight: number | null;
  /** The plan's weight at the end of the week, in the member's unit. */
  plan: number | null;
  /** The week's average daily calorie target. */
  target: number | null;
  /** The bar's height when over target (for the mark on top), else null. */
  overAt: number | null;
}

type Layer = "trend" | "plan" | "calories";

/** A short dotted line across the bar at the week's target. */
function TargetTick(props: { cx?: number; cy?: number }) {
  if (props.cx == null || props.cy == null) return null;
  return (
    <line
      x1={props.cx - 9}
      x2={props.cx + 9}
      y1={props.cy}
      y2={props.cy}
      stroke="hsl(var(--foreground))"
      strokeOpacity={0.6}
      strokeWidth={2}
      strokeDasharray="2 2"
    />
  );
}
/** An amber cap on a bar that ran over target. */
function OverCap(props: { cx?: number; cy?: number }) {
  if (props.cx == null || props.cy == null) return null;
  return <rect x={props.cx - 8} y={props.cy - 6} width={16} height={4} rx={2} fill="hsl(var(--warning))" />;
}

/**
 * Weight vs calories (Progress → Weigh-in, and the coach's Food tab): each
 * week's average logged day as a bar, stacked protein / fat / carbs by their
 * calories, with the week's calorie target marked and an amber cap when it
 * ran over; the week's average weight as a line; and, when there's a plan,
 * the plan's weight as a dashed line (off by default: Plan vs actual shows
 * it). Tap a week for its numbers. Weeks without food logged have no bar.
 */
export function WeeklyIntakeChart({
  days,
  weighIns,
  unit,
  today,
  onNeedFrom,
  weekTarget,
  planWeightFor,
  height = "h-72",
}: {
  /** Daily food totals (dayTotals() of the food logs, or the coach's copy). */
  days: readonly DayTotals[];
  weighIns: readonly WeighIn[];
  unit: WeightUnit;
  today: string;
  /** Ask for older food logs to be loaded back to this date. */
  onNeedFrom?: (date: string) => void;
  /** The average daily calorie target for the week starting on this Monday. */
  weekTarget?: (weekStart: string) => number | null;
  /** The plan's weight on a date, lb. */
  planWeightFor?: (date: string) => number | null;
  /** The chart's height classes (taller on the coach dashboard). */
  height?: string;
}) {
  const [weeks, setWeeks] = React.useState<Range>(12);
  const [layers, setLayers] = React.useState<Record<Layer, boolean>>({ trend: true, plan: false, calories: true });
  const [picked, setPicked] = React.useState<string | null>(null);

  const data: Point[] = React.useMemo(
    () =>
      weeklyIntake(days, weighIns, weeks, today).map((w) => {
        const target = weekTarget?.(w.weekStart) ?? null;
        const planLb = planWeightFor?.(addDays(w.weekStart, 6)) ?? null;
        return {
          ...w,
          weight: w.weightLb === null ? null : round(fromLb(w.weightLb, unit), 1),
          plan: planLb === null ? null : round(fromLb(planLb, unit), 1),
          target,
          overAt: w.kcal !== null && target !== null && w.kcal - target > OVER_BY ? w.kcal : null,
        };
      }),
    [days, weighIns, weeks, today, unit, weekTarget, planWeightFor],
  );
  const firstWeek = data[0]?.weekStart;
  React.useEffect(() => {
    if (firstWeek) onNeedFrom?.(firstWeek);
  }, [firstWeek, onNeedFrom]);

  const hasPlan = data.some((d) => d.plan !== null);
  const hasTargets = data.some((d) => d.target !== null);
  const showPlan = layers.plan && hasPlan;
  const weights = data.flatMap((d) => [d.weight, showPlan ? d.plan : null]).filter((v): v is number => v !== null);
  const anyFood = data.some((d) => d.kcal !== null);
  const pad = weights.length ? Math.max((Math.max(...weights) - Math.min(...weights)) * 0.15, 1) : 1;

  // The selected week: the one tapped, else the latest with food logged.
  const latestWithFood = [...data].reverse().find((d) => d.kcal !== null)?.weekStart ?? data[data.length - 1]?.weekStart ?? null;
  const selected = data.find((d) => d.weekStart === picked) ?? data.find((d) => d.weekStart === latestWithFood) ?? null;
  const selectedIndex = selected ? data.indexOf(selected) : -1;
  const previous = selectedIndex > 0 ? data[selectedIndex - 1]! : null;

  const toggle = (l: Layer) => setLayers((s) => ({ ...s, [l]: !s[l] }));
  const layerButtons: { id: Layer; label: string; swatch: React.ReactNode; show: boolean }[] = [
    { id: "trend", label: "Weight", swatch: <span className="h-0.5 w-3.5 rounded bg-primary" />, show: true },
    { id: "plan", label: "Plan", swatch: <span className="w-3.5 border-t-2 border-dashed border-muted-foreground" />, show: hasPlan },
    {
      id: "calories",
      label: "Calories",
      swatch: (
        <span className="flex h-2.5 w-2.5 flex-col overflow-hidden rounded-sm">
          <span className="flex-1 bg-macro-carb/70" />
          <span className="flex-1 bg-macro-fat/70" />
          <span className="flex-1 bg-macro-protein/70" />
        </span>
      ),
      show: true,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Weight vs calories</h3>
        <SegmentedControl
          ariaLabel="Weeks shown"
          size="sm"
          value={String(weeks)}
          onValueChange={(v) => setWeeks(Number(v) as Range)}
          options={RANGES.map((n) => ({ value: String(n), label: `${n} wk` }))}
          className="w-auto"
        />
      </div>
      <div role="group" aria-label="Show on the graph" className="flex flex-wrap gap-1.5">
        {layerButtons
          .filter((b) => b.show)
          .map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={layers[b.id]}
              onClick={() => toggle(b.id)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                layers[b.id] ? "border-border bg-muted/40 text-foreground" : "border-border/60 text-muted-foreground opacity-70",
              )}
            >
              {b.swatch}
              {b.label}
            </button>
          ))}
      </div>

      {!anyFood && weights.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Log food and weigh in for a couple of weeks and this fills in.
        </p>
      ) : (
        <div className={cn(height, "w-full cursor-pointer")} role="img" aria-label={describe(data, unit)}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 8, right: 0, bottom: 4, left: -8 }}
              onClick={(state: { activeLabel?: string | number } | null) => {
                if (state?.activeLabel != null) setPicked(String(state.activeLabel));
              }}
            >
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
              {selected ? (
                <ReferenceArea
                  yAxisId="kcal"
                  x1={selected.weekStart}
                  x2={selected.weekStart}
                  fill="hsl(var(--primary))"
                  fillOpacity={0.1}
                  strokeOpacity={0}
                />
              ) : null}
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                content={({ active, payload }) => {
                  const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
                  if (!p) return null;
                  return (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                      <p className="font-semibold">Week of {formatShort(p.weekStart)}</p>
                      <p className="tabular text-muted-foreground">
                        {p.kcal === null ? "No food logged" : `${p.kcal.toLocaleString()} kcal a day`}
                        {p.weight === null ? "" : ` · ${p.weight} ${unit}`}
                      </p>
                      <p className="text-muted-foreground">Tap for details</p>
                    </div>
                  );
                }}
              />
              {layers.calories ? (
                <Bar yAxisId="kcal" dataKey="proteinKcal" name="Protein" stackId="kcal" fill="hsl(var(--macro-protein))" fillOpacity={0.55} isAnimationActive={false} />
              ) : null}
              {layers.calories ? (
                <Bar yAxisId="kcal" dataKey="fatKcal" name="Fat" stackId="kcal" fill="hsl(var(--macro-fat))" fillOpacity={0.55} isAnimationActive={false} />
              ) : null}
              {layers.calories ? (
                <Bar
                  yAxisId="kcal"
                  dataKey="carbsKcal"
                  name="Carbs"
                  stackId="kcal"
                  fill="hsl(var(--macro-carb))"
                  fillOpacity={0.55}
                  radius={[3, 3, 0, 0]}
                  isAnimationActive={false}
                />
              ) : null}
              {layers.calories && hasTargets ? (
                <Scatter yAxisId="kcal" dataKey="target" name="Target" shape={<TargetTick />} isAnimationActive={false} />
              ) : null}
              {layers.calories && hasTargets ? (
                <Scatter yAxisId="kcal" dataKey="overAt" name="Over target" shape={<OverCap />} isAnimationActive={false} />
              ) : null}
              {showPlan ? (
                <Line
                  yAxisId="weight"
                  dataKey="plan"
                  name="Plan"
                  type="monotone"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={2}
                  strokeDasharray="6 5"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null}
              {layers.trend ? (
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
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-macro-protein/70" />
          Protein
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-macro-fat/70" />
          Fat
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-macro-carb/70" />
          Carbs
        </span>
        {hasTargets ? (
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 border-t-2 border-dotted border-foreground/60" />
            Target
          </span>
        ) : null}
        {hasTargets ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-3 rounded bg-warning" />
            Over target
          </span>
        ) : null}
      </div>

      {selected ? <WeekDetail week={selected} previous={previous} unit={unit} /> : null}

      <p className="text-[12px] text-muted-foreground">
        Bars: your average logged day each week, by protein, fat and carbs (right axis, kcal). Line: the week&apos;s average weigh-in (left
        axis, {unit}). Weeks with only a few food days logged are less reliable.
      </p>
    </div>
  );
}

/** The tapped week: calories against target, weight change against the plan, and a one-line read. */
function WeekDetail({ week, previous, unit }: { week: Point; previous: Point | null; unit: WeightUnit }) {
  const diff = week.kcal !== null && week.target !== null ? week.kcal - week.target : null;
  const change = week.weight !== null && previous?.weight != null ? round(week.weight - previous.weight, 1) : null;
  const planChange = week.plan !== null && previous?.plan != null ? round(week.plan - previous.plan, 1) : null;
  let story: string | null = null;
  if (week.kcal === null) story = "No food logged this week.";
  else if (diff !== null && change !== null && planChange !== null) {
    if (diff > 200) story = `Calories ran ${diff} over target, and weight moved ${Math.abs(change)} ${unit} against ${Math.abs(planChange)} planned.`;
    else if (diff > 50) story = `A little over target. Weight moved ${Math.abs(change)} ${unit} against ${Math.abs(planChange)} planned.`;
    else if (diff < -150) story = "Well under target. Make sure every day got logged before cutting further.";
    else story = `On target, and weight moved ${Math.abs(change)} ${unit}, against ${Math.abs(planChange)} planned.`;
  }
  const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString()}`;
  return (
    <section aria-label={`Week of ${formatShort(week.weekStart)}`} className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-sm font-semibold">Week of {formatShort(week.weekStart)}</p>
      <div className="tabular grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md bg-background/60 px-3 py-2">
          <p className="text-[12px] text-muted-foreground">Calories a day</p>
          <p className="font-semibold">{week.kcal === null ? "—" : `${week.kcal.toLocaleString()} kcal`}</p>
          <p className={cn("text-[12px]", diff !== null && diff > OVER_BY ? "text-warning" : "text-muted-foreground")}>
            {diff !== null ? `${signed(diff)} vs target ${week.target!.toLocaleString()}` : week.target === null ? "no target" : "—"}
          </p>
        </div>
        <div className="rounded-md bg-background/60 px-3 py-2">
          <p className="text-[12px] text-muted-foreground">Weight</p>
          <p className="font-semibold">{week.weight === null ? "—" : `${week.weight} ${unit}`}</p>
          <p className="text-[12px] text-muted-foreground">
            {change === null ? "—" : `${signed(change)} ${unit}`}
            {planChange !== null ? ` (plan ${signed(planChange)})` : ""}
          </p>
        </div>
      </div>
      {week.kcal !== null ? (
        <p className="tabular text-[12px]">
          <span className="font-medium text-macro-protein">P {week.protein} g</span> ·{" "}
          <span className="font-medium text-macro-carb">C {week.carbs} g</span> ·{" "}
          <span className="font-medium text-macro-fat">F {week.fat} g</span>{" "}
          <span className="text-muted-foreground">
            · {week.foodDays} food day{week.foodDays === 1 ? "" : "s"}, {week.weighIns} weigh-in{week.weighIns === 1 ? "" : "s"}
          </span>
        </p>
      ) : null}
      {story ? <p className="text-sm text-muted-foreground">{story}</p> : null}
    </section>
  );
}

function describe(data: Point[], unit: WeightUnit): string {
  const w = data.filter((d) => d.weight !== null);
  const k = data.filter((d) => d.kcal !== null);
  const parts = [];
  if (w.length >= 2) parts.push(`Average weight from ${w[0]!.weight} to ${w[w.length - 1]!.weight} ${unit}`);
  if (k.length) parts.push(`average calories ${Math.min(...k.map((d) => d.kcal!))} to ${Math.max(...k.map((d) => d.kcal!))} kcal a day`);
  const over = data.filter((d) => d.overAt !== null).length;
  if (over) parts.push(`${over} week${over === 1 ? "" : "s"} over target`);
  return `Weight vs calories over ${data.length} weeks. ${parts.join(", ")}.`;
}
