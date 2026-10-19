"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatShort } from "@/lib/dates";
import { MAX_SCHEDULE_WEEKS, scheduleEnd, scheduleSessions } from "@/lib/program-schedule";
import type { Program } from "@/lib/training";
import { WEEKDAY_SHORT } from "@/lib/weekday-pattern";
import { cn } from "@/lib/utils";

/** The dates part of a program calendar, as the coach edits it. */
export interface ScheduleDraft {
  startDate: string;
  weekdays: number[];
  weeks: number;
}

export const scheduleDraftReady = (d: ScheduleDraft) =>
  d.weekdays.length > 0 && d.weeks >= 1 && d.weeks <= MAX_SCHEDULE_WEEKS && /^\d{4}-\d\d-\d\d$/.test(d.startDate);

/**
 * Start date, number of weeks and training days for a program calendar, with
 * a line saying what it comes to (coach Assign, and a member's program).
 */
export function ScheduleFields({
  value,
  onChange,
  program,
}: {
  value: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  /** The program it's for, to count its workouts and name its days. */
  program: Program;
}) {
  const { startDate, weekdays, weeks } = value;
  const planned: Program | null = scheduleDraftReady(value) ? { ...program, schedule: { startDate, weekdays, weeks, note: "" } } : null;
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1">
          <span className="block text-xs">Starts</span>
          <Input type="date" value={startDate} onChange={(e) => e.target.value && onChange({ ...value, startDate: e.target.value })} className="h-9 w-40" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs">Weeks</span>
          <Input
            type="number"
            min={1}
            max={MAX_SCHEDULE_WEEKS}
            value={weeks}
            onChange={(e) => onChange({ ...value, weeks: Math.max(1, Math.min(MAX_SCHEDULE_WEEKS, Math.round(Number(e.target.value) || 1))) })}
            className="h-9 w-24"
          />
        </label>
      </div>
      <div className="space-y-1">
        <span className="block text-xs">Training days</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Training days">
          {WEEKDAY_SHORT.map((label, d) => {
            const on = weekdays.includes(d);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...value, weekdays: on ? weekdays.filter((x) => x !== d) : [...weekdays, d].sort((a, b) => a - b) })}
                className={cn(
                  "h-8 min-w-[2.75rem] rounded-full border px-2.5 text-xs font-medium",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted/40",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {planned ? (
        <p className="tabular text-xs text-muted-foreground">
          {scheduleSessions(planned).length} workouts · {formatShort(startDate)} – {formatShort(scheduleEnd(planned)!)} ·{" "}
          {program.days.map((d) => d.name).join(", ")} in turn
        </p>
      ) : (
        <p className="text-xs text-destructive">Pick at least one training day.</p>
      )}
    </>
  );
}
