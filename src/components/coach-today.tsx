"use client";

import * as React from "react";
import { AlertTriangle, Check, Loader2, MessageSquare, PartyPopper, Search } from "lucide-react";
import { FLAG_LABELS, healthZone, type Flag, type MemberSummary } from "@/lib/coach";
import { kudosMessage } from "@/lib/messages";
import { milestoneLabel } from "@/lib/milestones";
import type { WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The coach dashboard's frame (coach-dashboard.tsx): the side menu, the
 * "Today" lists of who needs the coach, and the strip of this week's numbers.
 */

/** Drifting: any flag other than a check-in waiting on the coach. */
export const isAtRisk = (m: MemberSummary) => m.flags.some((f) => f !== "reply");

/** A flag as a reason line; Strength slipping names its lifts. */
const flagReason = (m: MemberSummary, f: Flag) =>
  f === "slipping" && m.data.slipping?.length
    ? `${FLAG_LABELS[f]}: ${m.data.slipping.slice(0, 2).join(", ")}${m.data.slipping.length > 2 ? ` +${m.data.slipping.length - 2}` : ""}`
    : FLAG_LABELS[f];

/** Where a member opens from Today: their lift progress when slipping strength is the only reason, else their overview. */
const openTab = (m: MemberSummary): "training" | "overview" =>
  m.flags.filter((f) => f !== "reply").every((f) => f === "slipping") && m.flags.includes("slipping") ? "training" : "overview";

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
  /** A plain count after the label, e.g. how many members. */
  note?: number;
  /** A shorter label for the bottom bar on phones. */
  short?: string;
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
              {it.note !== undefined ? <span className="tabular text-xs text-muted-foreground">{it.note}</span> : null}
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
/** A member's newest milestone, in words ("Down 10 lb since starting"). */
const newestWinLabel = (m: MemberSummary, unit: WeightUnit) => {
  const w = [...(m.data.milestones ?? [])].sort((a, b) => b.reachedOn.localeCompare(a.reachedOn))[0];
  return w ? milestoneLabel(w, unit) : null;
};

/**
 * Kudos on the Celebrate list: one tap sends a congratulation as a chat
 * message (they get a Whop notification). Remembered on this device per
 * milestone, so it isn't sent twice.
 */
export function KudosButton({
  m,
  unit,
  onKudos,
  className,
}: {
  m: MemberSummary;
  unit: WeightUnit;
  onKudos: (memberId: string, text: string) => Promise<void>;
  className?: string;
}) {
  const win = newestWinLabel(m, unit);
  const key = `prep-calculator:kudos:${m.data.userId}:${newestWin(m)}`;
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "failed">("idle");
  React.useEffect(() => {
    try {
      if (localStorage.getItem(key)) setState("sent");
    } catch {
      /* no storage: the button stays available */
    }
    // The phone and computer layouts each have a button; sending from one marks both.
    const on = (e: Event) => (e as CustomEvent<string>).detail === key && setState("sent");
    window.addEventListener("kudos-sent", on);
    return () => window.removeEventListener("kudos-sent", on);
  }, [key]);
  if (!win) return null;
  const first = m.displayName.split(" ")[0] || m.displayName;
  const send = async () => {
    setState("sending");
    try {
      await onKudos(m.data.userId, kudosMessage(first, win));
      setState("sent");
      window.dispatchEvent(new CustomEvent("kudos-sent", { detail: key }));
      try {
        localStorage.setItem(key, "1");
      } catch {
        /* not remembered; still sent */
      }
    } catch {
      setState("failed");
    }
  };
  return (
    <button
      type="button"
      onClick={() => void send()}
      disabled={state === "sending" || state === "sent"}
      title={state === "sent" ? "Kudos sent" : `Send: “${kudosMessage(first, win)}”`}
      aria-label={state === "sent" ? `Kudos sent to ${m.displayName}` : `Send kudos to ${m.displayName}`}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        state === "sent" ? "border-success/40 text-success" : state === "failed" ? "border-destructive/50 text-destructive" : "border-success/40 text-success hover:bg-success/10",
        className,
      )}
    >
      {state === "sending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === "sent" ? <Check className="h-3.5 w-3.5" /> : <PartyPopper className="h-3.5 w-3.5" />}
      {state === "sent" ? "Sent" : state === "failed" ? "Retry" : "Kudos"}
    </button>
  );
}

