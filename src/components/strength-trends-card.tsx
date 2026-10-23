"use client";

import * as React from "react";
import { Minus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented";
import { formatShort } from "@/lib/dates";
import { MUSCLES, MUSCLE_LABELS, type Exercise, type Muscle } from "@/lib/exercises";
import { TREND_WEEKS, strengthTrends, type LiftTrend, type TrendStatus } from "@/lib/strength-trends";
import { findExercise, formatLoad, type Workout } from "@/lib/training";
import type { WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<TrendStatus, { label: string; chip: string; line: string; icon: React.ReactNode }> = {
  up: { label: "Stronger", chip: "bg-success/15 text-success", line: "stroke-success", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  hold: { label: "Holding", chip: "bg-muted text-muted-foreground", line: "stroke-muted-foreground", icon: <Minus className="h-3.5 w-3.5" /> },
  down: { label: "Slipping", chip: "bg-destructive/15 text-destructive", line: "stroke-destructive", icon: <TrendingDown className="h-3.5 w-3.5" /> },
  new: { label: "New", chip: "bg-primary/10 text-primary", line: "stroke-primary", icon: <Sparkles className="h-3.5 w-3.5" /> },
};

type Range = "recent" | "all";
const RANGES: { value: Range; label: string }[] = [
  { value: "recent", label: `${TREND_WEEKS} weeks` },
  { value: "all", label: "All time" },
];

/** A small line of a lift's sessions, coloured by its trend. */
function Sparkline({ values, status }: { values: readonly number[]; status: TrendStatus }) {
  const pts = values.slice(-12);
  if (pts.length < 2) return <span className="order-last col-span-2 block h-10 w-full sm:order-none sm:col-span-1 sm:w-32" aria-hidden />;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const d = pts.map((v, i) => `${((i / (pts.length - 1)) * 116 + 2).toFixed(1)},${(37 - ((v - lo) / (hi - lo || 1)) * 34).toFixed(1)}`).join(" ");
  return (
    // On a phone it gets its own row, the full width of the card.
    <svg viewBox="0 0 120 40" preserveAspectRatio="none" className="order-last col-span-2 h-10 w-full shrink-0 sm:order-none sm:col-span-1 sm:w-32" aria-hidden>
      <polyline points={d} fill="none" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" className={STATUS[status].line} />
    </svg>
  );
}

const valueText = (t: LiftTrend, unit: WeightUnit) =>
  t.bodyweight ? `${t.current} reps${t.oneSide ? "/side" : ""}` : `${formatLoad(t.current, unit)} ${unit}`;
const pctText = (p: number | null) => (p === null ? "—" : `${p > 0 ? "+" : ""}${p.toFixed(1)}%`);

/**
 * Every lift trained in the last four weeks, grouped by muscle: a trend line,
 * its estimated max now, the change over six weeks (or since its first
 * session) and Stronger / Holding / Slipping. Tapping one opens its own page.
 */
export function StrengthTrendsCard({
  workouts,
  unit,
  today,
  onOpen,
  custom = [],
  who,
}: {
  workouts: readonly Workout[];
  unit: WeightUnit;
  today: string;
  onOpen: (exerciseId: string) => void;
  /** The member's own exercises, for their muscle group. */
  custom?: readonly Exercise[];
  /** The member's first name, on the coach dashboard. */
  who?: string;
}) {
  const trends = React.useMemo(() => strengthTrends(workouts, today), [workouts, today]);
  const [range, setRange] = React.useState<Range>("recent");
  const counts = { up: 0, hold: 0, down: 0, new: 0 } as Record<TrendStatus, number>;
  for (const t of trends) counts[t.status]++;

  // By muscle, in the library's order; within one, slipping first, then most recently trained.
  const order: Record<TrendStatus, number> = { down: 0, up: 1, hold: 2, new: 3 };
  const groups = React.useMemo(() => {
    const by = new Map<Muscle | "other", LiftTrend[]>();
    for (const t of trends) {
      const m = findExercise(t.exerciseId, custom)?.muscle ?? "other";
      by.set(m, [...(by.get(m) ?? []), t]);
    }
    return [...MUSCLES, "other" as const]
      .filter((m) => by.has(m))
      .map((m) => ({ muscle: m, label: m === "other" ? "Other" : MUSCLE_LABELS[m], items: by.get(m)!.sort((a, b) => order[a.status] - order[b.status]) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- order is a constant
  }, [trends, custom]);

  return (
    <Card>
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-primary">
            <TrendingUp className="h-3.5 w-3.5" />
            Strength trends
          </CardTitle>
          {trends.length > 0 ? <SegmentedControl ariaLabel="Period" size="sm" value={range} onValueChange={setRange} options={RANGES} className="w-auto" /> : null}
        </div>
        <CardDescription className="text-xs">
          {trends.length === 0
            ? `Log a lift a few times and ${who ? `${who}'s` : "your"} trend shows here.`
            : `${counts.up} stronger · ${counts.hold} holding · ${counts.down} slipping over ${TREND_WEEKS} weeks. Holding strength during a cut is a win.`}
        </CardDescription>
      </CardHeader>
      {trends.length > 0 ? (
        <CardContent className="space-y-4 pt-0">
          {groups.map((g) => (
            <section key={g.muscle} aria-label={g.label}>
              <h3 className="mb-0.5 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.label}
                <span className="tabular font-normal normal-case tracking-normal">
                  {g.items.length} {g.items.length === 1 ? "lift" : "lifts"}
                </span>
              </h3>
              <ul className="divide-y divide-primary/[0.08]">
                {g.items.map((t) => {
                  const s = STATUS[t.status];
                  const pct = range === "recent" ? t.changePct : t.allTimePct;
                  return (
                    <li key={t.exerciseId}>
                      <button
                        type="button"
                        onClick={() => onOpen(t.exerciseId)}
                        aria-label={`${t.name}: ${s.label.toLowerCase()}${pct === null ? "" : `, ${pct > 0 ? "up" : "down"} ${Math.abs(Math.round(pct * 10) / 10)}% ${range === "recent" ? `over ${TREND_WEEKS} weeks` : `since ${formatShort(t.firstDate)}`}`}. Open its chart`}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-xl px-1 py-2 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_8rem_5.5rem_5.5rem_6rem]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{t.name}</span>
                          <span className="tabular block text-xs text-muted-foreground sm:hidden">
                            {valueText(t, unit)} · {pctText(pct)}
                            {range === "all" && pct !== null ? ` since ${formatShort(t.firstDate)}` : ""}
                          </span>
                        </span>
                        <Sparkline values={t.series.map((p) => p.value)} status={t.status} />
                        <span className="tabular hidden text-sm sm:block">{valueText(t, unit)}</span>
                        <span
                          className={cn(
                            "tabular hidden text-sm leading-tight sm:block",
                            pct === null ? "text-muted-foreground" : pct > 0 ? "text-success" : pct < 0 ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {pctText(pct)}
                          {range === "all" && pct !== null ? <span className="block text-[11px] text-muted-foreground">since {formatShort(t.firstDate)}</span> : null}
                        </span>
                        <span className={cn("inline-flex items-center gap-1 justify-self-start rounded-full px-2 py-0.5 text-xs font-bold", s.chip)}>
                          {s.icon}
                          {s.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
