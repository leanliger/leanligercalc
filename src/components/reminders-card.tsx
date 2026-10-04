"use client";

import * as React from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { NotificationStatus } from "@/components/fasting-card";
import { minutesOf } from "@/lib/fasting";
import { REMINDER_TYPES, type ReminderPrefs, type ReminderType } from "@/lib/reminders";
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

interface RemindersCardProps {
  prefs: ReminderPrefs;
  onChange: (prefs: ReminderPrefs) => void;
  status: NotificationStatus;
}

export function RemindersCard({ prefs, onChange, status }: RemindersCardProps) {
  const available = status.availability === "ok";
  const anyOn = available && REMINDER_TYPES.some((t) => prefs[t].on);

  const set = (type: ReminderType, patch: Partial<ReminderPrefs[ReminderType]>) =>
    onChange({ ...prefs, [type]: { ...prefs[type], ...patch } });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          {anyOn ? <BellRing className="h-4 w-4 text-primary" /> : <Bell className="h-4 w-4 text-primary" />}
          Reminders
        </CardTitle>
        <CardDescription>
          {available
            ? "Whop notifications at the times you choose. Fasting reminders are on the Macros tab."
            : UNAVAILABLE[status.availability as Exclude<NotificationStatus["availability"], "ok">]}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {REMINDER_TYPES.map((type) => (
          <ReminderRow
            key={type}
            type={type}
            on={available && prefs[type].on}
            time={prefs[type].time}
            disabled={!available}
            onToggle={(on) => set(type, { on })}
            onTime={(time) => set(type, { time })}
          />
        ))}
        {available && status.error ? (
          <p role="alert" className="text-xs text-destructive">
            {status.error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReminderRow({
  type,
  on,
  time,
  disabled,
  onToggle,
  onTime,
}: {
  type: ReminderType;
  on: boolean;
  time: string;
  disabled: boolean;
  onToggle: (on: boolean) => void;
  onTime: (time: string) => void;
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
    </div>
  );
}
