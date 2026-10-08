"use client";

import * as React from "react";
import { Flame } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StreakBadge } from "@/components/habits-card";
import { formatShort } from "@/lib/dates";
import { WEEKLY_TARGET_PERCENT, ZONES, type HabitDef, type HabitLog, type Zone } from "@/lib/habits";
import {
  CONSISTENCY_WINDOW_DAYS,
  DAILY_STREAK_PERCENT,
  TREND_WEEKS,
  dailyStreak,
  greenWeekStreak,
  habitConsistency,
  habitStreak,
  weeklyTrend,
} from "@/lib/streaks";
import { NO_PAUSES, withPauses, type PausePeriod } from "@/lib/pause";
import { cn } from "@/lib/utils";

const ZONE_BAR: Record<Zone, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-destructive",
};
const ZONE_TEXT: Record<Zone, string> = {
  green: "text-success",
  yellow: "text-warning",
  red: "text-destructive",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface ConsistencyCardProps {
  habits: HabitDef[];
  /** All habit logs, oldest first. */
  logs: HabitLog[];
  today: string;
  /** Pause mode periods: excused from every streak and percentage. */
  pauses?: PausePeriod[];
}

/**
 * Streaks and percentages, built from the same logs and rules as the weekly
 * scorecard (see src/lib/streaks.ts).
 */
export function ConsistencyCard({ habits, logs, today, pauses = NO_PAUSES }: ConsistencyCardProps) {
  const data = React.useMemo(() => {
    const logMap = withPauses(new Map(logs.map((l) => [l.date, l.entries])), pauses, today);
    const first = logs[0]?.date ?? null;
    return {
      daily: dailyStreak(habits, logMap, today, first),
      weeks: greenWeekStreak(habits, logMap, today, first),
      trend: weeklyTrend(habits, logMap, today, first),
      rows: habits.map((def) => ({
        def,
        streak: habitStreak(def, logMap, today, today, first),
        consistency: habitConsistency(def, logMap, today, first),
      })),
    };
  }, [habits, logs, today, pauses]);

  const thisWeek = data.trend[data.trend.length - 1];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-primary" />
          Streaks &amp; consistency
        </CardTitle>
        <CardDescription>
          Rest days don&apos;t break your workout streak, and today doesn&apos;t count against you until it&apos;s over.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {logs.length === 0 || habits.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tick your first habit on the daily checklist to start your streaks.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatBox
                label={`${DAILY_STREAK_PERCENT}%+ days in a row`}
                value={data.daily.current}
                unit={data.daily.current === 1 ? "day" : "days"}
                sub={`Best: ${plural(data.daily.best, "day")}`}
                hint={`Days you hit at least ${DAILY_STREAK_PERCENT}% of that day's habits.`}
              />
              <StatBox
                label="Green Zone weeks in a row"
                value={data.weeks.current}
                unit={data.weeks.current === 1 ? "week" : "weeks"}
                sub={`Best: ${plural(data.weeks.best, "week")}${thisWeek?.percent != null ? ` · this week so far ${thisWeek.percent}%` : ""}`}
                hint={`Finished weeks at ${WEEKLY_TARGET_PERCENT}%+ on the scorecard. This week joins the streak once it ends green.`}
              />
            </div>

            <TrendChart points={data.trend} />

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Each habit · last {CONSISTENCY_WINDOW_DAYS} days
              </p>
              <ul className="space-y-2.5">
                {data.rows.map(({ def, streak, consistency }) => (
                  <li key={def.id} className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{def.name}</span>
                      <StreakBadge days={streak.current} />
                      {streak.best > streak.current ? (
                        <span className="tabular shrink-0 text-[11px] text-muted-foreground">best {streak.best}</span>
                      ) : null}
                      <span
                        className={cn(
                          "tabular w-10 shrink-0 text-right text-xs font-semibold",
                          consistency.zone ? ZONE_TEXT[consistency.zone] : "text-muted-foreground",
                        )}
                      >
                        {consistency.percent === null ? "—" : `${consistency.percent}%`}
                      </span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-label={`${def.name}: ${consistency.done} of ${consistency.possible} days in the last ${CONSISTENCY_WINDOW_DAYS}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={consistency.percent ?? 0}
                    >
                      {consistency.zone ? (
                        <div
                          className={cn("h-full rounded-full", ZONE_BAR[consistency.zone])}
                          style={{ width: `${consistency.percent}%` }}
                        />
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function StatBox({
  label,
  value,
  unit,
  sub,
  hint,
}: {
  label: string;
  value: number;
  unit: string;
  sub: string;
  hint: string;
}) {
  return (
    <div className="space-y-1 rounded-lg border border-border p-3" title={hint}>
      <p className="text-[11px] font-medium leading-tight text-muted-foreground">{label}</p>
      <p className="flex items-baseline gap-1">
        <span className={cn("tabular text-2xl font-semibold leading-none", value > 0 ? "text-primary" : "text-foreground")}>
          {value}
        </span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </p>
      <p className="text-[11px] leading-snug text-muted-foreground">{sub}</p>
      <p className="sr-only">{hint}</p>
    </div>
  );
}

/** Bar area height in rem, and the tallest a bar can be inside it (room is left for its label). */
const BAR_AREA_REM = 5;
const BAR_MAX_REM = BAR_AREA_REM - 0.75;
/** Date label (1rem) plus the gap above it (0.25rem). */
const BELOW_BARS_REM = 1.25;

function TrendChart({ points }: { points: ReturnType<typeof weeklyTrend> }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Last {TREND_WEEKS} weeks</p>
      <div className="relative">
        {/* The Green Zone line, drawn behind the bars, labelled in a gutter to their right. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-success/60"
          style={{ bottom: `${BELOW_BARS_REM + (WEEKLY_TARGET_PERCENT / 100) * BAR_MAX_REM}rem` }}
        >
          <span className="absolute -top-1.5 right-0 text-[10px] leading-none text-success">
            {WEEKLY_TARGET_PERCENT}%
          </span>
        </div>
        <ol aria-label={`Weekly scores, last ${TREND_WEEKS} weeks`} className="relative flex items-end gap-1.5 pr-8">
          {points.map((p) => {
            const label = `Week of ${formatShort(p.weekStart)}: ${
              p.percent === null ? "no data" : `${p.percent}%, ${ZONES[p.zone!].label}`
            }${p.complete ? "" : " (in progress)"}`;
            return (
              <li key={p.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="sr-only">{label}</span>
                <div aria-hidden className="flex w-full flex-col items-center justify-end" style={{ height: `${BAR_AREA_REM}rem` }}>
                  {p.percent === null ? (
                    <div className="h-1 w-full rounded-sm bg-muted" />
                  ) : (
                    <>
                      <span className="tabular mb-0.5 text-[10px] leading-none text-muted-foreground">{p.percent}</span>
                      <div
                        className={cn("w-full rounded-t-sm", ZONE_BAR[p.zone!], !p.complete && "opacity-50")}
                        style={{ height: `${(Math.max(p.percent, 3) / 100) * BAR_MAX_REM}rem` }}
                      />
                    </>
                  )}
                </div>
                <span aria-hidden className="h-4 w-full truncate text-center text-[10px] leading-4 text-muted-foreground">
                  {p.complete ? formatShort(p.weekStart) : "Now"}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
