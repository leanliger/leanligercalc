"use client";

import * as React from "react";
import { BarChart3, CalendarCheck, Trophy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatShort } from "@/lib/dates";
import { SegmentedControl } from "@/components/ui/segmented";
import { LOAD_WEEKS, RECORD_WEEKS, recentRecords, volumeChange, weeklyVolume, workoutAdherence, type VolumeMeasure } from "@/lib/training-load";
import type { Program, Workout } from "@/lib/training";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * Weekly training volume and workout adherence (src/lib/training-load.ts):
 * on the member's Training → Tools, and on a member's Training tab for
 * coaches (`who` names them there).
 */

const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

const MEASURES: { value: VolumeMeasure; label: string }[] = [
  { value: "volumeLb", label: "Load" },
  { value: "reps", label: "Reps" },
  { value: "sets", label: "Sets" },
];

export function TrainingVolumeCard({ workouts, unit, today, who }: { workouts: readonly Workout[]; unit: WeightUnit; today: string; who?: string }) {
  const [measure, setMeasure] = React.useState<VolumeMeasure>("volumeLb");
  const weeks = React.useMemo(() => weeklyVolume(workouts, today), [workouts, today]);
  const change = volumeChange(weeks, measure);
  // Load in the member's unit; reps and sets as counted.
  const vol = weeks.map((w) => (measure === "volumeLb" ? fromLb(w.volumeLb, unit) : w[measure]));
  const top = Math.max(1, ...vol);
  const now = weeks[weeks.length - 1]!;
  const last = weeks[weeks.length - 2]!;
  const any = weeks.some((w) => w.sets > 0);
  const what = measure === "volumeLb" ? unit : measure;
  const val = (w: (typeof weeks)[number]) => (measure === "volumeLb" ? compact(fromLb(w.volumeLb, unit)) : w[measure].toLocaleString());
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" />
          Weekly training volume
        </CardTitle>
        <CardDescription>
          {measure === "volumeLb"
            ? `Total weight ${who ? `${who} moved` : "moved"} each week (weight × reps, every set)`
            : measure === "reps"
              ? `Every rep ${who ? `${who} did` : "done"} each week, all exercises`
              : `Sets ${who ? `${who} finished` : "finished"} each week, all exercises`}
          , over {LOAD_WEEKS} weeks.
        </CardDescription>
        <SegmentedControl ariaLabel="Measure" size="sm" value={measure} onValueChange={setMeasure} options={MEASURES} className="w-auto" />
      </CardHeader>
      <CardContent className="space-y-3">
        {!any ? (
          <p className="text-sm text-muted-foreground">Finish a workout with weights logged to see this.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <p>
                <span className="tabular text-2xl font-semibold">{val(last)}</span>{" "}
                <span className="text-sm text-muted-foreground">{what} last week</span>
              </p>
              {change !== null ? (
                <p className={cn("tabular text-sm font-medium", change >= 0.05 ? "text-success" : change <= -0.15 ? "text-warning" : "text-muted-foreground")}>
                  {change >= 0 ? "+" : "−"}
                  {Math.abs(Math.round(change * 100))}% vs the 4 weeks before
                </p>
              ) : null}
              <p className="tabular text-sm text-muted-foreground">
                This week so far: {val(now)} {what} · {now.workouts} workout{now.workouts === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex h-32 items-end gap-1" role="img" aria-label={weeks.map((w, i) => `Week of ${formatShort(w.weekStart)}: ${Math.round(vol[i]!)} ${what}`).join("; ")}>
              {weeks.map((w, i) => (
                <div key={w.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`Week of ${formatShort(w.weekStart)}: ${Math.round(fromLb(w.volumeLb, unit)).toLocaleString()} ${unit}, ${w.reps.toLocaleString()} reps, ${w.sets} sets`}>
                  <div className="flex h-24 w-full items-end overflow-hidden rounded-sm bg-muted/30">
                    <div className={cn("w-full", i === weeks.length - 1 ? "bg-primary/60" : "bg-primary")} style={{ height: `${(vol[i]! / top) * 100}%` }} />
                  </div>
                  <span className="tabular text-[10px] text-muted-foreground">{i % 3 === 0 || i === weeks.length - 1 ? formatShort(w.weekStart).replace(/^\w+ /, "") : ""}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              This week (lighter) is still going.{measure === "volumeLb" ? " Bodyweight sets count as sets but add no weight." : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function WorkoutAdherenceCard({ workouts, program, today, who }: { workouts: readonly Workout[]; program: Program | null; today: string; who?: string }) {
  const a = React.useMemo(() => workoutAdherence(workouts, program, today), [workouts, program, today]);
  const top = Math.max(1, ...a.weeks.map((w) => Math.max(w.planned, w.done)));
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="h-4 w-4 text-primary" />
          Workout adherence
        </CardTitle>
        <CardDescription>
          {a.basis === "calendar"
            ? `Workouts done against ${program!.name}'s calendar, week by week.`
            : a.basis === "days"
              ? `Workouts done against ${program!.name}'s ${program!.days.length} days a week.`
              : `Workouts done each week. ${who ? `${who} has` : "You have"} no active program to measure against.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {a.basis !== "none" ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Scheduled" value={a.scheduled} />
            <Tile label="Completed" value={a.completed} />
            <Tile label="Missed" value={a.missed} tone={a.missed ? "text-destructive" : undefined} />
            <Tile label="Avg / week" value={a.perWeek} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Avg / week" value={a.perWeek} />
          </div>
        )}
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          {a.rate !== null ? (
            <p>
              <span className={cn("tabular text-2xl font-semibold", a.rate >= 0.8 ? "text-success" : a.rate >= 0.6 ? "text-warning" : "text-destructive")}>
                {Math.round(a.rate * 100)}%
              </span>{" "}
              <span className="text-sm text-muted-foreground">of planned workouts done over {a.planWeeks === 1 ? "the last full week" : `the last ${a.planWeeks} full weeks of the plan`}</span>
            </p>
          ) : null}
          {a.thisWeek ? (
            <p className="tabular text-sm text-muted-foreground">
              This week: {a.thisWeek.done}
              {a.thisWeek.planned ? ` of ${a.thisWeek.planned}` : ""} done
            </p>
          ) : null}
        </div>
        <div className="flex h-28 items-end gap-1.5" role="img" aria-label={a.weeks.map((w) => `Week of ${formatShort(w.weekStart)}: ${w.done} done${w.planned ? ` of ${w.planned}` : ""}`).join("; ")}>
          {a.weeks.map((w) => {
            const short = w.planned > 0 && w.done < w.planned;
            return (
              <div key={w.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`Week of ${formatShort(w.weekStart)}: ${w.done} done${w.planned ? ` of ${w.planned} planned` : ""}`}>
                <div className="relative flex h-20 w-full items-end overflow-hidden rounded-sm bg-muted/30">
                  {w.planned ? <div className="absolute inset-x-0 border-t-2 border-dashed border-foreground/40" style={{ bottom: `${(w.planned / top) * 100}%` }} /> : null}
                  <div className={cn("w-full", short ? "bg-warning" : "bg-success")} style={{ height: `${(w.done / top) * 100}%` }} />
                </div>
                <span className="tabular text-[10px] text-muted-foreground">
                  {w.done}
                  {w.planned ? `/${w.planned}` : ""}
                </span>
              </div>
            );
          })}
        </div>
        {a.basis !== "none" ? (
          <p className="text-[11px] text-muted-foreground">Dashed line: planned. Amber: fewer than planned. The last bar is this week, still going.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("tabular text-lg font-semibold", tone)}>{value.toLocaleString()}</p>
    </div>
  );
}

/** Personal records across every lift, newest first; a lift opens its page. */
export function RecentRecordsCard({
  workouts,
  unit,
  today,
  who,
  onOpen,
}: {
  workouts: readonly Workout[];
  unit: WeightUnit;
  today: string;
  who?: string;
  onOpen?: (exerciseId: string) => void;
}) {
  const records = React.useMemo(() => recentRecords(workouts, today), [workouts, today]);
  const [all, setAll] = React.useState(false);
  const shown = all ? records : records.slice(0, 6);
  const w = (lb: number) => `${Math.round(fromLb(lb, unit) * 10) / 10}`;
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="h-4 w-4 text-primary" />
          Recent personal records
        </CardTitle>
        <CardDescription>
          Every lift {who ? `${who} beat` : "you beat"} in the last {RECORD_WEEKS} weeks: a best estimated one-rep max or heaviest weight, or most reps for bodyweight
          exercises.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">No new records in the last {RECORD_WEEKS} weeks yet.</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {shown.map((r) => (
                <li key={`${r.exerciseId}:${r.date}`}>
                  <button
                    type="button"
                    disabled={!onOpen}
                    onClick={() => onOpen?.(r.exerciseId)}
                    className="flex w-full items-baseline gap-2 py-2 text-left text-sm enabled:hover:text-primary"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                    <span className="tabular text-muted-foreground">
                      {r.kind === "reps"
                        ? `${r.value} reps`
                        : r.kind === "e1rm"
                          ? `est. max ${w(r.value)} ${unit}${r.set ? ` · ${w(r.set.weight)} × ${r.set.reps}` : ""}`
                          : `${w(r.value)} ${unit}${r.set ? ` × ${r.set.reps}` : ""}`}
                    </span>
                    <span className="tabular w-14 text-right text-[12px] text-muted-foreground">{formatShort(r.date)}</span>
                  </button>
                </li>
              ))}
            </ul>
            {records.length > 6 ? (
              <button type="button" className="mt-1 text-[12px] font-medium text-primary hover:underline" onClick={() => setAll((v) => !v)}>
                {all ? "Show fewer" : `Show all ${records.length}`}
              </button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
