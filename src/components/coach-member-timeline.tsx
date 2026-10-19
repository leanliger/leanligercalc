"use client";

import * as React from "react";
import {
  Camera,
  ClipboardList,
  Dumbbell,
  ListChecks,
  MessageSquare,
  PenLine,
  Reply,
  Ruler,
  Scale,
  StickyNote,
  Trophy,
  Utensils,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { addDays } from "@/lib/dates";
import { TIMELINE_DAYS, TIMELINE_GROUPS, TIMELINE_MAX_DAYS, type TimelineEvent, type TimelineGroup, type TimelineKind } from "@/lib/member-timeline";
import type { WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_STYLE: Record<TimelineKind, { icon: React.ReactNode; tone: string }> = {
  "weigh-in": { icon: <Scale />, tone: "text-primary bg-primary/[0.12]" },
  measurement: { icon: <Ruler />, tone: "text-primary bg-primary/[0.12]" },
  photos: { icon: <Camera />, tone: "text-primary bg-primary/[0.12]" },
  milestone: { icon: <Trophy />, tone: "text-success bg-success/[0.14]" },
  "check-in": { icon: <MessageSquare />, tone: "text-sky-400 bg-sky-400/[0.12]" },
  reply: { icon: <Reply />, tone: "text-sky-400 bg-sky-400/[0.12]" },
  workout: { icon: <Dumbbell />, tone: "text-foreground bg-muted/60" },
  program: { icon: <ClipboardList />, tone: "text-violet-400 bg-violet-400/[0.12]" },
  "program-edit": { icon: <PenLine />, tone: "text-violet-400 bg-violet-400/[0.12]" },
  habits: { icon: <ListChecks />, tone: "text-violet-400 bg-violet-400/[0.12]" },
  macros: { icon: <Utensils />, tone: "text-violet-400 bg-violet-400/[0.12]" },
  note: { icon: <StickyNote />, tone: "text-violet-400 bg-violet-400/[0.12]" },
};

const FILTERS: { id: "all" | TimelineGroup; label: string }[] = [
  { id: "all", label: "All" },
  { id: "checkins", label: "Check-ins" },
  { id: "body", label: "Body" },
  { id: "training", label: "Training" },
  { id: "coach", label: "Your actions" },
];

const RANGES = [TIMELINE_DAYS, 180, TIMELINE_MAX_DAYS];

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const DAY_FORMAT_YEAR = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Your own calendar day for an exact time. */
function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  const d = new Date(`${date}T12:00:00Z`);
  return (date.slice(0, 4) === today.slice(0, 4) ? DAY_FORMAT : DAY_FORMAT_YEAR).format(d);
}

/**
 * One feed of a member's weigh-ins, check-ins, your replies and notes,
 * programs, macros, milestones, measurements, workouts and photo days,
 * newest first, grouped by day: the thing to skim before a call
 * (GET /api/coach/member-timeline).
 */
export function MemberTimelineCard({
  companyId,
  memberId,
  memberName,
  unit,
  today,
}: {
  companyId: string;
  memberId: string;
  memberName: string;
  unit: WeightUnit;
  today: string;
}) {
  const [days, setDays] = React.useState(TIMELINE_DAYS);
  const [events, setEvents] = React.useState<TimelineEvent[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<"all" | TimelineGroup>("all");

  React.useEffect(() => {
    let live = true;
    setError(null);
    const qs = new URLSearchParams({ company: companyId, member: memberId, unit, days: String(days) });
    fetch(`/api/coach/member-timeline?${qs}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { events?: TimelineEvent[]; error?: string } | null;
        if (!res.ok || !body?.events) throw new Error(body?.error ?? "Couldn't load their timeline.");
        if (live) setEvents(body.events);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load their timeline."));
    return () => {
      live = false;
    };
  }, [companyId, memberId, unit, days]);

  const shown = React.useMemo(() => {
    if (!events) return null;
    const kinds = filter === "all" ? null : new Set<TimelineKind>(TIMELINE_GROUPS[filter]);
    // Timed events go on your own day, matching the time shown; the rest are the member's logged day.
    return (kinds ? events.filter((e) => kinds.has(e.kind)) : events)
      .map((e) => (e.at ? { ...e, date: localDay(e.at) } : e))
      .sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : (b.at ?? "").localeCompare(a.at ?? "")));
  }, [events, filter]);

  const byDay = React.useMemo(() => {
    const groups: { date: string; items: TimelineEvent[] }[] = [];
    for (const e of shown ?? []) {
      const last = groups[groups.length - 1];
      if (last && last.date === e.date) last.items.push(e);
      else groups.push({ date: e.date, items: [e] });
    }
    return groups;
  }, [shown]);

  const first = memberName.split(" ")[0] || memberName;
  const nextRange = RANGES.find((r) => r > days);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Timeline</CardTitle>
        <CardDescription>
          Everything {first} logged and everything you sent, newest first. The last {days === TIMELINE_MAX_DAYS ? "year" : `${days} days`}.
        </CardDescription>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5 pt-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "min-h-8 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                filter === f.id ? "border-primary/50 bg-primary/[0.14] text-foreground" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : shown === null ? (
          <div aria-busy="true" aria-label="Loading the timeline" className="h-72 animate-pulse rounded-2xl bg-muted/30" />
        ) : byDay.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {filter === "all" ? `Nothing in the last ${days} days.` : "Nothing of this kind in this stretch."}
          </p>
        ) : (
          <ol className="space-y-5">
            {byDay.map((g) => (
              <li key={g.date}>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {dayLabel(g.date, today)}
                </h3>
                <ol className="relative space-y-3 border-l border-border/70 pl-5">
                  {g.items.map((e, i) => {
                    const s = KIND_STYLE[e.kind];
                    return (
                      <li key={`${e.kind}-${i}`} className="relative">
                        <span
                          aria-hidden
                          className={cn(
                            "absolute -left-[2.15rem] top-0 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-card [&_svg]:h-3.5 [&_svg]:w-3.5",
                            s.tone,
                          )}
                        >
                          {s.icon}
                        </span>
                        <p className="text-sm font-semibold leading-snug">{e.title}</p>
                        {e.at ? (
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(e.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </p>
                        ) : null}
                        {e.detail ? <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{e.detail}</p> : null}
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
        )}
        {events && nextRange ? (
          <div className="mt-5 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setDays(nextRange)}>
              Show older ({nextRange === TIMELINE_MAX_DAYS ? "the last year" : `${nextRange} days`})
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
