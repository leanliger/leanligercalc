"use client";

import * as React from "react";
import { CirclePause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { addDays, daysBetween, formatShort } from "@/lib/dates";
import {
  MAX_BACKDATE_DAYS,
  MAX_PAUSE_DAYS,
  MAX_SCHEDULE_AHEAD_DAYS,
  PAUSE_REASON_LABELS,
  activePause,
  addPause,
  changePauseEnd,
  endPause,
  upcomingPause,
  type PausePeriod,
  type PauseReason,
} from "@/lib/pause";
import { cn } from "@/lib/utils";

export interface PauseSettingsProps {
  pauses: PausePeriod[];
  today: string;
  onChange: (pauses: PausePeriod[]) => void;
}

const REASON_OPTIONS = (["sick", "travel", "other"] as const).map((value) => ({ value, label: PAUSE_REASON_LABELS[value] }));

/** "until Oct 15 · 3 days left" */
function untilText(p: PausePeriod, today: string): string {
  const left = daysBetween(today, p.to) + 1;
  return `Until ${formatShort(p.to)} · ${left === 1 ? "last day" : `${left} days left`}`;
}

/** Pause mode, as a section of the Settings panel. */
export function PauseSettings({ pauses, today, onChange }: PauseSettingsProps) {
  const current = activePause(pauses, today);
  const planned = current ? null : upcomingPause(pauses, today);
  const shown = current ?? planned;
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <CirclePause className={cn("h-3.5 w-3.5", current && "text-primary")} aria-hidden />
        Pause mode
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Sick or travelling? Pause for up to {MAX_PAUSE_DAYS} days. Your streaks freeze, paused days don&apos;t count for
        or against your score, and reminders stop. Anything you log still saves.
      </p>

      {shown ? (
        <ShownPause
          pause={shown}
          active={Boolean(current)}
          today={today}
          error={error}
          onEnd={(to) => {
            const r = changePauseEnd(pauses, to, today);
            setError(r.ok ? null : r.error);
            if (r.ok) onChange(r.value);
          }}
          onStop={() => {
            setError(null);
            onChange(endPause(pauses, today));
          }}
        />
      ) : (
        <NewPause
          today={today}
          error={error}
          onCreate={(p) => {
            const r = addPause(pauses, p, today);
            setError(r.ok ? null : r.error);
            if (r.ok) onChange(r.value);
          }}
        />
      )}
    </div>
  );
}

function ShownPause({
  pause,
  active,
  today,
  error,
  onEnd,
  onStop,
}: {
  pause: PausePeriod;
  active: boolean;
  today: string;
  error: string | null;
  onEnd: (to: string) => void;
  onStop: () => void;
}) {
  const endId = React.useId();
  const latest = addDays(pause.from, MAX_PAUSE_DAYS - 1);
  return (
    <div className={cn("space-y-2.5 rounded-md border px-3 py-2.5", active ? "border-primary/50 bg-primary/10" : "border-border")}>
      <div>
        <p className="text-sm font-medium">
          {active ? "Paused" : "Pause planned"} · {PAUSE_REASON_LABELS[pause.reason]}
        </p>
        <p className="tabular text-xs text-muted-foreground">
          {active ? untilText(pause, today) : `${formatShort(pause.from)} – ${formatShort(pause.to)}`}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={endId} className="text-xs text-muted-foreground">
          Ends
        </label>
        <Input
          id={endId}
          type="date"
          value={pause.to}
          min={pause.from > today ? pause.from : today}
          max={latest}
          onChange={(e) => e.target.value && onEnd(e.target.value)}
          className="h-8 w-[9.5rem]"
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <Button variant="outline" size="sm" className="w-full" onClick={onStop}>
        <Play />
        {active ? "Resume now" : "Cancel planned pause"}
      </Button>
    </div>
  );
}

function NewPause({ today, error, onCreate }: { today: string; error: string | null; onCreate: (p: PausePeriod) => void }) {
  const [reason, setReason] = React.useState<PauseReason>("sick");
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(addDays(today, 2));
  const fromId = React.useId();
  const toId = React.useId();
  const later = from > today;

  return (
    <div className="space-y-2.5 rounded-md border border-border px-3 py-2.5">
      <SegmentedControl ariaLabel="Why you're pausing" size="sm" value={reason} onValueChange={setReason} options={REASON_OPTIONS} />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor={fromId} className="text-xs text-muted-foreground">
            From
          </label>
          <Input
            id={fromId}
            type="date"
            value={from}
            min={addDays(today, -MAX_BACKDATE_DAYS)}
            max={addDays(today, MAX_SCHEDULE_AHEAD_DAYS)}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              setFrom(v);
              // Keep the end inside the allowed length.
              if (to < v || daysBetween(v, to) >= MAX_PAUSE_DAYS) setTo(addDays(v, 2));
            }}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={toId} className="text-xs text-muted-foreground">
            To (last day)
          </label>
          <Input
            id={toId}
            type="date"
            value={to}
            min={from}
            max={addDays(from, MAX_PAUSE_DAYS - 1)}
            onChange={(e) => e.target.value && setTo(e.target.value)}
            className="h-8"
          />
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <Button size="sm" className="w-full" onClick={() => onCreate({ from, to, reason })}>
        <CirclePause />
        {later ? `Plan pause from ${formatShort(from)}` : "Pause now"}
      </Button>
    </div>
  );
}
