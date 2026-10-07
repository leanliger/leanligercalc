"use client";

import * as React from "react";
import { Flame, LogOut, Trophy, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import { ConfirmButton } from "@/components/confirm-button";
import type { NotificationStatus } from "@/components/fasting-card";
import { experienceIdFromPath } from "@/lib/fasting";
import {
  METRIC_LABELS,
  rankEntries,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardResponse,
} from "@/lib/leaderboard";
import { cn } from "@/lib/utils";

/** Rows shown before the list is cut off (your own row is always shown). */
const TOP_N = 25;

const UNAVAILABLE: Record<Exclude<NotificationStatus["availability"], "ok">, string> = {
  local: "The leaderboard is available when you open this app from inside Whop.",
  "no-key": "Coming soon — the leaderboard isn't switched on for this app yet.",
  "no-experience": "Open the app from your Whop community to see its leaderboard.",
};

const MEDAL = ["text-[#d4af37]", "text-[#c0c0c0]", "text-[#cd7f32]"];

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function LeaderboardCard({ availability }: { availability: NotificationStatus["availability"] }) {
  const [data, setData] = React.useState<LeaderboardResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [metric, setMetric] = React.useState<LeaderboardMetric>("streak");
  const experienceId = typeof window === "undefined" ? null : experienceIdFromPath(window.location.pathname);

  const load = React.useCallback(async () => {
    if (!experienceId) return;
    try {
      const res = await fetch(`/api/leaderboard?experience=${experienceId}&tz=${encodeURIComponent(timeZone())}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const body = (await res.json().catch(() => null)) as (LeaderboardResponse & { error?: string }) | null;
      if (!res.ok || !body) {
        setError(body?.error ?? "Couldn't load the leaderboard.");
        return;
      }
      setError(null);
      setData(body);
    } catch {
      setError("Couldn't reach the leaderboard. Check your connection.");
    }
  }, [experienceId]);

  React.useEffect(() => {
    if (availability === "ok") void load();
  }, [availability, load]);

  const join = async () => {
    if (!experienceId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/leaderboard", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ experienceId, timeZone: timeZone() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Couldn't join. Try again.");
      } else {
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!experienceId) return;
    await fetch(`/api/leaderboard?experience=${experienceId}`, { method: "DELETE", credentials: "same-origin" });
    await load();
  };

  const ranked = data ? rankEntries(data.entries, metric) : [];
  const top = ranked.slice(0, TOP_N);
  const you = ranked.find((e) => e.isYou);
  const youBelow = you && !top.includes(you) ? you : null;

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Community leaderboard
          </CardTitle>
          {data ? (
            <Badge variant="secondary" className="gap-1">
              <Users />
              {data.entries.length}
            </Badge>
          ) : null}
        </div>
        <CardDescription>
          {availability !== "ok"
            ? UNAVAILABLE[availability as Exclude<NotificationStatus["availability"], "ok">]
            : "Members who join are ranked on habit consistency. Only names, photos and streak stats are shown — never weight or food."}
        </CardDescription>
      </CardHeader>

      {availability === "ok" ? (
        <CardContent className="space-y-4">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {data && !data.joined ? (
            <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
              <p className="text-sm">
                Join to put your streak on the board and take part in the monthly challenge. You can leave any time.
              </p>
              <Button onClick={() => void join()} disabled={busy} className="w-full sm:w-auto">
                <Trophy />
                {busy ? "Joining…" : "Join the leaderboard"}
              </Button>
            </div>
          ) : null}

          {!data && !error ? <div className="h-40 animate-pulse rounded-md bg-muted/30" aria-busy="true" /> : null}

          {data ? (
            <>
              <SegmentedControl
                ariaLabel="Rank by"
                size="sm"
                value={metric}
                onValueChange={setMetric}
                options={(Object.keys(METRIC_LABELS) as LeaderboardMetric[]).map((m) => ({ value: m, label: METRIC_LABELS[m].tab }))}
              />
              <p className="text-[11px] text-muted-foreground">{METRIC_LABELS[metric].help}</p>

              {ranked.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  Nobody has joined yet. Be the first!
                </p>
              ) : (
                <ol className="space-y-1.5" aria-label={`Leaderboard by ${METRIC_LABELS[metric].tab.toLowerCase()}`}>
                  {top.map((e) => (
                    <Row key={`${e.rank}-${e.name}-${e.isYou}`} e={e} metric={metric} />
                  ))}
                  {youBelow ? (
                    <>
                      <li aria-hidden className="py-0.5 text-center text-xs text-muted-foreground">
                        ⋯
                      </li>
                      <Row e={youBelow} metric={metric} />
                    </>
                  ) : null}
                </ol>
              )}

              {data.joined ? (
                <div className="flex justify-end">
                  <ConfirmButton
                    variant="ghost"
                    className="text-muted-foreground"
                    icon={<LogOut />}
                    label="Leave leaderboard"
                    confirmLabel="Yes, leave"
                    onConfirm={leave}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function Row({ e, metric }: { e: LeaderboardEntry & { rank: number; value: number }; metric: LeaderboardMetric }) {
  const [broken, setBroken] = React.useState(false);
  const initials = e.name
    .replace(/^@/, "")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const valueText = metric === "week" && e.week === null ? "—" : METRIC_LABELS[metric].unit(e.value);
  // Trophies are earned: top three with an actual score.
  const medal = e.rank <= 3 && e.value > 0;
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2",
        e.isYou ? "border-primary bg-primary/10" : "border-border",
      )}
    >
      <span
        className={cn(
          "tabular w-6 shrink-0 text-center text-sm font-semibold",
          medal ? MEDAL[e.rank - 1] : "text-muted-foreground",
        )}
      >
        {medal ? <Trophy className="mx-auto h-4 w-4" aria-label={`Rank ${e.rank}`} /> : e.rank}
      </span>
      {e.avatarUrl && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- static export: no image optimiser
        <img
          src={e.avatarUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-8 w-8 shrink-0 rounded-full bg-muted object-cover"
        />
      ) : (
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
          {initials || "?"}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{e.name}</span>
          {e.isYou ? (
            <Badge variant="default" className="px-1.5 py-0 text-[10px]">
              You
            </Badge>
          ) : null}
        </span>
        {metric !== "streak" && e.streak > 0 ? (
          <span className="tabular inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <Flame className="h-3 w-3" aria-hidden />
            {e.streak}-day streak
          </span>
        ) : metric === "streak" && e.best > e.streak ? (
          <span className="tabular text-[11px] text-muted-foreground">best {e.best}</span>
        ) : null}
      </span>
      <span className="tabular shrink-0 text-sm font-semibold">{valueText}</span>
    </li>
  );
}
