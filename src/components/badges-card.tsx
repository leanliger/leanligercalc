"use client";

import * as React from "react";
import { Award, ChevronDown, ChevronUp, Dumbbell, Flame, Footprints, Lock, Scale, Utensils } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatShort } from "@/lib/dates";
import { nextBadges, type Badge, type BadgeGroup } from "@/lib/badges";
import { cn } from "@/lib/utils";

const GROUP_ICON: Record<BadgeGroup, React.ComponentType<{ className?: string }>> = {
  training: Dumbbell,
  habits: Flame,
  weight: Scale,
  food: Utensils,
  steps: Footprints,
};

export function BadgeIcon({ badge, size = "md" }: { badge: Badge; size?: "sm" | "md" }) {
  const Icon = badge.earned ? GROUP_ICON[badge.group] : Lock;
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        size === "sm" ? "h-8 w-8" : "h-10 w-10",
        badge.earned ? "bg-primary/15 text-primary ring-1 ring-primary/40" : "bg-muted text-muted-foreground",
      )}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </span>
  );
}

const progressText = (b: Badge) => `${b.current.toLocaleString()} / ${b.target.toLocaleString()}`;

export function BadgesCard({ badges }: { badges: readonly Badge[] }) {
  const [showAll, setShowAll] = React.useState(false);
  const earned = badges.filter((b) => b.earned);
  // Newest first where the date is known.
  const recent = [...earned].sort((a, b) => (b.earnedOn ?? "").localeCompare(a.earnedOn ?? "")).slice(0, 3);
  const upNext = nextBadges(badges, 2);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          Badges
        </CardTitle>
        <CardDescription className="tabular">
          {earned.length} of {badges.length} earned
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {recent.length > 0 ? (
          <ul className="space-y-2">
            {recent.map((b) => (
              <li key={b.id} className="flex items-center gap-3">
                <BadgeIcon badge={b} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{b.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {b.earnedOn ? `Earned ${formatShort(b.earnedOn)}` : b.description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Your first badge is one weigh-in, meal or workout away.</p>
        )}

        {upNext.length > 0 ? (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Up next</p>
            {upNext.map((b) => (
              <div key={b.id} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium">{b.title}</span>
                  <span className="tabular text-muted-foreground">{progressText(b)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(b.current / b.target) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          {showAll ? <ChevronUp /> : <ChevronDown />}
          {showAll ? "Hide badges" : "See all badges"}
        </Button>

        {showAll ? (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {badges.map((b) => (
              <li
                key={b.id}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center",
                  b.earned ? "border-primary/40 bg-primary/5" : "border-border",
                )}
              >
                <BadgeIcon badge={b} />
                <span className={cn("text-xs font-medium leading-tight", !b.earned && "text-muted-foreground")}>{b.title}</span>
                <span className="text-[10px] leading-tight text-muted-foreground">
                  {b.earned ? (b.earnedOn ? formatShort(b.earnedOn) : "Earned") : b.description}
                </span>
                {!b.earned ? <span className="tabular text-[10px] text-muted-foreground">{progressText(b)}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