export function TodayLanes({
  members,
  unit,
  onOpen,
  onShowAll,
  onKudos,
}: {
  members: MemberSummary[];
  unit: WeightUnit;
  /** Send kudos as a chat message. */
  onKudos?: (memberId: string, text: string) => Promise<void>;
  /** Open a member, on the check-ins tab or their overview. */
  onOpen: (userId: string, tab: "checkins" | "overview" | "training") => void;
  /** Show the whole list, filtered to this lane. */
  onShowAll: (filter: "reply" | "risk" | "all") => void;
}) {
  const now = Date.now();
  const reply = members.filter((m) => m.flags.includes("reply"));
  const risk = members.filter(isAtRisk);
  // Milestones in the last week, newest first.
  const wins = members
    .filter((m) => (m.data.milestones ?? []).length > 0)
    .sort((a, b) => newestWin(b).localeCompare(newestWin(a)));
  return (
    <section aria-label="Today" className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
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
            .map((f) => flagReason(m, f))
            .join(" · ")
        }
        action="Open"
        onOpen={(id) => {
          const m = risk.find((x) => x.data.userId === id);
          onOpen(id, m ? openTab(m) : "overview");
        }}
        onMore={() => onShowAll("risk")}
      />
      <Lane
        title="Celebrate"
        icon={<PartyPopper />}
        tone="success"
        list={wins}
        empty="No milestones this week. They show here when someone is 5 lb down, or an inch off the waist."
        reason={(m) =>
          [...(m.data.milestones ?? [])]
            .sort((a, b) => b.reachedOn.localeCompare(a.reachedOn))
            .map((x) => milestoneLabel(x, unit))
            .join(" · ")
        }
        action="Open"
        onOpen={(id) => onOpen(id, "overview")}
        onMore={() => onShowAll("all")}
        extra={onKudos ? (m) => <KudosButton m={m} unit={unit} onKudos={onKudos} /> : undefined}
      />
    </section>
  );
}

const newestWin = (m: MemberSummary) => (m.data.milestones ?? []).reduce((d, x) => (x.reachedOn > d ? x.reachedOn : d), "");

const TONE = {
  primary: { icon: "bg-primary/10 text-primary", count: "text-primary", action: "text-primary" },
  success: { icon: "bg-success/10 text-success", count: "text-success", action: "text-foreground" },
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
  extra,
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
  /** A button beside each row (kudos). */
  extra?: (m: MemberSummary) => React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className="flex min-w-0 flex-col gap-2 molten-card rounded-[1.25rem] border border-primary/15 bg-card p-4">
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
            <li key={m.data.userId} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onOpen(m.data.userId)}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-1 py-1.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar name={m.displayName} url={m.data.avatarUrl} size="h-8 w-8" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{m.displayName}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{reason(m)}</span>
                </span>
                <span className={cn("shrink-0 text-xs font-semibold", t.action)}>{action}</span>
              </button>
              {extra?.(m)}
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

/* ================================ on phones ================================ */

const ZONE_CIRCLE = {
  green: "border-success/45 bg-success/10 text-success",
  yellow: "border-warning/45 bg-warning/10 text-warning",
  red: "border-destructive/45 bg-destructive/10 text-destructive",
} as const;

/**
 * Today on a phone: three counts (check-ins to reply, members to reach out
 * to, wins), a Needs you · At risk · All switch, and one card per member with
 * their health score and what to do. Wider screens get the lanes instead.
 */
