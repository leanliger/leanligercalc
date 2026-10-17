"use client";

import * as React from "react";
import { Footprints, PauseCircle, Ruler, Scale, Search, Utensils } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { kcalPerThousandSteps } from "@/lib/activity";
import { daysBetween } from "@/lib/dates";
import { detectPlateau, dietStartToday } from "@/lib/plateau";
import type { WeighIn } from "@/lib/tracking";
import type { FatLossResult, WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";

/** Diet breaks are worth suggesting after this long in a deficit. */
const DIET_BREAK_AFTER_WEEKS = 8;

/**
 * Progress → Weigh-in, when the weight has been flat for 2+ weeks during the
 * diet (src/lib/plateau.ts): what's going on, and what to try, in order.
 */
export function PlateauCard({
  weighIns,
  timeline,
  today,
  unit,
  weightLb,
}: {
  weighIns: readonly WeighIn[];
  timeline: FatLossResult | null;
  today: string;
  unit: WeightUnit;
  weightLb: number;
}) {
  const plateau = React.useMemo(() => detectPlateau(weighIns, today, dietStartToday(timeline, today)), [weighIns, timeline, today]);
  if (!plateau || !timeline) return null;

  const weeksIn = Math.floor(daysBetween(timeline.requiredStartDate, today) / 7);
  const stepsKcal = Math.round(kcalPerThousandSteps(weightLb) * 2);
  const change = Math.round(fromLb(Math.abs(plateau.weeklyChangeLb), unit) * 10) / 10;
  const direction = plateau.weeklyChangeLb > 0.05 ? `up ${change} ${unit} a week` : change >= 0.05 ? `down only ${change} ${unit} a week` : "flat";

  const tips: { icon: React.ReactNode; title: string; body: string }[] = [
    {
      icon: <Ruler />,
      title: "Check the tape first",
      body: "Water can hide fat loss for a week or two (new training, stress, salt, poor sleep, your cycle). If your waist is still going down, nothing's wrong: keep going.",
    },
    {
      icon: <Search />,
      title: "Tighten the logging",
      body: "Weekends, cooking oil, sauces, drinks and bites while cooking are the usual gaps. A few days of weighing everything shows whether the plan is really being followed.",
    },
    {
      icon: <Footprints />,
      title: "Walk a little more",
      body: `2,000 more steps a day burns about ${stepsKcal} kcal, without eating less.`,
    },
    {
      icon: <Utensils />,
      title: "Or eat a little less",
      body: "100–150 kcal a day less, mostly from carbs or fat. The Plan vs actual card suggests an amount once it has enough weigh-ins.",
    },
  ];
  if (weeksIn >= DIET_BREAK_AFTER_WEEKS) {
    tips.push({
      icon: <PauseCircle />,
      title: "Think about a diet break",
      body: `You're ${weeksIn} weeks in. One to two weeks at maintenance can bring hunger, energy and training back before the next push. Ask your coach first.`,
    });
  }

  return (
    <Card className="border-warning/40">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4 text-warning" />
          Weight&apos;s been flat for {plateau.days} days
        </CardTitle>
        <CardDescription>
          Over the last {plateau.days} days your weigh-ins are {direction}. Plateaus are normal in a long diet. Here&apos;s what to try, in
          order.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2.5">
          {tips.map((t, i) => (
            <li key={t.title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning [&_svg]:h-3.5 [&_svg]:w-3.5">
                {t.icon}
              </span>
              <span className="min-w-0 text-sm">
                <span className="font-semibold">
                  {i + 1}. {t.title}.
                </span>{" "}
                <span className="text-muted-foreground">{t.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
