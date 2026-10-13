"use client";

import * as React from "react";
import { Trophy } from "lucide-react";
import type { ChallengeStandings } from "@/lib/challenges";
import { formatShort } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** A challenge's leaderboard: rank, member, workouts done of planned. Shared by members (Ranks) and coaches (Assign). */
export function ChallengeBoard({ s, today }: { s: ChallengeStandings; today: string }) {
  const status = today < s.startDate ? `Starts ${formatShort(s.startDate)}` : today > s.endDate ? "Finished" : `Ends ${formatShort(s.endDate)}`;
  return (
    <div className="space-y-2">
      <p className="tabular text-[12px] text-muted-foreground">
        {formatShort(s.startDate)} – {formatShort(s.endDate)} · {s.weeks} week{s.weeks === 1 ? "" : "s"} · {s.planned} workouts ·{" "}
        {s.entrants} joined · {status}
      </p>
      {s.entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Nobody has joined yet.</p>
      ) : (
        <ol className="divide-y divide-border rounded-md border border-border">
          {s.entries.map((e) => {
            const pct = s.planned > 0 ? Math.min(100, Math.round((e.done / s.planned) * 100)) : 0;
            return (
              <li key={e.userId} className={cn("flex items-center gap-2.5 px-3 py-2", e.isYou && "bg-primary/5")}>
                <span
                  className={cn(
                    "tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    e.rank === 1 && e.done > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {e.rank === 1 && e.done > 0 ? <Trophy className="h-3.5 w-3.5" aria-label="1st" /> : e.rank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {e.name}
                    {e.isYou ? <span className="ml-1.5 text-xs font-normal text-primary">you</span> : null}
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </span>
                </span>
                <span className="tabular shrink-0 text-right text-xs">
                  <span className="font-semibold">{e.done}</span>
                  <span className="text-muted-foreground"> / {s.planned}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
