"use client";

import * as React from "react";
import { Check, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Checkin } from "@/lib/checkins";
import { addDays, formatShort, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Focus from a check-in shows for two weeks at most (a new reply replaces it sooner). */
const SHOW_DAYS = 14;

/**
 * Today → "This week's focus": the things the coach picked in their last
 * check-in reply (src/lib/checkin-report.ts), ticked off on this device
 * as the member does them.
 */
export function CoachFocusCard() {
  const [focus, setFocus] = React.useState<{ weekStart: string; items: string[]; repliedAt: string | null } | null>(null);
  const [done, setDone] = React.useState<Record<number, boolean>>({});

  React.useEffect(() => {
    let live = true;
    fetch("/api/checkins", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<{ checkins?: Checkin[] }>) : null))
      .then((b) => {
        const c = b?.checkins?.find((x) => x.coachFocus && x.coachFocus.length > 0);
        if (!live || !c || c.weekStart < addDays(todayISO(), -SHOW_DAYS)) return;
        setFocus({ weekStart: c.weekStart, items: c.coachFocus!, repliedAt: c.repliedAt });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const key = focus ? `prep-calculator:coach-focus:${focus.weekStart}` : null;
  React.useEffect(() => {
    if (!key) return;
    try {
      setDone(JSON.parse(localStorage.getItem(key) ?? "{}") as Record<number, boolean>);
    } catch {
      /* no storage */
    }
  }, [key]);
  const toggle = (i: number) =>
    setDone((d) => {
      const next = { ...d, [i]: !d[i] };
      try {
        if (key) localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* not remembered */
      }
      return next;
    });

  if (!focus) return null;
  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-2 p-4 sm:p-6">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-primary">
          <Target className="h-3.5 w-3.5" aria-hidden />
          This week&apos;s focus from your coach
          {focus.repliedAt ? <span className="font-medium normal-case tracking-normal text-muted-foreground">· {formatShort(focus.repliedAt.slice(0, 10))}</span> : null}
        </p>
        <ul className="space-y-1.5">
          {focus.items.map((item, i) => (
            <li key={i}>
              <button
                type="button"
                role="checkbox"
                aria-checked={!!done[i]}
                onClick={() => toggle(i)}
                className="flex w-full items-start gap-2.5 rounded-xl px-1 py-1 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                    done[i] ? "border-success bg-success text-success-foreground" : "border-primary/40",
                  )}
                  aria-hidden
                >
                  {done[i] ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span className={cn("text-sm", done[i] && "text-muted-foreground line-through")}>{item}</span>
              </button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
