"use client";

import * as React from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import type { NotificationStatus } from "@/components/fasting-card";
import { minutesOf, timeOf } from "@/lib/fasting";
import {
  DOWNTIME_LEADS,
  REMINDER_TYPES,
  downtimeMinute,
  type DowntimeLead,
  type ReminderPref,
  type ReminderPrefs,
  type ReminderType,
} from "@/lib/reminders";
import { cn } from "@/lib/utils";

const COPY: Record<ReminderType, { title: string; detail: string; when: string }> = {
  weighIn: {
    title: "Morning weigh-in",
    detail: "Skipped if you've already logged today's weight.",
    when: "Every day at",
  },
  habits: {
    title: "Evening habits",
    detail: "How many habits are left and your current streak. Skipped once they're all done.",
    when: "Every day at",
  },
  downtime: {
    title: "Bedtime downtime",
    detail: "A nudge to put the phone down and start winding down before bed, so you get your 7+ hours.",
    when: "Bedtime",
  },
  recap: {
    title: "Sunday weekly recap",
    detail: "Your scorecard, weight change and average protein for the week.",
    when: "Sundays at",
  },
};

const UNAVAILABLE: Record<Exclude<NotificationStatus["availability"], "ok">, string> = {
  local: "Available when you open this app from inside Whop.",
  "no-key": "Coming soon — notifications aren't switched on for this app yet.",
  "no-experience": "Open the app from your Whop community to turn these on.",
};

/** "07:00" → "7:00 AM" in the member's own clock format. */
function clockOf(time: string): string {
  const m = minutesOf(time);
  const d = new Date();
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export interface RemindersSettingsProps {
  prefs: ReminderPrefs;
  onChange: (prefs: ReminderPrefs) => void;
  status: NotificationStatus;
}

/** The weigh-in / habits / recap reminders, as a section of the Settings panel. */
export function RemindersSettings({ prefs, onChange, status }: RemindersSettingsProps) {
  const available = status.availability === "ok";
  const anyOn = available && REMINDER_TYPES.some((t) => prefs[t].on);

  const set = (type: ReminderType, patch: Partial<ReminderPref>) =>
    onChange({ ...prefs, [type]: { ...prefs[type], ...patch } });
  const setLead = (leadMin: DowntimeLead) => onChange({ ...prefs, downtime: { ...prefs.downtime, leadMin } });

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {anyOn ? <BellRing className="h-3.5 w-3.5 text-primary" aria-hidden /> : <Bell className="h-3.5 w-3.5" aria-hidden />}
        Reminders
      </p>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {available
          ? "Whop notifications at the times you choose. Fasting reminders are on Food → Fasting."
          : UNAVAILABLE[status.availability as Exclude<NotificationStatus["availability"], "ok">]}
      </p>
      {REMINDER_TYPES.map((type) => (
        <ReminderRow
          key={type}
          type={type}
          on={available && prefs[type].on}
          time={prefs[type].time}
          disabled={!available}
          onToggle={(on) => set(type, { on })}
          onTime={(time) => set(type, { time })}
        >
          {type === "downtime" ? (
            <DowntimeLeadPicker bedtime={prefs.downtime.time} lead={prefs.downtime.leadMin} onChange={setLead} />
          ) : null}
        </ReminderRow>
      ))}
      {available && status.error ? (
        <p role="alert" className="text-xs text-destructive">
          {status.error}
        </p>
      ) : null}
    </div>
  );
}

function ReminderRow({
  type,
  on,
  time,
  disabled,
  onToggle,
  onTime,
  children,
}: {
  type: ReminderType;
  on: boolean;
  time: string;
  disabled: boolean;
  onToggle: (on: boolean) => void;
  onTime: (time: string) => void;
  /** Extra settings shown while it's on. */
  children?: React.ReactNode;
}) {
  const id = React.useId();
  const timeId = React.useId();
  const copy = COPY[type];
  return (
    <div className={cn("space-y-2 rounded-md border px-3 py-2.5", on ? "border-primary/40 bg-primary/5" : "border-border")}>
      <div className="flex items-center gap-2.5">
        {on ? <Bell className="h-4 w-4 shrink-0 text-primary" /> : <BellOff className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <label htmlFor={id} className="min-w-0 flex-1 text-sm font-medium">
          {copy.title}
        </label>
        <Switch id={id} checked={on} disabled={disabled} onCheckedChange={onToggle} />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{copy.detail}</p>
      {on ? (
        <div className="flex items-center gap-2">
          <label htmlFor={timeId} className="text-xs text-muted-foreground">
            {copy.when}
          </label>
          <Input
            id={timeId}
            type="time"
            value={time}
            required
            onChange={(e) => e.target.value && onTime(e.target.value)}
            className="h-8 w-[7.5rem]"
          />
          <span className="sr-only">Currently {clockOf(time)}</span>
        </div>
      ) : null}
      {on ? children : null}
    </div>
  );
}

/** How long before bedtime, and when that means the reminder arrives. */
function DowntimeLeadPicker({
  bedtime,
  lead,
  onChange,
}: {
  bedtime: string;
  lead: DowntimeLead;
  onChange: (lead: DowntimeLead) => void;
}) {
  const options = DOWNTIME_LEADS.map((m) => ({ value: String(m) as `${DowntimeLead}`, label: `${m} min` }));
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">Remind me before bed</p>
      <SegmentedControl
        ariaLabel="How long before bedtime"
        size="sm"
        value={String(lead) as `${DowntimeLead}`}
        onValueChange={(v) => onChange(Number(v) as DowntimeLead)}
        options={options}
      />
      <p className="text-xs text-muted-foreground">
        Arrives at <span className="font-medium text-foreground">{clockOf(timeOf(downtimeMinute(minutesOf(bedtime), lead)))}</span>{" "}
        every night.
      </p>
    </div>
  );
}
