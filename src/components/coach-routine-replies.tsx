"use client";

import * as React from "react";
import { ArrowLeft, ChevronDown, Loader2, Send, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/coach-today";
import { FOCUS_DEFAULT, composeReportReply } from "@/lib/checkin-report";
import type { ReportBundle } from "@/lib/checkin-report-input";
import type { Checkin } from "@/lib/checkins";
import type { MemberSummary } from "@/lib/coach";
import { formatShort } from "@/lib/dates";
import { cn } from "@/lib/utils";

export interface RoutineItem {
  summary: MemberSummary;
  checkin: Checkin;
  bundle: ReportBundle;
}

const firstName = (m: MemberSummary) => m.displayName.split(" ")[0] || m.displayName;

/** The reply and focus a routine week gets: the report's top items, no calorie change, no question to answer. */
function routineReply(item: RoutineItem) {
  const focus = item.bundle.report.focus.slice(0, FOCUS_DEFAULT);
  return {
    text: composeReportReply(item.bundle.report, {
      firstName: firstName(item.summary),
      focus: focus.map((f) => f.text),
      macro: null,
      answer: "",
      theirFocus: item.checkin.answers.focus ?? "",
    }),
    focus: focus.map((f) => f.text),
    kinds: focus.map((f) => f.id),
  };
}

/**
 * Inbox → "Send routine replies": every check-in marked 1-click ready (no
 * question, no safety flag, no calorie decision, no long note), each with the
 * reply and focus items it would get. Untick any to handle yourself, read
 * any reply, then send them all.
 */
export function RoutineReplies({
  companyId,
  items: incoming,
  onBack,
  onSent,
}: {
  companyId: string;
  items: RoutineItem[];
  onBack: () => void;
  /** Each reply that went out, as it goes. */
  onSent: (memberId: string) => void;
}) {
  // The list as it was when opened: replies that go out stay on it, marked Sent.
  const [items] = React.useState(incoming);
  const [included, setIncluded] = React.useState<Record<string, boolean>>(() => Object.fromEntries(items.map((i) => [i.summary.data.userId, true])));
  const [open, setOpen] = React.useState<string | null>(null);
  const [midweek, setMidweek] = React.useState(true);
  const [progress, setProgress] = React.useState<{ done: number; total: number; failed: string[] } | null>(null);
  const [sent, setSent] = React.useState<Set<string>>(new Set());
  const chosen = items.filter((i) => included[i.summary.data.userId] && !sent.has(i.summary.data.userId));
  const busy = progress !== null && progress.done < progress.total;

  const sendAll = async () => {
    const list = chosen;
    setProgress({ done: 0, total: list.length, failed: [] });
    for (const item of list) {
      const id = item.summary.data.userId;
      const r = routineReply(item);
      try {
        const res = await fetch("/api/coach/checkins/reply", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ company: companyId, member: id, weekStart: item.checkin.weekStart, reply: r.text, focus: r.focus, focusKinds: r.kinds, midweek }),
        });
        if (!res.ok) throw new Error("send failed");
        setSent((s) => new Set(s).add(id));
        onSent(id);
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      } catch {
        setProgress((p) => (p ? { ...p, done: p.done + 1, failed: [...p.failed, item.summary.displayName] } : p));
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onBack} disabled={busy}>
          <ArrowLeft />
          Inbox
        </Button>
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Zap className="h-5 w-5 text-primary" aria-hidden />
          Routine replies
        </h2>
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Check-ins with no question, no safety flag, no calorie change to decide and no long note. Each gets the one-click reply from its own
        numbers, with its top {FOCUS_DEFAULT} focus items. Untick anyone you&apos;d rather answer yourself, open any reply to read it, then send.
      </p>

      {items.length === 0 ? (
        <p className="rounded-[1.25rem] border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No routine weeks waiting. Everything left needs you.
        </p>
      ) : (
        <ul className="molten-card divide-y divide-border rounded-[1.25rem] border border-primary/15 bg-card">
          {items.map((item) => {
            const id = item.summary.data.userId;
            const r = routineReply(item);
            const isOpen = open === id;
            const done = sent.has(id);
            return (
              <li key={id} className={cn("p-3", done && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-3 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                    aria-label={`Include ${item.summary.displayName}`}
                    checked={!!included[id] && !done}
                    disabled={done || busy}
                    onChange={(e) => setIncluded((s) => ({ ...s, [id]: e.target.checked }))}
                  />
                  <Avatar name={item.summary.displayName} url={item.summary.data.avatarUrl} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold">{item.summary.displayName}</span>
                      <span className="text-[12px] text-muted-foreground">week of {formatShort(item.checkin.weekStart)}</span>
                      {done ? <span className="text-[12px] font-semibold text-success">Sent</span> : null}
                    </p>
                    {item.bundle.report.wins.length > 0 ? (
                      <p className="text-[12px]">
                        <span className="font-semibold text-success">Wins: </span>
                        {item.bundle.report.wins.join(" · ")}
                      </p>
                    ) : null}
                    {r.focus.length > 0 ? (
                      <ol className="list-decimal space-y-0.5 pl-5 text-[12px] text-muted-foreground">
                        {r.focus.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-[12px] text-muted-foreground">On target everywhere: the reply says keep going.</p>
                    )}
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpen(isOpen ? null : id)}
                      className="flex items-center gap-1 text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !isOpen && "-rotate-90")} aria-hidden />
                      {isOpen ? "Hide the reply" : "Read the reply"}
                    </button>
                    {isOpen ? <p className="whitespace-pre-wrap rounded-xl border border-border bg-background/40 p-2.5 text-sm">{r.text}</p> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 0 ? (
        <div className="sticky bottom-3 z-30 flex flex-wrap items-center gap-3 rounded-[1.25rem] border border-primary/40 bg-card/95 p-3 shadow-[0_14px_34px_-8px_rgb(0_0_0/0.55)] backdrop-blur max-lg:bottom-24">
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={midweek} onChange={(e) => setMidweek(e.target.checked)} disabled={busy} />
            Mid-week check on their focus items
          </label>
          <Button className="ml-auto" onClick={() => void sendAll()} disabled={busy || chosen.length === 0}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
            {busy ? `Sending ${progress!.done + 1} of ${progress!.total}…` : `Send ${chosen.length} repl${chosen.length === 1 ? "y" : "ies"}`}
          </Button>
          {progress && !busy ? (
            <p role="status" className={cn("w-full text-[12px]", progress.failed.length ? "text-destructive" : "text-success")}>
              {progress.failed.length
                ? `Sent ${progress.total - progress.failed.length} of ${progress.total}. Couldn't send to ${progress.failed.join(", ")}; try again.`
                : `Sent ${progress.total} repl${progress.total === 1 ? "y" : "ies"}.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
