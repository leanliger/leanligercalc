"use client";

import * as React from "react";
import { Footprints } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BASELINE_STEPS, kcalPerThousandSteps } from "@/lib/activity";
import { addDays } from "@/lib/dates";
import { STEPS_KEY, weekStartOf, type HabitLog } from "@/lib/habits";
import { cn } from "@/lib/utils";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

const short = (n: number) => (n >= 1000 ? `${(Math.round(n / 100) / 10).toString()}k` : String(n));

/**
 * This week's logged steps against the plan's daily steps, and what the gap
 * means in calories. Compared on the weekly average: step counters are noisy
 * and daily targets that move with them are hard to follow.
 */
export function StepsWeekCard({
  logs,
  today,
  target,
  planUsesSteps,
  weightLb,
}: {
  logs: readonly HabitLog[];
  today: string;
  /** Steps a day the plan assumes (or the default habit target). */
  target: number;
  /** False when the plan uses an activity level, so steps aren't in its calories. */
  planUsesSteps: boolean;
  weightLb: number;
}) {
  const logMap = React.useMemo(() => new Map(logs.map((l) => [l.date, l.entries])), [logs]);
  const stepsOn = (d: string): number | null => {
    const v = logMap.get(d)?.[STEPS_KEY];
    return typeof v === "number" ? v : null;
  };
  const average = (values: (number | null)[]): number | null => {
    const got = values.filter((v): v is number => v !== null);
    return got.length > 0 ? Math.round(got.reduce((a, b) => a + b, 0) / got.length) : null;
  };

  const weekStart = weekStartOf(today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    return { date, steps: date <= today ? stepsOn(date) : null, future: date > today };
  });
  const avg = average(week.map((d) => d.steps));
  const lastWeek = average(Array.from({ length: 7 }, (_, i) => stepsOn(addDays(weekStart, i - 7))));
  const top = Math.max(target * 1.25, ...week.map((d) => d.steps ?? 0));

  let message: { tone: "warning" | "success" | "neutral"; text: string } | null = null;
  if (avg !== null) {
    if (!planUsesSteps) {
      message = {
        tone: "neutral",
        text: "Your plan uses an activity level, so steps aren't counted in its calories. Switch to Steps and training in Plan → Timeline to use them.",
      };
    } else {
      const gap = target - avg;
      const kcal =
        ((Math.max(target, BASELINE_STEPS) - Math.max(avg, BASELINE_STEPS)) / 1000) * kcalPerThousandSteps(weightLb);
      if (gap > 250) {
        message = {
          tone: "warning",
          text: `About ${Math.round(kcal)} kcal/day less than your plan assumes. Walk ${(Math.ceil(gap / 100) * 100).toLocaleString()} more steps a day to get back on plan.`,
        };
      } else if (gap < -250) {
        message = {
          tone: "success",
          text: `${(Math.floor(-gap / 100) * 100).toLocaleString()} steps a day above plan — about ${Math.round(-kcal)} kcal/day extra.`,
        };
      } else {
        message = { tone: "success", text: "Right on plan." };
      }
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Footprints className="h-4 w-4 text-primary" />
          Steps this week
        </CardTitle>
        <CardDescription className="tabular">
          {avg === null
            ? "Log your steps under the step habit and your week shows up here."
            : `Average ${avg.toLocaleString()} · ${planUsesSteps ? "plan" : "target"} ${target.toLocaleString()}${
                lastWeek !== null ? ` · last week ${lastWeek.toLocaleString()}` : ""
              }`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative flex h-28 items-end gap-2 border-b border-border" role="img" aria-label="Steps logged each day this week">
          <div
            aria-hidden
            className="absolute inset-x-0 border-t border-dashed border-foreground/40"
            style={{ bottom: `${(target / top) * 100}%` }}
          />
          {week.map((d) => (
            <div
              key={d.date}
              className={cn(
                "flex-1 rounded-t",
                d.steps === null ? "bg-transparent" : d.steps >= target ? "bg-success/70" : "bg-primary/70",
              )}
              style={{ height: d.steps === null ? 0 : `${Math.max(2, (d.steps / top) * 100)}%` }}
              title={d.steps === null ? undefined : `${d.steps.toLocaleString()} steps`}
            />
          ))}
        </div>
        <div className="flex gap-2 text-center text-[10px] text-muted-foreground">
          {week.map((d, i) => (
            <span key={d.date} className={cn("tabular flex-1", d.date === today && "font-semibold text-foreground")}>
              {DAY_LETTERS[i]}
              <span className="block">{d.steps === null ? (d.future ? "" : "—") : short(d.steps)}</span>
            </span>
          ))}
        </div>
        {message ? (
          <p
            className={cn(
              "rounded-md px-3 py-2 text-xs leading-relaxed",
              message.tone === "warning"
                ? "bg-warning/[0.12] text-warning"
                : message.tone === "success"
                  ? "bg-success/[0.1] text-success"
                  : "bg-muted/50 text-muted-foreground",
            )}
          >
            {message.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
