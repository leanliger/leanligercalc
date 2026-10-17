"use client";

import * as React from "react";
import { Lightbulb } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FoodLog } from "@/lib/food";
import type { HabitDef, HabitEntries } from "@/lib/habits";
import { habitInsights, INSIGHT_WEEKS, MIN_WEEKS, weekResults, type Insight } from "@/lib/insights";
import type { WeighIn } from "@/lib/tracking";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";

/** Weeks of results before the card has a chance of showing something. */
const NEEDED_WEEKS = MIN_WEEKS * 2;

function amount(lb: number, unit: WeightUnit): string {
  return `${Math.round(fromLb(Math.abs(lb), unit) * 10) / 10} ${unit}`;
}

/** "you lost 0.4 lb more a week (0.9 vs 0.5 lb)" and the other cases. */
function sentence(i: Insight, unit: WeightUnit): string {
  const a = i.withChange;
  const b = i.withoutChange;
  const diff = amount(a - b, unit);
  const each = (x: number) => (x <= 0 ? `−${amount(x, unit)}` : `+${amount(x, unit)}`);
  const vs = ` (${each(a)} vs ${each(b)} a week)`;
  if (a <= 0 && b <= 0) return `you lost ${diff} ${a < b ? "more" : "less"} a week${vs}.`;
  if (a > 0 && b > 0) return `you gained ${diff} ${a < b ? "less" : "more"} a week${vs}.`;
  return a < b ? `you lost weight; in the other weeks you gained${vs}.` : `you gained; in the other weeks you lost${vs}.`;
}

/**
 * Progress → Habits, "What's working" (src/lib/insights.ts): the member's
 * own weeks, split by a habit, with the weight change in each group.
 */
export function HabitInsightsCard({
  weighIns,
  habits,
  habitLogs,
  foodLogs,
  today,
  stepTarget,
  unit,
}: {
  weighIns: readonly WeighIn[];
  habits: HabitDef[];
  habitLogs: readonly { date: string; entries: HabitEntries }[];
  foodLogs: readonly FoodLog[];
  today: string;
  stepTarget: number;
  unit: WeightUnit;
}) {
  const weeks = React.useMemo(
    () =>
      weekResults({
        weighIns,
        habits,
        habitLogs,
        foodDates: foodLogs.filter((l) => l.entries.length > 0).map((l) => l.date),
        today,
      }),
    [weighIns, habits, habitLogs, foodLogs, today],
  );
  const insights = React.useMemo(() => habitInsights(weeks, stepTarget), [weeks, stepTarget]);

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4 text-primary" />
          What&apos;s working for you
        </CardTitle>
        <CardDescription>
          Your last {INSIGHT_WEEKS} finished weeks, split by habit, with how your weight moved in each.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.length > 0 ? (
          <ul className="space-y-2.5">
            {insights.map((i) => (
              <li key={i.id} className="rounded-md border border-border px-3 py-2.5 text-sm">
                <p>
                  <span className="font-semibold">{i.condition}</span>, {sentence(i, unit)}
                </p>
                <p className="tabular mt-0.5 text-[12px] text-muted-foreground">
                  {i.withWeeks} week{i.withWeeks === 1 ? "" : "s"} like that, {i.withoutWeeks} without.
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {weeks.length < NEEDED_WEEKS
              ? `Keep weighing in and ticking habits: this needs about ${NEEDED_WEEKS} finished weeks with weigh-ins (${weeks.length} so far).`
              : "No clear pattern yet: your weeks look much the same whichever habits you hit. It'll update every week."}
          </p>
        )}
        <p className="text-[12px] text-muted-foreground">
          A pattern in your own numbers, not proof: busy weeks, salt and sleep move the scale too.
        </p>
      </CardContent>
    </Card>
  );
}
