"use client";

import * as React from "react";
import { CalendarDays, Flame, ListChecks, ShieldCheck, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import { LeaderboardCard } from "@/components/leaderboard-card";
import { LiftBoard } from "@/components/lift-board";
import { ChallengeBoard } from "@/components/challenge-board";
import type { ChallengeStandings } from "@/lib/challenges";
import type { NotificationStatus } from "@/components/fasting-card";
import { DAILY_STREAK_PERCENT } from "@/lib/streaks";
import type { WeightUnit } from "@/lib/types";

interface LeaderboardTabProps {
  availability: NotificationStatus["availability"];
  onNavigate: (tab: "checkin") => void;
  unit: WeightUnit;
  /** Latest known bodyweight, to pre-fill lift submissions. */
  bodyweightLb: number | null;
  today: string;
  /** Every badge, earned and not (moved here from Today). */
  badges: React.ReactNode;
  /** Open on this board, e.g. Badges from Today's "new badge" banner. */
  startOn?: Board;
}

export type Board = "streaks" | "lifts" | "challenges" | "badges";

/** The Ranks tab (id "leaderboard"): habit streaks, or verified lifts. */
export function LeaderboardTab({ availability, onNavigate, unit, bodyweightLb, today, badges, startOn }: LeaderboardTabProps) {
  const [board, setBoard] = React.useState<Board>(startOn ?? "streaks");
  // Challenges the member joined; opening Ranks shows them first when there are any.
  const [challenges, setChallenges] = React.useState<ChallengeStandings[] | null>(null);
  const [challengeError, setChallengeError] = React.useState<string | null>(null);
  const picked = React.useRef(startOn !== undefined);
  React.useEffect(() => {
    let live = true;
    fetch("/api/challenges", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { challenges?: ChallengeStandings[]; error?: string } | null;
        if (!res.ok || !body?.challenges) throw new Error(body?.error ?? "Challenges need the app opened from your Whop.");
        if (!live) return;
        setChallenges(body.challenges);
        if (!picked.current && body.challenges.length > 0) setBoard("challenges");
      })
      .catch((e: unknown) => live && setChallengeError(e instanceof Error ? e.message : "Couldn't load challenges."));
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className="space-y-5">
      <SegmentedControl
        ariaLabel="Leaderboard"
        value={board}
        onValueChange={(b) => {
          picked.current = true;
          setBoard(b);
        }}
        options={[
          { value: "streaks", label: "Habit streaks" },
          { value: "lifts", label: "Lifts" },
          { value: "challenges", label: "Challenges" },
          { value: "badges", label: "Badges" },
        ]}
        className="max-w-lg"
      />
      {board === "badges" ? (
        <div className="lg:max-w-xl">{badges}</div>
      ) : board === "challenges" ? (
        <div className="space-y-5 lg:max-w-2xl">
          {challenges === null ? (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">{challengeError ?? "Loading…"}</CardContent>
            </Card>
          ) : challenges.length === 0 ? (
            <Card>
              <CardContent className="space-y-1 p-5">
                <p className="flex items-center gap-2 font-semibold">
                  <Trophy className="h-4 w-4 text-primary" />
                  No challenges yet
                </p>
                <p className="text-sm text-muted-foreground">
                  When your coach starts a challenge, you get an invite on Today. Join it and its leaderboard shows up here.
                </p>
              </CardContent>
            </Card>
          ) : (
            challenges.map((c) => (
              <Card key={c.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Trophy className="h-4 w-4 text-primary" />
                    {c.title}
                  </CardTitle>
                  {c.note ? <p className="text-xs italic text-muted-foreground">&ldquo;{c.note}&rdquo;</p> : null}
                </CardHeader>
                <CardContent className="space-y-2">
                  <ChallengeBoard s={c} today={today} />
                  <p className="text-[12px] text-muted-foreground">
                    Ranked by workouts from the challenge program finished between the start and end dates. Finish each
                    workout in Training for it to count.
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : board === "lifts" ? (
        <LiftBoard availability={availability} unit={unit} bodyweightLb={bodyweightLb} today={today} />
      ) : (
        <StreakBoard availability={availability} onNavigate={onNavigate} />
      )}
    </div>
  );
}

function StreakBoard({ availability, onNavigate }: Pick<LeaderboardTabProps, "availability" | "onNavigate">) {
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
