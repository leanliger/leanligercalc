"use client";

import * as React from "react";
import { CalendarDays, Flame, ListChecks, ShieldCheck, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeaderboardCard } from "@/components/leaderboard-card";
import type { NotificationStatus } from "@/components/fasting-card";
import { DAILY_STREAK_PERCENT } from "@/lib/streaks";

interface LeaderboardTabProps {
  availability: NotificationStatus["availability"];
  onNavigate: (tab: "checkin") => void;
}

/** The Leaderboard tab: the board itself, and how the challenge works. */
export function LeaderboardTab({ availability, onNavigate }: LeaderboardTabProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <LeaderboardCard availability={availability} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Trophy className="h-4 w-4 text-primary" />
            How it works
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p className="flex gap-2.5">
            <Flame className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <strong className="font-medium text-foreground">Streak</strong> counts days in a row where you hit at least{" "}
              {DAILY_STREAK_PERCENT}% of that day&apos;s habits. A rest day doesn&apos;t break your workout habit, and today
              doesn&apos;t count against you until it&apos;s over.
            </span>
          </p>
          <p className="flex gap-2.5">
            <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <strong className="font-medium text-foreground">This week</strong> is your weekly scorecard so far — 80%+ is the
              Green Zone.
            </span>
          </p>
          <p className="flex gap-2.5">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              <strong className="font-medium text-foreground">This month</strong> is the monthly challenge: the most days at{" "}
              {DAILY_STREAK_PERCENT}%+ wins. It starts fresh on the 1st.
            </span>
          </p>
          <p className="flex gap-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span>
              Only your name, photo and these numbers are shown, and only to members of this community — never your weight,
              food or notes. Leave any time.
            </span>
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={() => onNavigate("checkin")}>
            <ListChecks />
            Tick today&apos;s habits
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
