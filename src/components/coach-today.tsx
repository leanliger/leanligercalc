"use client";

import * as React from "react";
import { Check, Clock, Loader2, MessageCircle, MessageSquare, MoreHorizontal, PartyPopper, Undo2, Zap } from "lucide-react";
import { addDays, daysBetween } from "@/lib/dates";
import { FLAG_LABELS, type Flag, type MemberSummary } from "@/lib/coach";
import { kudosMessage, messagePreview, type ChatThread } from "@/lib/messages";
import { goalLabel } from "@/lib/lift-goals";
import { milestoneLabel } from "@/lib/milestones";
import type { WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The coach dashboard's frame (coach-dashboard.tsx): the side menu, the
 * "Today" queue of what needs the coach, and the strip of this week's numbers.
 */

/** Drifting: any flag other than a check-in waiting on the coach. */
export const isAtRisk = (m: MemberSummary) => m.flags.some((f) => f !== "reply");

const named = (label: string, names: readonly string[]) => `${label}: ${names.slice(0, 2).join(", ")}${names.length > 2 ? ` +${names.length - 2}` : ""}`;

/** A flag as a reason line; Strength slipping and Lift goal slipping name their lifts. */
const flagReason = (m: MemberSummary, f: Flag) =>
  f === "slipping" && m.data.slipping?.length
    ? named(FLAG_LABELS[f], m.data.slipping)
    : f === "goal-slipping" && m.data.goalsSlipping?.length
      ? named(FLAG_LABELS[f], m.data.goalsSlipping)
      : FLAG_LABELS[f];

/** Where a member opens from Today: their lift progress when slipping strength is the only reason, else their overview. */
export const openTab = (m: MemberSummary): "training" | "overview" =>
  m.flags.filter((f) => f !== "reply").every((f) => f === "slipping" || f === "muscle-loss" || f === "goal-slipping") &&
  (m.flags.includes("slipping") || m.flags.includes("goal-slipping"))
    ? "training"
    : "overview";

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

export function sentAgo(iso: string | undefined, now: number): string {
  if (!iso) return "Check-in waiting";
  const h = Math.max(0, Math.round((now - Date.parse(iso)) / 3_600_000));
  if (h < 1) return "Sent just now";
  if (h < 24) return `Sent ${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Sent yesterday" : `Sent ${d} days ago`;
}

/** A member's wins this week, newest first: milestones and lift goals hit. */
const winsOf = (m: MemberSummary, unit: WeightUnit) =>
  [
    ...(m.data.milestones ?? []).map((x) => ({ label: milestoneLabel(x, unit), date: x.reachedOn })),
    ...(m.data.goalHits ?? []).map((g) => ({ label: `Hit the ${goalLabel(g, unit)} goal`, date: g.reachedOn })),
  ].sort((a, b) => b.date.localeCompare(a.date));

/** A member's newest win, in words ("Down 10 lb since starting", "Hit the Deadlift 365 lb goal"). */
const newestWinLabel = (m: MemberSummary, unit: WeightUnit) => winsOf(m, unit)[0]?.label ?? null;

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

const newestWin = (m: MemberSummary) => winsOf(m, "lb")[0]?.date ?? "";

/* ================================ action queue ================================ */

type QueueKind = "safety" | "drop-off" | "checkin" | "message" | "muscle" | "risk" | "quiet" | "win";
type QueueFilter = "all" | "checkins" | "messages" | "risk" | "quiet" | "wins";

/** Days without a message, check-in reply or reminder from a coach before a member shows as Quiet. */
export const QUIET_DAYS = 14;

/** Most urgent first: safety, then quitting, then people waiting on a reply, then drifting, then wins. */
const KIND: Record<QueueKind, { rank: number; label: string; stripe: string; chip: string; filter: QueueFilter }> = {
  safety: { rank: 0, label: "Safety", stripe: "border-l-destructive", chip: "bg-destructive/15 text-destructive", filter: "risk" },
  "drop-off": { rank: 1, label: "May quit", stripe: "border-l-destructive", chip: "bg-destructive/15 text-destructive", filter: "risk" },
  checkin: { rank: 2, label: "Check-in", stripe: "border-l-primary", chip: "bg-primary/15 text-primary", filter: "checkins" },
  message: { rank: 3, label: "Message", stripe: "border-l-primary", chip: "bg-primary/15 text-primary", filter: "messages" },
  muscle: { rank: 4, label: "Losing muscle", stripe: "border-l-warning", chip: "bg-warning/15 text-warning", filter: "risk" },
  risk: { rank: 5, label: "Drifting", stripe: "border-l-warning", chip: "bg-warning/15 text-warning", filter: "risk" },
  quiet: { rank: 6, label: "Quiet", stripe: "border-l-muted-foreground/40", chip: "bg-muted text-muted-foreground", filter: "quiet" },
  win: { rank: 7, label: "Win", stripe: "border-l-success", chip: "bg-success/15 text-success", filter: "wins" },
};

const QUEUE_LIMIT = 10;

interface QueueRow {
  key: string;
  kind: QueueKind;
  id: string;
  name: string;
  avatarUrl: string | null;
  summary: MemberSummary | null;
  reason: string;
  /** Other things waiting from them ("2 unread", "Check-in waiting"). */
  also: string[];
  /** Every other reason they're here, behind "+N more". */
  more: string[];
  /** Within a kind: oldest first for replies, the list's urgency order for the rest. */
  order: string;
}

/**
 * Today: one list of everything that needs the coach, most urgent first.
 * Each member shows once, at their most urgent reason (wins are listed apart),
 * with the action for it right there: Reply opens the Inbox, Remind sends a
 * reminder, Kudos sends congratulations. Check-ins that are 1-click ready are
 * left out and cleared together from the button at the top.
 */
export function ActionQueue({
  members,
  threads,
  names,
  triage,
  routineCount,
  unit,
  onRoutine,
  onInbox,
  onOpen,
  onKudos,
  remind,
  today,
  snoozes,
  onSnooze,
}: {
  today: string;
  /** Rows hidden by the coach: "kind:memberId" → the day they show again. */
  snoozes: ReadonlyMap<string, string>;
  /** Hide a row until a day (Done for today, Snooze 3 days), or show it again (null). */
  onSnooze: (memberId: string, kind: string, until: string | null) => void;
  members: MemberSummary[];
  threads: ChatThread[];
  /** Everyone's name and photo, for messages from members who don't share. */
  names: ReadonlyMap<string, { name: string; avatarUrl: string | null }>;
  triage: ReadonlyMap<string, { ready: boolean; reasons: string[] }>;
  routineCount: number;
  unit: WeightUnit;
  onRoutine: () => void;
  /** Their waiting check-in and chat. */
  onInbox: (userId: string) => void;
  onOpen: (userId: string, tab: "overview" | "training") => void;
  onKudos: (memberId: string, text: string) => Promise<void>;
  /** The Remind menu for a member. */
  remind: (m: MemberSummary) => React.ReactNode;
}) {
  const [show, setShow] = React.useState<QueueFilter>("all");
  const [all, setAll] = React.useState(false);
  // Rows with every reason showing, and whether hidden rows are listed.
  const [open, setOpen] = React.useState<ReadonlySet<string>>(new Set());
  const [showHidden, setShowHidden] = React.useState(false);
  const now = Date.now();
  const unread = new Map(threads.filter((t) => t.unread > 0 && !t.last.fromCoach).map((t) => [t.memberId, t]));

  const rows: QueueRow[] = [];
  members.forEach((m, i) => {
    const id = m.data.userId;
    const f = m.flags;
    const thread = unread.get(id);
    const t = triage.get(id);
    const waitingReply = f.includes("reply");
    const base = { id, name: m.displayName, avatarUrl: m.data.avatarUrl, summary: m, order: String(i).padStart(5, "0") };
    let row: { kind: QueueKind; reason: string; order?: string } | null = null;
    // Everything that's true of them, for "+N more" (the row's own reason is dropped below).
    const reasons = [
      ...(waitingReply ? [t?.ready ? "Check-in 1-click ready" : `Check-in waiting (${sentAgo(m.lastCheckin?.submittedAt, now).replace(/^Sent /, "sent ")})`] : []),
      ...(thread ? [`${thread.unread} unread message${thread.unread === 1 ? "" : "s"}`] : []),
      ...(f.includes("drop-off") ? m.risk.reasons.map((r) => r.text) : []),
      ...f.filter((x) => x !== "reply" && x !== "drop-off").map((x) => flagReason(m, x)),
    ];
    if (f.includes("too-fast") || f.includes("under-floor")) {
      row = { kind: "safety", reason: f.filter((x) => x === "too-fast" || x === "under-floor").map((x) => FLAG_LABELS[x]).join(" · ") };
    } else if (f.includes("drop-off")) {
      row = { kind: "drop-off", reason: m.risk.reasons[0]?.text ?? FLAG_LABELS["drop-off"] };
    } else if (waitingReply && !t?.ready) {
      row = {
        kind: "checkin",
        reason: [sentAgo(m.lastCheckin?.submittedAt, now), t && t.reasons.length ? `needs you: ${t.reasons.join(", ")}` : null].filter(Boolean).join(" · "),
        order: m.lastCheckin?.submittedAt ?? "",
      };
    } else if (thread) {
      row = { kind: "message", reason: `“${messagePreview(thread.last)}”`, order: thread.last.at };
    } else if (f.includes("muscle-loss")) {
      row = { kind: "muscle", reason: flagReason(m, f.includes("slipping") ? "slipping" : "muscle-loss") };
    } else if (isAtRisk(m)) {
      row = { kind: "risk", reason: f.filter((x) => x !== "reply").map((x) => flagReason(m, x)).join(" · ") };
    } else {
      // Nothing wrong, but you haven't been in touch for a while (counted from when they started sharing).
      const last = m.data.lastCoachContact ? m.data.lastCoachContact.slice(0, 10) : null;
      const since = m.data.sharing.since?.slice(0, 10) ?? null;
      const from = last ?? since;
      if (from && daysBetween(from, today) >= QUIET_DAYS && !waitingReply) {
        row = {
          kind: "quiet",
          reason: last
            ? `No message, check-in reply or reminder from you in ${daysBetween(last, today)} days`
            : `You haven't reached out since they started sharing (${daysBetween(since!, today)} days ago)`,
          order: from,
        };
      }
    }
    if (row) {
      const also = [
        row.kind !== "message" && thread ? `${thread.unread} unread` : null,
        row.kind !== "checkin" && waitingReply ? (t?.ready ? "Check-in 1-click ready" : "Check-in waiting") : null,
      ].filter((x): x is string => x !== null);
      // Not what the row or its chips already say.
      const checkinShown = row.kind === "checkin" || also.some((x) => x.startsWith("Check-in"));
      const unreadShown = row.kind === "message" || also.some((x) => x.includes("unread"));
      const r0 = row;
      const more = reasons.filter((x) => !r0.reason.includes(x) && !(checkinShown && x.startsWith("Check-in")) && !(unreadShown && x.includes("unread")));
      rows.push({ ...base, ...row, key: `${row.kind}:${id}`, also, more, order: row.order ?? base.order });
    }
    if (winsOf(m, unit).length > 0) {
      rows.push({ ...base, key: `win:${id}`, kind: "win", reason: newestWinLabel(m, unit) ?? "A milestone this week", also: [], more: winsOf(m, unit).slice(1).map((w) => w.label), order: newestWin(m) });
    }
  });
  // Messages from members who don't share their progress.
  for (const t of unread.values()) {
    if (members.some((m) => m.data.userId === t.memberId)) continue;
    const who = names.get(t.memberId) ?? { name: "A member", avatarUrl: null };
    rows.push({ key: `message:${t.memberId}`, kind: "message", id: t.memberId, name: who.name, avatarUrl: who.avatarUrl, summary: null, reason: `“${messagePreview(t.last)}”`, also: [], more: [], order: t.last.at });
  }
  rows.sort((a, b) => KIND[a.kind].rank - KIND[b.kind].rank || (a.kind === "win" ? b.order.localeCompare(a.order) : a.order.localeCompare(b.order)));

  // Rows you marked done or snoozed stay out until their day (replies clear themselves when sent).
  const hidden = (r: QueueRow) => (snoozes.get(r.key) ?? "") > today;
  const visible = rows.filter((r) => !hidden(r));
  const hiddenCount = rows.length - visible.length;
  const pool = showHidden ? rows : visible;
  const count = (f: QueueFilter) => (f === "all" ? visible.filter((r) => r.kind !== "win").length : visible.filter((r) => KIND[r.kind].filter === f).length);
  // "Needs you" is everything but wins; wins have their own chip.
  const list = pool.filter((r) => (show === "all" ? r.kind !== "win" : KIND[r.kind].filter === show));
  const shown = all ? list : list.slice(0, QUEUE_LIMIT);
  const chips: { id: QueueFilter; label: string }[] = [
    { id: "all", label: "Needs you" },
    { id: "checkins", label: "Check-ins" },
    { id: "messages", label: "Messages" },
    { id: "risk", label: "At risk" },
    { id: "quiet", label: "Quiet" },
    { id: "wins", label: "Wins" },
  ];

  return (
    <section aria-label="What needs you" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Show" className="no-scrollbar flex min-w-0 basis-full gap-1.5 overflow-x-auto sm:basis-0 sm:flex-1">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={show === c.id}
              onClick={() => {
                setShow(c.id);
                setAll(false);
              }}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                show === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted/40",
              )}
            >
              {c.label} <span className="tabular opacity-80">{count(c.id)}</span>
            </button>
          ))}
        </div>
        {routineCount > 0 ? (
          <button
            type="button"
            onClick={onRoutine}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-success/15 px-3 text-xs font-bold text-success hover:bg-success/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Zap className="h-3.5 w-3.5" aria-hidden />
            Clear {routineCount} routine check-in{routineCount === 1 ? "" : "s"}
          </button>
        ) : null}
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="h-8 shrink-0 rounded-full px-2 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            {showHidden ? "Hide done and snoozed" : `${hiddenCount} done or snoozed`}
          </button>
        ) : null}
      </div>

      {list.length === 0 ? (
        <p className="rounded-[1.25rem] border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {show === "wins"
            ? "No milestones this week. They show here when someone is 5 lb down, or an inch off the waist."
            : show === "quiet"
              ? `Nobody's gone ${QUIET_DAYS} days without hearing from you.`
              : show === "all" && routineCount > 0
                ? "Only routine check-ins left: clear them in one go with the button above."
                : hiddenCount > 0
                  ? "All done for now. Snoozed rows come back on their day."
                  : "Nothing here. Everyone is on track."}
        </p>
      ) : (
        <ol className="molten-card divide-y divide-border overflow-hidden rounded-[1.25rem] border border-primary/15 bg-card">
          {shown.map((r) => {
            const k = KIND[r.kind];
            const replyKind = r.kind === "checkin" || r.kind === "message";
            const openRow = () =>
              replyKind || !r.summary || r.kind === "quiet" ? onInbox(r.id) : onOpen(r.id, r.kind === "muscle" ? "training" : openTab(r.summary));
            const isHidden = hidden(r);
            const expanded = open.has(r.key);
            return (
              <li key={r.key} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 border-l-[3px] px-3 py-2.5", k.stripe, isHidden && "opacity-60")}>
                <button
                  type="button"
                  onClick={openRow}
                  className="flex min-w-0 flex-1 basis-64 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Avatar name={r.name} url={r.avatarUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-semibold">{r.name}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", k.chip)}>{k.label}</span>
                      {r.also.map((a) => (
                        <span key={a} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {a}
                        </span>
                      ))}
                    </span>
                    <span className={cn("block text-[12px] text-muted-foreground", !expanded && "truncate")}>{r.reason}</span>
                    {expanded ? (
                      <span className="mt-0.5 block space-y-0.5">
                        {r.more.map((x) => (
                          <span key={x} className="block text-[12px] text-muted-foreground">
                            · {x}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </button>
                {r.more.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setOpen((s) => {
                        const n = new Set(s);
                        if (n.has(r.key)) n.delete(r.key);
                        else n.add(r.key);
                        return n;
                      })
                    }
                    aria-expanded={expanded}
                    className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  >
                    {expanded ? "Less" : `+${r.more.length} more`}
                  </button>
                ) : null}
                <span className="ml-auto flex shrink-0 items-center gap-1.5">
                  {r.kind === "win" && r.summary ? <KudosButton m={r.summary} unit={unit} onKudos={onKudos} /> : null}
                  {!replyKind && r.kind !== "win" && r.summary ? remind(r.summary) : null}
                  {!replyKind && r.kind !== "win" ? (
                    <QueueButton onClick={() => onInbox(r.id)} primary={r.kind === "quiet"} label={`Message ${r.name}`}>
                      <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                      Message
                    </QueueButton>
                  ) : null}
                  {r.kind !== "quiet" ? (
                    <QueueButton onClick={openRow} primary={replyKind} label={replyKind ? `Reply to ${r.name}` : `Open ${r.name}`}>
                      {replyKind ? <MessageSquare className="h-3.5 w-3.5" aria-hidden /> : null}
                      {replyKind ? "Reply" : "Open"}
                    </QueueButton>
                  ) : null}
                  {/* Replies clear themselves when sent; everything else can be put away. */}
                  {!replyKind ? (
                    isHidden ? (
                      <QueueIcon label={`Show ${r.name} again`} onClick={() => onSnooze(r.id, r.kind, null)}>
                        <Undo2 className="h-3.5 w-3.5" />
                      </QueueIcon>
                    ) : (
                      <>
                        <QueueIcon label={`Done for today: ${r.name}`} onClick={() => onSnooze(r.id, r.kind, addDays(today, 1))}>
                          <Check className="h-3.5 w-3.5" />
                        </QueueIcon>
                        <QueueIcon label={`Snooze ${r.name} for 3 days`} onClick={() => onSnooze(r.id, r.kind, addDays(today, 3))}>
                          <Clock className="h-3.5 w-3.5" />
                        </QueueIcon>
                      </>
                    )
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {list.length > QUEUE_LIMIT ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="text-xs font-semibold text-primary underline-offset-2 hover:underline">
          {all ? `Show the top ${QUEUE_LIMIT}` : `Show all ${list.length}`}
        </button>
      ) : null}
    </section>
  );
}

function QueueIcon({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}

function QueueButton({ onClick, primary, label, children }: { onClick: () => void; primary?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        primary ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "border-border text-foreground/85 hover:bg-muted/40",
      )}
    >
      {children}
    </button>
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

/**
 * The coach's sections as a bar along the bottom of a phone: the first
 * `main` items, then More with the rest in a sheet above the bar.
 */
export function CoachBottomNav({ items, main = 3 }: { items: CoachNavItem[]; main?: number }) {
  const [more, setMore] = React.useState(false);
  const rest = items.slice(main);
  const bar: CoachNavItem[] = [
    ...items.slice(0, main),
    ...(rest.length
      ? [
          {
            id: "more",
            label: "More",
            icon: <MoreHorizontal />,
            count: rest.reduce((n, it) => n + (it.count ?? 0), 0),
            active: more || rest.some((it) => it.active),
            onSelect: () => setMore((v) => !v),
          },
        ]
      : []),
  ];
  return (
    <>
      {more ? (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMore(false)}>
          <ul
            aria-label="More sections"
            className="absolute inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] space-y-1 rounded-2xl border border-border bg-card p-2 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {rest.map((it) => (
              <li key={it.id}>
                <button
                  type="button"
                  onClick={() => {
                    setMore(false);
                    it.onSelect();
                  }}
                  aria-current={it.active ? "page" : undefined}
                  className={cn(
                    "flex h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:h-5 [&_svg]:w-5",
                    it.active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/40",
                  )}
                >
                  {it.icon}
                  <span className="flex-1 text-left">{it.label}</span>
                  {it.count ? <span className="tabular rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">{it.count}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    <nav
      aria-label="Coach sections"
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-background/95 px-1 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden"
      style={{ gridTemplateColumns: `repeat(${bar.length}, minmax(0, 1fr))` }}
    >
      {bar.map((it) => (
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
    </>
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
