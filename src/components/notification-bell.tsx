"use client";

import * as React from "react";
import { Bell, ClipboardList, Dumbbell, ImageIcon, Megaphone, MessageSquare, PartyPopper, Sparkles, Utensils, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatShort } from "@/lib/dates";
import { BELL_POLL_MS, type NotificationItem, type NotificationKind, type NotificationTarget, type NotificationsResponse } from "@/lib/messages";
import { cn } from "@/lib/utils";

/**
 * The member's notifications and unread chat count: loaded when the app opens,
 * every couple of minutes while it's visible, and on `refresh`.
 */
export function useNotifications(experienceId: string | null, enabled: boolean) {
  const [data, setData] = React.useState<NotificationsResponse | null>(null);
  const refresh = React.useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(`/api/notifications${experienceId ? `?experience=${encodeURIComponent(experienceId)}` : ""}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (res.ok) setData((await res.json()) as NotificationsResponse);
    } catch {
      /* keeps what it had */
    }
  }, [experienceId, enabled]);
  React.useEffect(() => {
    if (!enabled) return;
    void refresh();
    const tick = () => document.visibilityState === "visible" && void refresh();
    const t = window.setInterval(tick, BELL_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh, enabled]);
  return { data, setData, refresh };
}

const ICONS: Record<NotificationKind, React.ReactNode> = {
  announcement: <Megaphone />,
  update: <Sparkles />,
  "checkin-reply": <MessageSquare />,
  program: <Dumbbell />,
  habits: <ClipboardList />,
  "program-edit": <Dumbbell />,
  macros: <Utensils />,
  milestone: <PartyPopper />,
  nudge: <Bell />,
  "comparison-comment": <ImageIcon />,
};

const LABELS: Record<NotificationKind, string> = {
  announcement: "Announcement",
  update: "App update",
  "checkin-reply": "Check-in",
  program: "Program",
  habits: "Habits",
  "program-edit": "Program",
  macros: "Food",
  milestone: "Milestone",
  nudge: "Coach",
  "comparison-comment": "Photos",
};

const ago = (iso: string) => {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : d < 7 ? `${d} days ago` : formatShort(iso.slice(0, 10));
};

/**
 * The bell at the top of the member's app: announcements from their coach,
 * replies and things their coach sent, milestones and app updates, with a
 * count of what's new since they last looked.
 */
export function NotificationBell({
  data,
  onOpened,
  onGo,
}: {
  data: NotificationsResponse | null;
  /** Opening it marks everything seen. */
  onOpened: () => void;
  onGo: (target: Exclude<NotificationTarget, null>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | "coach" | "updates">("all");
  // What was new when it opened stays marked while it's open.
  const [newSince, setNewSince] = React.useState<Set<string>>(new Set());
  const dialog = React.useRef<HTMLDialogElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();
  const unread = data?.unread ?? 0;

  React.useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const show = () => {
    // The newest `unread` items are the new ones (the list is newest first).
    setNewSince(new Set((data?.items ?? []).slice(0, unread).map((i) => i.id)));
    setOpen(true);
    if (unread > 0) onOpened();
  };

  const items = (data?.items ?? []).filter((i) =>
    filter === "all" ? true : filter === "updates" ? i.kind === "update" : i.kind !== "update" && i.kind !== "milestone",
  );

  return (
    <>
      <Button
        ref={button}
        variant="ghost"
        size="icon"
        aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={show}
        className="relative shrink-0"
      >
        <Bell />
        {unread > 0 ? (
          <span
            className="tabular absolute -right-0.5 -top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-background"
            aria-hidden
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false);
          button.current?.focus();
        }}
        onClick={(e) => {
          if (e.target === dialog.current) setOpen(false);
        }}
        className="fixed inset-x-3 top-3 m-0 max-h-[calc(100dvh-1.5rem)] w-auto max-w-none overflow-y-auto overscroll-contain molten-card rounded-[1.25rem] border border-primary/15 bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/40 sm:left-auto sm:right-6 sm:top-4 sm:w-[24rem]"
      >
        <div className="sticky top-0 z-10 space-y-3 border-b border-border bg-card px-4 pb-3 pt-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" aria-hidden />
            <h2 id={titleId} className="min-w-0 flex-1 text-sm font-semibold">
              Notifications
            </h2>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close notifications">
              <X />
            </Button>
          </div>
          <div role="group" aria-label="Show" className="flex gap-1">
            {(
              [
                ["all", "All"],
                ["coach", "From your coach"],
                ["updates", "App updates"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={filter === v}
                onClick={() => setFilter(v)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filter === v ? "border-primary/40 bg-primary/[0.14] text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {data === null ? (
          <div className="m-4 h-24 animate-pulse rounded-xl bg-muted/30" aria-busy="true" />
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {filter === "updates" ? "No app updates lately." : "Nothing yet. Announcements and anything your coach sends you show up here."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <Row
                key={i.id}
                item={i}
                isNew={newSince.has(i.id)}
                onGo={(t) => {
                  setOpen(false);
                  onGo(t);
                }}
              />
            ))}
          </ul>
        )}
      </dialog>
    </>
  );
}

function Row({ item, isNew, onGo }: { item: NotificationItem; isNew: boolean; onGo: (t: Exclude<NotificationTarget, null>) => void }) {
  const body = (
    <>
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full [&_svg]:h-4 [&_svg]:w-4",
          item.kind === "announcement" ? "bg-primary/15 text-primary" : item.kind === "milestone" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
        )}
        aria-hidden
      >
        {ICONS[item.kind]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-semibold uppercase tracking-wide">{LABELS[item.kind]}</span>
          <span>{ago(item.at)}</span>
          {isNew ? <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-destructive" aria-label="New" /> : null}
        </span>
        <span className="block text-sm font-bold leading-snug">{item.title}</span>
        {item.body ? <span className="mt-0.5 block whitespace-pre-wrap break-words text-[13px] leading-snug text-muted-foreground">{item.body}</span> : null}
      </span>
    </>
  );
  const target = item.target;
  return (
    <li>
      {target ? (
        <button
          type="button"
          onClick={() => onGo(target)}
          className="flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {body}
        </button>
      ) : (
        <div className="flex gap-3 px-4 py-3">{body}</div>
      )}
    </li>
  );
}
