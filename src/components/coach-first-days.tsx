"use client";

import * as React from "react";
import { Check, Circle, Copy, Eye, HelpCircle, MessageCircle, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/coach-today";
import type { CoachMemberData } from "@/lib/coach-api";
import { formatShort } from "@/lib/dates";
import { FIRST_DAYS, FIRST_STEPS, firstDays, type FirstDaysRow, type StepState } from "@/lib/first-days";
import { cn } from "@/lib/utils";

/**
 * Coach dashboard → First 14 days (src/lib/first-days.ts): every new member
 * against the steps that predict whether they stick, stuck ones first, with
 * what to nudge them about.
 */

const STATUS = {
  stuck: { label: "Stuck", chip: "bg-destructive/15 text-destructive" },
  "on-track": { label: "On track", chip: "bg-primary/15 text-primary" },
  done: { label: "All done", chip: "bg-success/15 text-success" },
} as const;

const STEP_STYLE: Record<StepState, { icon: React.ReactNode; cls: string; word: string }> = {
  done: { icon: <Check className="h-3 w-3" />, cls: "border-success bg-success text-success-foreground", word: "done" },
  overdue: { icon: <span className="text-[10px] font-bold leading-none">!</span>, cls: "border-destructive bg-destructive/15 text-destructive", word: "overdue" },
  upcoming: { icon: <Circle className="h-2 w-2" />, cls: "border-border text-muted-foreground", word: "not due yet" },
  unknown: { icon: <HelpCircle className="h-3 w-3" />, cls: "border-dashed border-border text-muted-foreground", word: "can't see until they share" },
};

export function CoachFirstDays({
  members,
  today,
  hasPlan,
  names,
  onMessage,
  onOpen,
}: {
  members: readonly CoachMemberData[];
  today: string;
  hasPlan: (id: string) => boolean;
  names: ReadonlyMap<string, { name: string; avatarUrl: string | null }>;
  onMessage: (memberId: string) => void;
  onOpen: (memberId: string) => void;
}) {
  const rows = React.useMemo(() => firstDays(members, today, hasPlan), [members, today, hasPlan]);
  const stuck = rows.filter((r) => r.status === "stuck").length;
  const done = rows.filter((r) => r.status === "done").length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">First {FIRST_DAYS} days</h2>
        <p className="text-sm text-muted-foreground">
          Everyone who joined in the last {FIRST_DAYS} days, against the steps that predict whether they stick. A step past its day turns them
          stuck, well before they&apos;d show as likely to quit.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        <Tally value={rows.length} label="new members" />
        <Tally value={stuck} label="stuck" tone={stuck ? "text-destructive" : undefined} />
        <Tally value={done} label="all steps done" tone={done ? "text-success" : undefined} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sprout className="h-4 w-4 text-primary" />
            New members
          </CardTitle>
          <CardDescription>
            Due by:{" "}
            {FIRST_STEPS.map((s) => `${s.label.toLowerCase()} (day ${s.dueDay})`).join(" · ")}. Day 0 is the day they joined.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has joined in the last {FIRST_DAYS} days.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <Row key={r.id} row={r} who={names.get(r.id) ?? { name: "A member", avatarUrl: null }} onMessage={onMessage} onOpen={onOpen} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  row: r,
  who,
  onMessage,
  onOpen,
}: {
  row: FirstDaysRow;
  who: { name: string; avatarUrl: string | null };
  onMessage: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const s = STATUS[r.status];
  const sharing = r.steps.find((x) => x.id === "sharing")?.state === "done";
  const copy = async () => {
    if (!r.next) return;
    try {
      await navigator.clipboard.writeText(r.next.nudge);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard refused: the text is on screen */
    }
  };
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={who.name} url={who.avatarUrl} size="h-8 w-8" />
        <div className="min-w-0 flex-1 basis-48">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {who.name}
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", s.chip)}>{s.label}</span>
          </p>
          <p className="tabular text-[12px] text-muted-foreground">
            Day {r.day} · joined {formatShort(r.joinedOn)} · {r.done} of {FIRST_STEPS.length} steps
            {r.daysSinceOpened !== null ? ` · opened ${r.daysSinceOpened === 0 ? "today" : `${r.daysSinceOpened}d ago`}` : ""}
          </p>
        </div>
        {sharing ? (
          <Button size="sm" variant="ghost" onClick={() => onOpen(r.id)}>
            <Eye />
            Open
          </Button>
        ) : null}
        <Button size="sm" variant={r.status === "stuck" ? "default" : "outline"} onClick={() => onMessage(r.id)}>
          <MessageCircle />
          Message
        </Button>
      </div>

      <ol className="flex flex-wrap gap-x-3 gap-y-1.5 pl-11" aria-label={`${who.name}'s first steps`}>
        {FIRST_STEPS.map((step) => {
          const state = r.steps.find((x) => x.id === step.id)!.state;
          const st = STEP_STYLE[state];
          return (
            <li key={step.id} className="flex items-center gap-1.5 text-[12px]" title={`${step.label}: ${st.word} (due day ${step.dueDay})`}>
              <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full border", st.cls)} aria-hidden>
                {st.icon}
              </span>
              <span className={cn(state === "done" ? "text-foreground" : state === "overdue" ? "font-medium text-destructive" : "text-muted-foreground")}>
                {step.label}
                <span className="sr-only">: {st.word}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {r.next ? (
        <p className="ml-11 flex flex-wrap items-center gap-2 rounded-md bg-destructive/5 px-2.5 py-1.5 text-[12px]">
          <span className="font-semibold text-destructive">{r.next.yours ? "Your move:" : "Nudge:"}</span>
          <span className="min-w-0 flex-1">{r.next.nudge}</span>
          {!r.next.yours ? (
            <button type="button" onClick={() => void copy()} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <Copy className="h-3 w-3" />
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
        </p>
      ) : null}
    </li>
  );
}

function Tally({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className={cn("tabular text-xl font-semibold", tone)}>{value}</p>
      <p className="text-[12px] text-muted-foreground">{label}</p>
    </div>
  );
}
