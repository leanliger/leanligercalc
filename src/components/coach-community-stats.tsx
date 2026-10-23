"use client";

import * as React from "react";
import { Megaphone, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented";
import { CopyButton } from "@/components/copy-button";
import { STATS_MIN_MEMBERS, STATS_PERIODS, marketingText, type CommunityStats, type StatsPeriod } from "@/lib/community-stats";
import type { WeightUnit } from "@/lib/types";
import { fromLb } from "@/lib/units";

const big = (n: number) => (n >= 100 ? Math.round(n).toLocaleString("en-US") : (Math.round(n * 10) / 10).toLocaleString("en-US"));

/**
 * Library → Wins & testimonials → Community stats: totals across members who
 * share their progress, for posts and sales pages, with a line to copy.
 */
export function CommunityStatsCard({ companyId, unit }: { companyId: string; unit: WeightUnit }) {
  const [period, setPeriod] = React.useState<StatsPeriod>("last-month");
  const [stats, setStats] = React.useState<CommunityStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    setStats(null);
    setError(null);
    fetch(`/api/coach/community-stats?company=${encodeURIComponent(companyId)}&period=${period}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    })
      .then(async (res) => {
        const b = (await res.json().catch(() => null)) as { stats?: CommunityStats; error?: string } | null;
        if (!res.ok || !b?.stats) throw new Error(b?.error ?? "Couldn't load the stats.");
        if (live) setStats(b.stats);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load the stats."));
    return () => {
      live = false;
    };
  }, [companyId, period]);

  const text = stats?.enough ? marketingText(stats, unit) : "";
  const len = unit === "kg" ? "cm" : "in";
  const tiles = stats
    ? [
        { label: `${unit} lost`, value: big(fromLb(stats.lbLost, unit)), sub: `${stats.membersDown} member${stats.membersDown === 1 ? "" : "s"} down` },
        { label: `${len} off waists`, value: big(unit === "kg" ? stats.waistInLost * 2.54 : stats.waistInLost), sub: "from tape measurements" },
        { label: "Workouts", value: big(stats.workouts), sub: `${big(fromLb(stats.volumeLb, unit))} ${unit} lifted` },
        { label: "Milestones", value: big(stats.milestones), sub: "5 lb down or an inch off" },
        { label: "Check-ins", value: big(stats.checkins), sub: "weekly check-ins sent" },
        { label: "Active", value: `${stats.active}`, sub: `of ${stats.members} sharing` },
      ]
    : [];

  return (
    <Card>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Community stats
          </CardTitle>
          <SegmentedControl ariaLabel="Period" size="sm" value={period} onValueChange={setPeriod} options={STATS_PERIODS} className="w-auto" />
        </div>
        <CardDescription>
          Totals across members who share their progress with you, for posts and your sales page. No names and no one member&apos;s
          numbers; shown once at least {STATS_MIN_MEMBERS} members are counted. Weight lost uses a trend line through each member&apos;s
          weigh-ins, so one heavy morning doesn&apos;t count.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : !stats ? (
          <div className="h-32 animate-pulse rounded-md bg-muted/30" aria-busy="true" />
        ) : !stats.enough ? (
          <p className="text-sm text-muted-foreground">
            {stats.members} member{stats.members === 1 ? "" : "s"} share{stats.members === 1 ? "s" : ""} their progress. Totals show once{" "}
            {STATS_MIN_MEMBERS} do, so no one&apos;s own numbers can be picked out.
          </p>
        ) : (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {stats.label.charAt(0).toUpperCase() + stats.label.slice(1)}
            </p>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-2xl border border-border p-3">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{t.label}</dt>
                  <dd className="tabular text-2xl font-extrabold">{t.value}</dd>
                  <dd className="text-[11px] text-muted-foreground">{t.sub}</dd>
                </div>
              ))}
            </dl>
            {text ? (
              <div className="space-y-2 rounded-2xl border border-primary/25 bg-primary/[0.05] p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Megaphone className="h-3.5 w-3.5" aria-hidden />
                  Ready to post
                </p>
                <p className="text-sm">{text}</p>
                <CopyButton getText={() => text} label="Copy text" copiedLabel="Copied" />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing to brag about in this period yet.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
