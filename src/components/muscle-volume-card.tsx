"use client";

import * as React from "react";
import { BarChart3, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented";
import { addDays, formatShort } from "@/lib/dates";
import { MUSCLE_LABELS, MUSCLES, type Exercise } from "@/lib/exercises";
import { weekStartOf } from "@/lib/habits";
import { MAJOR_MUSCLES, MIN_WEEKLY_SETS, underTrained, weeklySets } from "@/lib/muscle-volume";
import type { Workout } from "@/lib/training";
import { cn } from "@/lib/utils";

/** The bar scale tops out here; more sets just fill the bar. */
const SCALE_MAX = 20;

/**
 * Sets per muscle this week or last week (src/lib/muscle-volume.ts), with
 * major muscles under MIN_WEEKLY_SETS called out. On Training and on a
 * member's page for the coach.
 */
export function MuscleVolumeCard({
  workouts,
  customExercises,
  today,
  name,
}: {
  workouts: readonly Workout[];
  customExercises: readonly Exercise[];
  today: string;
  /** The member's first name, on the coach's view ("Sam's sets"). */
  name?: string;
}) {
  const thisWeek = weekStartOf(today);
  const lastWeek = addDays(thisWeek, -7);
  const finished = React.useMemo(() => workouts.filter((w) => w.finishedAt !== null), [workouts]);
  const sets = React.useMemo(
    () => ({ this: weeklySets(finished, thisWeek, customExercises), last: weeklySets(finished, lastWeek, customExercises) }),
    [finished, thisWeek, lastWeek, customExercises],
  );
  const lastTotal = MUSCLES.reduce((s, m) => s + sets.last[m], 0);
  const [week, setWeek] = React.useState<"this" | "last">(() => (lastTotal > 0 ? "last" : "this"));
  const shown = sets[week];
  const total = MUSCLES.reduce((s, m) => s + shown[m], 0);
  // Flags only for a finished week: midweek, low numbers are just the week so far.
  const low = underTrained(sets.last);

  if (finished.length === 0) return null;

  return (
    <Card>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            {name ? `${name}'s sets per muscle` : "Sets per muscle"}
          </CardTitle>
          <SegmentedControl
            ariaLabel="Week"
            size="sm"
            value={week}
            onValueChange={setWeek}
            options={[
              { value: "last" as const, label: "Last week" },
              { value: "this" as const, label: "This week" },
            ]}
            className="w-auto"
          />
        </div>
        <CardDescription>
          Finished sets, {formatShort(week === "this" ? thisWeek : lastWeek)}–{formatShort(addDays(week === "this" ? thisWeek : lastWeek, 6))}. About{" "}
          {MIN_WEEKLY_SETS}–20 hard sets a week per muscle is the usual range for growth.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {lastTotal > 0 && low.length > 0 ? (
          <p role="status" className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              Last week under {MIN_WEEKLY_SETS} sets:{" "}
              {low.map((m, i) => (
                <React.Fragment key={m}>
                  {i > 0 ? ", " : ""}
                  <span className="font-semibold">{MUSCLE_LABELS[m]}</span> ({sets.last[m]})
                </React.Fragment>
              ))}
              . {name ? "Worth adding" : "Add"} a few sets for {low.length === 1 ? "it" : "them"} this week.
            </span>
          </p>
        ) : null}
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No finished sets {week === "this" ? "this week yet" : "last week"}.</p>
        ) : (
          <ul className="space-y-1.5" aria-label={`Sets per muscle, ${week === "this" ? "this" : "last"} week`}>
            {MUSCLES.map((m) => {
              const n = shown[m];
              const major = MAJOR_MUSCLES.includes(m);
              const under = major && n < MIN_WEEKLY_SETS && week === "last";
              return (
                <li key={m} className="grid grid-cols-[5.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm">
                  <span className={cn(!major && "text-muted-foreground")}>{MUSCLE_LABELS[m]}</span>
                  <span className="relative h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span
                      className={cn("absolute inset-y-0 left-0 rounded-full", under ? "bg-warning" : n >= MIN_WEEKLY_SETS ? "bg-success" : "bg-primary/70")}
                      style={{ width: `${Math.min(100, (n / SCALE_MAX) * 100)}%` }}
                    />
                    <span className="absolute inset-y-0 w-px bg-foreground/40" style={{ left: `${(MIN_WEEKLY_SETS / SCALE_MAX) * 100}%` }} />
                  </span>
                  <span className={cn("tabular text-right", under && "font-semibold text-warning")}>{n}</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-[12px] text-muted-foreground">
          Each exercise counts for its main muscle, and half a set for its usual helpers (presses for triceps, rows for biceps, squats for
          glutes). The line marks {MIN_WEEKLY_SETS} sets.
        </p>
      </CardContent>
    </Card>
  );
}
