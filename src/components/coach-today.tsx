"use client";

import * as React from "react";
import { AlertTriangle, MessageSquare } from "lucide-react";
import { FLAG_LABELS, type MemberSummary } from "@/lib/coach";
import { cn } from "@/lib/utils";

/**
 * The coach dashboard's frame (coach-dashboard.tsx): the side menu, the
 * "Today" lists of who needs the coach, and the strip of this week's numbers.
 */

/** Drifting: any flag other than a check-in waiting on the coach. */
export const isAtRisk = (m: MemberSummary) => m.flags.some((f) => f !== "reply");

export function Avatar({ name, url, size = "h-9 w-9" }: { name: string; url: string | null; size?: string }) {
  const [broken, setBroken] = React.useState(false);
  const initials = name
    .replace(/^@/, "")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return url && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element -- static export: no image optimiser
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className={cn(size, "shrink-0 rounded-full bg-muted object-cover")}
    />
  ) : (
    <span aria-hidden className={cn(size, "flex shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary")}>
      {initials || "?"}
    </span>
  );
}

/* ================================ side menu ================================ */

export interface CoachNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** A count badge (shown when above zero). */
  count?: number;
  active: boolean;
  onSelect: () => void;
}

/** A column on wide screens; a row of pills that scrolls sideways on phones. */
export function CoachNav({ items, footer, className }: { items: CoachNavItem[]; footer?: React.ReactNode; className?: string }) {
  return (
    <nav aria-label="Coach sections" className={cn("space-y-4 lg:sticky lg:top-20", className)}>
      <ul className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0">
        {items.map((it) => (
          <li key={it.id} className="shrink-0">
            <button
              type="button"
              onClick={it.onSelect}
              aria-current={it.active ? "page" : undefined}
              className={cn(
                "flex h-10 w-full items-center gap-2.5 whitespace-nowrap rounded-lg border px-3 text-sm font-medium transition-colors lg:border-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
                it.active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {it.icon}
              <span className="lg:flex-1 lg:text-left">{it.label}</span>
              {it.count ? (
                <span className="tabular min-w-[1.25rem] rounded-full bg-primary px-1.5 text-center text-[11px] font-bold leading-5 text-primary-foreground">
                  {it.count}
                  <span className="sr-only"> waiting</span>
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {footer ? <div className="lg:rounded-lg lg:border lg:border-border lg:p-3">{footer}</div> : null}
    </nav>
  );
}

/* ================================== today ================================== */

const LANE_LIMIT = 4;

function sentAgo(iso: string | undefined, now: number): string {
  if (!iso) return "Check-in waiting";
  const h = Math.max(0, Math.round((now - Date.parse(iso)) / 3_600_000));
  if (h < 1) return "Sent just now";
  if (h < 24) return `Sent ${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Sent yesterday" : `Sent ${d} days ago`;
}

/**
 * Who needs the coach today, in two lists: check-ins waiting for a reply, and
 * members drifting (any other flag). Most urgent first, as the list sorts them.
 */
export function TodayLanes({
  members,
  onOpen,
  onShowAll,
}: {
  members: MemberSummary[];
  /** Open a member, on the check-ins tab or their overview. */
  onOpen: (userId: string, tab: "checkins" | "overview") => void;
  /** Show the whole list, filtered to this lane. */
  onShowAll: (filter: "reply" | "risk") => void;
}) {
  const now = Date.now();
  const reply = members.filter((m) => m.flags.includes("reply"));
  const risk = members.filter(isAtRisk);
  return (
    <section aria-label="Today" className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
      <Lane
        title="Reply to check-ins"
        icon={<MessageSquare />}
        tone="primary"
        list={reply}
        empty="No check-ins waiting on you."
        reason={(m) => sentAgo(m.lastCheckin?.submittedAt, now)}
        action="Reply"
        onOpen={(id) => onOpen(id, "checkins")}
        onMore={() => onShowAll("reply")}
      />
      <Lane
        title="Reach out"
        icon={<AlertTriangle />}
        tone="destructive"
        list={risk}
        empty="Nobody is drifting. Everyone sharing with you is on track."
        reason={(m) =>
          m.flags
            .filter((f) => f !== "reply")
            .map((f) => FLAG_LABELS[f])
            .join(" · ")
        }
        action="Open"
        onOpen={(id) => onOpen(id, "overview")}
        onMore={() => onShowAll("risk")}
      />
    </section>
  );
}

const TONE = {
  primary: { icon: "bg-primary/10 text-primary", count: "text-primary", action: "text-primary" },
  destructive: { icon: "bg-destructive/10 text-destructive", count: "text-destructive", action: "text-foreground" },
} as const;

function Lane({
  title,
  icon,
  tone,
  list,
  empty,
  reason,
  action,
  onOpen,
  onMore,
}: {
  title: string;
  icon: React.ReactNode;
  tone: keyof typeof TONE;
  list: MemberSummary[];
  empty: string;
  reason: (m: MemberSummary) => string;
  action: string;
  onOpen: (userId: string) => void;
  onMore: () => void;
}) {
  const t = TONE[tone];
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md [&_svg]:h-4 [&_svg]:w-4", t.icon)}>{icon}</span>
        <h3 className="flex-1 text-sm font-semibold">{title}</h3>
        <span className={cn("tabular text-lg font-bold", t.count)}>{list.length}</span>
      </div>
      {list.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border/70">
          {list.slice(0, LANE_LIMIT).map((m) => (
            <li key={m.data.userId}>
              <button
                type="button"
                onClick={() => onOpen(m.data.userId)}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar name={m.displayName} url={m.data.avatarUrl} size="h-8 w-8" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.displayName}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{reason(m)}</span>
                </span>
                <span className={cn("shrink-0 text-xs font-semibold", t.action)}>{action}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > LANE_LIMIT ? (
        <button
          type="button"
          onClick={onMore}
          className="self-start rounded text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          See all {list.length}
        </button>
      ) : null}
    </div>
  );
}

/* ================================ this week ================================ */

export interface WeekNumber {
  label: string;
  value: React.ReactNode;
  /** "of 8" after the value. */
  of?: string;
  sub: string;
  emphasis?: boolean;
}

/** This week's numbers in one bordered strip, four across (two on phones). */
export function WeekStrip({ items }: { items: WeekNumber[] }) {
  return (
    <section aria-label="This week" className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="space-y-0.5 bg-card px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{it.label}</p>
          <p className="tabular text-xl font-semibold">
            {it.value}
            {it.of ? <span className="ml-1 text-sm font-normal text-muted-foreground">{it.of}</span> : null}
          </p>
          <p className={cn("text-[12px]", it.emphasis ? "font-medium text-primary" : "text-muted-foreground")}>{it.sub}</p>
        </div>
      ))}
    </section>
  );
}