export function PhoneToday({
  members,
  today,
  onOpen,
  onSearch,
  unit,
  onKudos,
}: {
  members: MemberSummary[];
  today: string;
  unit: WeightUnit;
  onKudos?: (memberId: string, text: string) => Promise<void>;
  onOpen: (userId: string, tab: "checkins" | "overview" | "training") => void;
  onSearch: () => void;
}) {
  const [show, setShow] = React.useState<"needs" | "risk" | "wins" | "all">("needs");
  const now = Date.now();
  const reply = members.filter((m) => m.flags.includes("reply"));
  const risk = members.filter(isAtRisk);
  const wins = members.filter((m) => (m.data.milestones ?? []).length > 0);
  const needs = members.filter((m) => m.flags.length > 0);
  const list = show === "needs" ? needs : show === "risk" ? risk : show === "wins" ? wins : members;
  const reason = (m: MemberSummary) => {
    const flags = m.flags.filter((f) => f !== "reply").map((f) => flagReason(m, f));
    if (m.flags.includes("reply")) return [sentAgo(m.lastCheckin?.submittedAt, now).replace(/^Sent/, "Check-in waiting · sent"), ...flags.slice(0, 1)].join(" · ");
    if (flags.length > 0) return flags.join(" · ");
    const win = (m.data.milestones ?? [])[0];
    return win ? "A milestone this week" : "On track";
  };
  const stats = [
    { id: "needs" as const, n: reply.length, label: "Check-ins to reply", tone: "text-primary" },
    { id: "risk" as const, n: risk.length, label: "Members to reach out to", tone: "text-destructive" },
    { id: "wins" as const, n: wins.length, label: "Wins to celebrate", tone: "text-success" },
  ];
  const pills = [
    { id: "needs" as const, label: "Needs you", n: needs.length },
    { id: "risk" as const, label: "At risk", n: risk.length },
    { id: "all" as const, label: "All", n: members.length },
  ];
  return (
    <section aria-label="Today" className="space-y-4 lg:hidden">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-muted-foreground">
            {new Date(`${today}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
          </p>
          <h2 className="text-2xl font-semibold tracking-tight">Today</h2>
        </div>
        <button
          type="button"
          onClick={onSearch}
          aria-label="Search members"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4">
        {stats.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setShow(s.id)}
            className="flex w-[7.5rem] shrink-0 flex-col gap-0.5 molten-card rounded-[1.25rem] border border-primary/15 bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className={cn("tabular text-2xl font-bold", s.tone)}>{s.n}</span>
            <span className="text-[12px] leading-snug text-foreground/85">{s.label}</span>
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-label="Show" className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {pills.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={show === p.id}
            onClick={() => setShow(p.id)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              show === p.id ? "border-primary bg-primary font-semibold text-primary-foreground" : "border-border text-foreground/85",
            )}
          >
            {p.label} <span className="tabular">{p.n}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
          {show === "needs" ? "Nobody needs you right now." : show === "risk" ? "Nobody is drifting." : show === "wins" ? "No milestones this week." : "Nobody is sharing yet."}
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => {
            const toReply = m.flags.includes("reply");
            const win = onKudos && (m.data.milestones ?? []).length > 0;
            return (
              <li key={m.data.userId} className="relative">
                <button
                  type="button"
                  onClick={() => onOpen(m.data.userId, toReply ? "checkins" : openTab(m))}
                  className={cn(
                    "flex w-full items-center gap-3 molten-card rounded-[1.25rem] border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    toReply ? "border-primary/45" : "border-border",
                    win && "pb-12",
                  )}
                >
                  {m.health ? (
                    <span
                      className={cn(
                        "tabular flex h-10 w-10 shrink-0 items-center justify-center rounded-full border font-bold",
                        ZONE_CIRCLE[healthZone(m.health.score)],
                      )}
                    >
                      {m.health.score}
                      <span className="sr-only"> health score</span>
                    </span>
                  ) : (
                    <Avatar name={m.displayName} url={m.data.avatarUrl} size="h-10 w-10" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{m.displayName}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">{reason(m)}</span>
                  </span>
                  <span className={cn("shrink-0 text-[13px] font-semibold", toReply ? "text-primary" : "text-foreground/85")}>
                    {toReply ? "Reply" : "Open"}
                  </span>
                </button>
                {win ? (
                  <span className="absolute bottom-2.5 left-[4.25rem] right-3 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[12px] text-success">{newestWinLabel(m, unit)}</span>
                    <KudosButton m={m} unit={unit} onKudos={onKudos!} />
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The coach's sections as a bar along the bottom of a phone. */
export function CoachBottomNav({ items }: { items: CoachNavItem[] }) {
  return (
    <nav
      aria-label="Coach sections"
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-background/95 px-1 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={it.onSelect}
          aria-current={it.active ? "page" : undefined}
          className={cn(
            "relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:h-5 [&_svg]:w-5",
            it.active ? "font-semibold text-primary" : "text-muted-foreground",
          )}
        >
          {it.icon}
          <span className="max-w-full truncate px-0.5">
            {it.short ?? it.label}
            {it.count ? ` ${it.count}` : ""}
          </span>
        </button>
      ))}
    </nav>
  );
}

/** Photo storage across the app, as a bar: uploads stop at the cap. */
export function PhotoStorageMeter({ usedBytes, capBytes }: { usedBytes: number; capBytes: number }) {
  const share = capBytes > 0 ? usedBytes / capBytes : 0;
  const pct = Math.min(100, Math.round(share * 100));
  const gb = (b: number) => (b / 1024 ** 3).toFixed(b < 1024 ** 3 ? 2 : 1);
  return (
    <div className="space-y-2" title={`${gb(usedBytes)} of ${gb(capBytes)} GB of progress photos, across everyone using the app`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Photo storage</p>
      <div
        role="progressbar"
        aria-label="Progress photo storage used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full", share >= 0.8 ? "bg-warning" : "bg-primary")} style={{ width: `${Math.max(pct, share > 0 ? 2 : 0)}%` }} />
      </div>
      <p className={cn("text-[12px]", share >= 0.8 ? "text-warning" : "text-muted-foreground")}>
        {pct}% used{share >= 1 ? ": full, members can't add photos" : share >= 0.8 ? ": nearly full" : ""}
      </p>
    </div>
  );
}
