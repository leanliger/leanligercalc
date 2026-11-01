"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { WeeklyIntakeChart } from "@/components/weekly-intake-chart";
import type { FoodDay } from "@/lib/coach-api";
import type { WeighIn } from "@/lib/tracking";
import type { WeightUnit } from "@/lib/types";
import { NutritionReportCard } from "@/components/nutrition-tools";
import type { MemberSummary } from "@/lib/coach";
import { memberTargetFinder } from "@/lib/nutrition-report";

/**
 * A member's weekly weigh-ins vs calories, and their weekly nutrition report,
 * on the coach's Nutrition tab. The overview only carries two weeks of food,
 * so this loads 26 weeks of daily totals for the one member
 * (GET /api/coach/member-food).
 */
// One request per member while the page is open: the weekly chart and the report share it.
const foodCache = new Map<string, Promise<FoodDay[]>>();

/** A member's daily (and per-meal) food totals, COACH_FOOD_DAYS of them (GET /api/coach/member-food). */
function useMemberFoodDays(companyId: string, memberId: string): { days: FoodDay[] | null; error: string | null } {
  const [state, setState] = React.useState<{ days: FoodDay[] | null; error: string | null }>({ days: null, error: null });
  React.useEffect(() => {
    let live = true;
    setState({ days: null, error: null });
    const key = `${companyId}|${memberId}`;
    let p = foodCache.get(key);
    if (!p) {
      p = fetch(`/api/coach/member-food?company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      }).then(async (res) => {
        const body = (await res.json().catch(() => null)) as { days?: FoodDay[]; error?: string } | null;
        if (!res.ok || !body?.days) throw new Error(body?.error ?? "Couldn't load their food history.");
        return body.days;
      });
      foodCache.set(key, p);
      // Fresh again next time the page opens.
      p.catch(() => undefined).finally(() => window.setTimeout(() => foodCache.delete(key), 60_000));
    }
    p.then((days) => live && setState({ days, error: null })).catch((e: unknown) => live && setState({ days: null, error: e instanceof Error ? e.message : "Couldn't load their food history." }));
    return () => {
      live = false;
    };
  }, [companyId, memberId]);
  return state;
}

/** The member's weekly nutrition report (nutrition-tools.tsx), against the targets their app uses. */
export function CoachNutritionReport({ companyId, summary, today }: { companyId: string; summary: MemberSummary; today: string }) {
  const { days, error } = useMemberFoodDays(companyId, summary.data.userId);
  const targetFor = React.useMemo(() => memberTargetFinder(summary, summary.data.coachMacros ?? null, today), [summary, today]);
  if (error) return null;
  if (!days) return <div aria-busy="true" aria-label="Loading the weekly report" className="h-72 animate-pulse rounded-lg bg-muted/30" />;
  return <NutritionReportCard foodDays={days} targetFor={targetFor} today={today} who={summary.displayName.split(" ")[0] || summary.displayName} />;
}

export function CoachIntakeChart({
  companyId,
  memberId,
  weighIns,
  unit,
  today,
}: {
  companyId: string;
  memberId: string;
  weighIns: readonly WeighIn[];
  unit: WeightUnit;
  today: string;
}) {
  const { days, error } = useMemberFoodDays(companyId, memberId);

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : days === null ? (
          <div aria-busy="true" aria-label="Loading the weekly chart" className="h-80 animate-pulse sm:h-[26rem] rounded-md bg-muted/30" />
        ) : (
          <WeeklyIntakeChart days={days} weighIns={weighIns} unit={unit} today={today} height="h-80 sm:h-[26rem]" />
        )}
      </CardContent>
    </Card>
  );
}
