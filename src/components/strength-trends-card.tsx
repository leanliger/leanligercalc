"use client";

import * as React from "react";
import { Minus, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TREND_WEEKS, strengthTrends, type LiftTrend, type TrendStatus } from "@/lib/strength-trends";
import { formatLoad, type Workout } from "@/lib/training";
import type { WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<TrendStatus, { label: string; chip: string; line: string; icon: React.ReactNode }> = {
  up: { label: "Stronger", chip: "bg-success/15 text-success", line: "stroke-success", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  hold: { label: "Holding", chip: "bg-muted text-muted-foreground", line: "stroke-muted-foreground", icon: <Minus className="h-3.5 w-3.5" /> },
  down: { label: "Slipping", chip: "bg-destructive/15 text-destructive", line: "stroke-destructive", icon: <TrendingDown className="h-3.5 w-3.5" /> },
  new: { label: "New", chip: "bg-primary/10 text-primary", line: "stroke-primary", icon: <Sparkles className="h-3.5 w-3.5" /> },
};

/** Lifts shown before "Show all". */
const SHOWN = 6;

/** A small line of a lift's sessions, coloured by its trend. */
function Sparkline({ values, status }: { values: readonly number[]; status: TrendStatus }) {
  const pts = values.slice(-12);
  if (pts.length < 2) return <span className="block h-7 w-20" aria-hidden />;
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const d = pts.map((v, i) => `${((i / (pts.length - 1)) * 76 + 2).toFixed(1)},${(25 - ((v - lo) / (hi - lo || 1)) * 22).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 80 28" className="h-7 w-20 shrink-0" aria-hidden>
      <polyline points={d} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className={STATUS[status].line} />
    </svg>
  );
}

const valueText = (t: LiftTrend, unit: WeightUnit) =>
  t.bodyweight ? `${t.current} reps${t.oneSide ? "/side" : ""}` : `${formatLoad(t.current, unit)} ${unit}`;

/**
 * Every lift trained in the last four weeks: a trend line, its estimated max
 * now, the change over six weeks and Stronger / Holding / Slipping. Tapping
 * one opens its own page.
 */
export function StrengthTrendsCard({
  workouts,
  unit,
  today,
  onOpen,
  who,
}: {
  workouts: readonly Workout[];
  unit: WeightUnit;
  today: string;
  onOpen: (exerciseId: string) => void;
  /** The member's first name, on the coach dashboard. */
  who?: string;
}) {
  const trends = React.useMemo(() => strengthTrends(workouts, today), [workouts, today]);
  const [all, setAll] = React.useState(false);
  // Slipping first, so it's the first thing seen; then the order they were trained in.
  const order: Record<TrendStatus, number> = { down: 0, up: 1, hold: 2, new: 3 };
  const sorted = [...trends].sort((a, b) => order[a.status] - order[b.status]);
  const shown = all ? sorted : sorted.slice(0, SHOWN);
  const counts = { up: 0, hold: 0, down: 0, new: 0 } as Record<TrendStatus, number>;
  for (const t of trends) counts[t.status]++;

  return (
    <Card>
      <CardHeader className="space-y-1 pb-2">
        <CardTitle className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-primary">
          <TrendingUp className="h-3.5 w-3.5" />
          Strength trends
        </CardTitle>
        <CardDescription className="text-xs">
          {trends.length === 0
            ? `Log a lift a few times and ${who ? `${who}'s` : "your"} trend shows here.`
            : `Last ${TREND_WEEKS} weeks · ${counts.up} stronger · ${counts.hold} holding · ${counts.down} slipping. Holding strength during a cut is a win.`}
        </CardDescription>
      </CardHeader>
      {trends.length > 0 ? (
        <CardContent className="space-y-1 pt-0">
          <ul className="divide-y divide-primary/[0.08]">
            {shown.map((t) => {
              const s = STATUS[t.status];
              return (
                <li key={t.exerciseId}>
                  <button
                    type="button"
                    onClick={() => onOpen(t.exerciseId)}
                    aria-label={`${t.name}: ${s.label.toLowerCase()}${t.changePct === null ? "" : `, ${t.changePct > 0 ? "up" : "down"} ${Math.abs(Math.round(t.changePct * 10) / 10)}%`}. Open its chart`}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0.5 rounded-xl px-1 py-2 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_5rem_5.5rem_4rem_6rem]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{t.name}</span>
                      <span className="tabular block text-xs text-muted-foreground sm:hidden">
                        {valueText(t, unit)}
                        {t.changePct === null ? "" : ` · ${t.changePct > 0 ? "+" : ""}${t.changePct.toFixed(1)}%`}
                      </span>
                    </span>
                    <Sparkline values={t.series.map((p) => p.value)} status={t.status} />
                    <span className="tabular hidden text-sm sm:block">{valueText(t, unit)}</span>
                    <span
                      className={cn(
                        "tabular hidden text-sm sm:block",
                        t.status === "up" ? "text-success" : t.status === "down" ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {t.changePct === null ? "—" : `${t.changePct > 0 ? "+" : ""}${t.changePct.toFixed(1)}%`}
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
          {sorted.length > SHOWN ? (
            <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
              {all ? "Show fewer" : `Show all ${sorted.length}`}
            </Button>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
