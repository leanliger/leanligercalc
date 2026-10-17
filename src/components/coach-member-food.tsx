"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { WeeklyIntakeChart } from "@/components/weekly-intake-chart";
import type { FoodDay } from "@/lib/coach-api";
import type { WeighIn } from "@/lib/tracking";
import type { WeightUnit } from "@/lib/types";

/**
 * A member's weekly weigh-ins vs calories on the coach's Food tab. The
 * overview only carries two weeks of food, so this loads 26 weeks of daily
 * totals for the one member (GET /api/coach/member-food).
 */
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
  const [days, setDays] = React.useState<FoodDay[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    setDays(null);
    setError(null);
    fetch(`/api/coach/member-food?company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { days?: FoodDay[]; error?: string } | null;
        if (!res.ok || !body?.days) throw new Error(body?.error ?? "Couldn't load their food history.");
        if (live) setDays(body.days);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load their food history."));
    return () => {
      live = false;
    };
  }, [companyId, memberId]);

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : days === null ? (
          <div aria-busy="true" aria-label="Loading the weekly chart" className="h-72 animate-pulse rounded-md bg-muted/30" />
        ) : (
          <WeeklyIntakeChart days={days} weighIns={weighIns} unit={unit} today={today} />
        )}
      </CardContent>
    </Card>
  );
}
