"use client";

import * as React from "react";
import { BellRing, Check, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REMINDERS, REMINDER_COOLDOWN_HOURS, reminderText, sentAgoShort, type ReminderKind } from "@/lib/coach-reminders";
import { cn } from "@/lib/utils";

export interface SentReminder {
  memberId: string;
  kind: string;
  sentAt: string;
}

/** Reminders sent in the last week, for every menu on the page; update with what a send returns. */
export function useCoachReminders(companyId: string) {
  const [reminders, setReminders] = React.useState<SentReminder[]>([]);
  React.useEffect(() => {
    let live = true;
    fetch(`/api/coach/reminders?company=${encodeURIComponent(companyId)}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<{ reminders: SentReminder[] }>) : null))
      .then((b) => {
        if (live && b) setReminders(b.reminders);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [companyId]);
  return { reminders, setReminders };
}

const withoutGreeting = (s: string) => s.replace(/^Hey, /, "").replace(/^./, (c) => c.toUpperCase());

/**
 * The reminders menu: beside a member in the list (icon), on their page or in
 * bulk actions (button). Suggested ones, from the member's flags, come first;
 * one sent in the last 12 hours shows when, and can't go again yet.
 */
export function RemindMenu({
  companyId,
  members,
  suggested = [],
  recent,
  onSent,
  variant = "icon",
  label,
}: {
  companyId: string;
  /** Who it goes to; one member gets it by first name. */
  members: { id: string; name: string }[];
  suggested?: ReminderKind[];
  recent: SentReminder[];
  onSent: (reminders: SentReminder[]) => void;
  variant?: "icon" | "button";
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number; up: boolean } | null>(null);
  const [busy, setBusy] = React.useState<ReminderKind | null>(null);
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const menu = React.useRef<HTMLDivElement>(null);
  const menuId = React.useId();
  const single = members.length === 1 ? members[0]! : null;
  const first = single ? single.name.split(" ")[0] || single.name : "";
  const now = Date.now();

  // Fixed to the page, so the member list's rounded card doesn't clip it.
  const place = React.useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const up = r.bottom + 420 > window.innerHeight && r.top > 420;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left, up });
  }, []);
  React.useEffect(() => {
    if (!open) return;
    place();
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    const move = (e: Event) => {
      // Scrolling inside the menu itself keeps it open.
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    const resize = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", move, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", move, true);
    };
  }, [open, place]);

  const lastSent = (kind: ReminderKind) =>
    single ? (recent.filter((r) => r.memberId === single.id && r.kind === kind).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0] ?? null) : null;
  const hoursLeft = (kind: ReminderKind) => {
    const l = lastSent(kind);
    if (!l) return 0;
    const left = REMINDER_COOLDOWN_HOURS - (now - Date.parse(l.sentAt)) / 3_600_000;
    return left > 0 ? Math.ceil(left) : 0;
  };

  const send = async (kind: ReminderKind) => {
    setBusy(kind);
    setResult(null);
    try {
      const res = await fetch("/api/coach/reminders", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ company: companyId, members: members.map((m) => m.id), kind }),
      });
      const b = (await res.json().catch(() => null)) as {
        sent?: number;
        notified?: number;
        skipped?: { memberId: string; reason: string }[];
        reminders?: SentReminder[];
        error?: string;
      } | null;
      if (!res.ok || !b) throw new Error(b?.error ?? "Couldn't send it. Try again.");
      if (b.reminders) onSent(b.reminders);
      const skipped = b.skipped ?? [];
      const sent = b.sent ?? 0;
      if (single) {
        setResult(
          sent
            ? { ok: true, text: b.notified ? `Sent. ${first} got it on Whop.` : `In ${first}'s bell; Whop didn't take the notification.` }
            : { ok: false, text: `Not sent: ${skipped[0]?.reason ?? "try again later"}.` },
        );
      } else {
        setResult({
          ok: sent > 0,
          text: `Sent to ${sent} member${sent === 1 ? "" : "s"}${skipped.length ? `; ${skipped.length} skipped (reminded lately, or at today's limit)` : ""}.`,
        });
      }
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "Couldn't send it. Try again." });
    } finally {
      setBusy(null);
    }
  };

  const ordered = [...REMINDERS].sort((a, b) => Number(suggested.includes(b.kind)) - Number(suggested.includes(a.kind)));
  const who = single ? first : `${members.length} members`;
  const toggle = () => {
    setResult(null);
    setOpen((o) => !o);
  };

  return (
    <>
      {variant === "icon" ? (
        <button
          ref={button}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={`Send ${who} a reminder${suggested.length ? `, ${suggested.length} suggested` : ""}`}
          title="Send a reminder"
          onClick={toggle}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            open ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          <BellRing className="h-4 w-4" />
          {suggested.length > 0 ? (
            <span
              className="tabular absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
              aria-hidden
            >
              {suggested.length}
            </span>
          ) : null}
        </button>
      ) : (
        <Button ref={button} size="sm" variant="outline" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={toggle}>
          <BellRing />
          {label ?? "Remind"}
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      )}
      {open && pos ? (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={`Reminders for ${who}`}
          style={{ top: pos.top, left: pos.left, transform: pos.up ? "translateY(-100%)" : undefined }}
          className="fixed z-50 max-h-[min(26rem,calc(100vh-1rem))] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-2xl border border-primary/20 bg-card p-1.5 text-card-foreground shadow-2xl"
        >
          <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Remind {who} now · Whop notification</p>
          {ordered.map((r) => {
            const isSuggested = suggested.includes(r.kind);
            const last = lastSent(r.kind);
            const wait = hoursLeft(r.kind);
            const preview = withoutGreeting(reminderText(r.kind, first).content);
            return (
              <button
                key={r.kind}
                type="button"
                role="menuitem"
                disabled={wait > 0 || busy !== null}
                onClick={() => void send(r.kind)}
                title={preview}
                className="flex w-full items-start gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                  {busy === r.kind ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : wait > 0 ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <BellRing className="h-3.5 w-3.5 text-primary" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {r.label}
                    {isSuggested ? <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-bold text-primary">Suggested</span> : null}
                  </span>
                  <span className="line-clamp-1 text-[11px] text-muted-foreground">
                    {last ? `Sent ${sentAgoShort(last.sentAt, now)}${wait > 0 ? ` · again in ${wait} h` : ""}` : preview}
                  </span>
                </span>
              </button>
            );
          })}
          {result ? (
            <p role="status" className={cn("px-2 pb-1 pt-1.5 text-[12px]", result.ok ? "text-success" : "text-destructive")}>
              {result.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
