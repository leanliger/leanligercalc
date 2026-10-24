"use client";

import * as React from "react";
import { CalendarClock, RefreshCw } from "lucide-react";
import type { ReviewSchedule } from "@/lib/adaptive";
import { daysBetween, parseISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * The weekly review's timing (`reviewSchedule` in src/lib/adaptive.ts): when
 * it last updated and when the next review is, as a strip on the Progress
 * tab's Weekly review and a line on the Plan tab's summary of it.
 */

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
/** "Fri, Oct 23" */
const day = (iso: string) => DAY_FORMAT.format(parseISODate(iso));

const inDays = (n: number) => (n <= 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

function lastText(s: ReviewSchedule, today: string): { title: string; sub: string; late: boolean } {
  if (!s.lastUpdate) return { title: "No weigh-ins yet", sub: "it starts with your first one", late: false };
  const ago = daysBetween(s.lastUpdate, today);
  if (s.stale) return { title: day(s.lastUpdate), sub: `${ago} days old · weigh in to update it`, late: true };
  return { title: day(s.lastUpdate), sub: ago <= 0 ? "from this morning's weigh-in" : ago === 1 ? "from yesterday's weigh-in" : "from that morning's weigh-in", late: false };
}

function nextText(s: ReviewSchedule, today: string): { title: string; sub: string } {
  const n = s.next;
  if (!n) {
    if (s.needed) {
      const parts = [
        s.needed.weighIns > 0 ? `${s.needed.weighIns} more weigh-in${s.needed.weighIns === 1 ? "" : "s"}` : null,
        s.needed.days > 0 ? `${s.needed.days} more day${s.needed.days === 1 ? "" : "s"}` : null,
      ].filter(Boolean);
      return { title: `After ${parts.join(" and ")}`, sub: "then it compares you against the plan" };
    }
    return { title: s.lastUpdate ? "Last plan week" : "After your first weigh-in", sub: s.lastUpdate ? "no more reviews in this plan" : "weigh in to start it" };
  }
  const days = daysBetween(today, n.date);
  if (n.why === "settle") {
    return days <= 0
      ? { title: "Your next weigh-in", sub: "your last change has had its 2 weeks" }
      : { title: day(n.date), sub: `${inDays(days)} · 2 weeks after your calorie change, so water weight settles first` };
  }
  if (n.why === "start") return { title: day(n.date), sub: `${inDays(days)} · your plan starts` };
  return { title: day(n.date), sub: `${inDays(days)} · plan week ${n.planWeek} starts` };
}

/** "Updated Fri, Oct 23 · next review Mon, Oct 26", for the Plan tab. */
export function reviewLine(s: ReviewSchedule, today: string): { text: string; late: boolean } {
  const last = lastText(s, today);
  const next = nextText(s, today);
  const nextPart = s.next ? (s.next.why === "settle" && daysBetween(today, s.next.date) <= 0 ? "next review with your next weigh-in" : `next review ${next.title}`) : next.title.toLowerCase();
  return { text: `${s.lastUpdate ? `Updated ${last.title}` : last.title} · ${nextPart}`, late: last.late };
}

export function ReviewTiming({ schedule, today }: { schedule: ReviewSchedule; today: string }) {
  const last = lastText(schedule, today);
  const next = nextText(schedule, today);
  const week = schedule.next?.why === "week" ? schedule.week : null;
  return (
    <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/[0.06] p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-primary">
            <RefreshCw className="h-3 w-3" aria-hidden />
            Last update
          </p>
          <p className={cn("tabular text-sm font-semibold", last.late && "text-destructive")}>{last.title}</p>
          <p className={cn("text-[12px]", last.late ? "text-destructive" : "text-muted-foreground")}>{last.sub}</p>
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-primary">
            <CalendarClock className="h-3 w-3" aria-hidden />
            Next review
          </p>
          <p className="tabular text-sm font-semibold">{next.title}</p>
          <p className="text-[12px] text-muted-foreground">{next.sub}</p>
        </div>
      </div>
      {week ? (
        <>
          <div
            role="progressbar"
            aria-label={`Day ${week.day} of 7 of plan week ${week.index}`}
            aria-valuemin={1}
            aria-valuemax={7}
            aria-valuenow={week.day}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((week.day / 7) * 100)}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Day {week.day} of 7 of plan week {week.index} · any calorie change starts on review day
          </p>
        </>
      ) : null}
    </div>
  );
}

const KEPT_KEY = "prep-calculator:kept-recommendation";

/**
 * "Keep" on a calorie recommendation, remembered on this device until the
 * next one (by the week it would start), so the Plan tab stops flagging it too.
 */
export function useKeptRecommendation(): [string | null, (effectiveFrom: string) => void] {
  const [kept, setKept] = React.useState<string | null>(null);
  React.useEffect(() => {
    try {
      setKept(localStorage.getItem(KEPT_KEY));
    } catch {
      /* not remembered */
    }
    const on = (e: Event) => setKept((e as CustomEvent<string>).detail);
    window.addEventListener("recommendation-kept", on);
    return () => window.removeEventListener("recommendation-kept", on);
  }, []);
  const keep = React.useCallback((effectiveFrom: string) => {
    setKept(effectiveFrom);
    try {
      localStorage.setItem(KEPT_KEY, effectiveFrom);
    } catch {
      /* kept for this visit */
    }
    window.dispatchEvent(new CustomEvent("recommendation-kept", { detail: effectiveFrom }));
  }, []);
  return [kept, keep];
}
