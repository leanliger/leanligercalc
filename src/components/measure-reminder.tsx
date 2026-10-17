"use client";

import * as React from "react";
import { BellRing } from "lucide-react";
import { Switch } from "@/components/ui/switch";

/**
 * Progress → Check-in → Measurements: the "Time to measure" switch (worker/measure-day.ts).
 * A Whop notification 4 weeks after the last measurement, around 9am. On by
 * default; saved on the server.
 */
export function MeasureReminder() {
  const [on, setOn] = React.useState<boolean | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();

  React.useEffect(() => {
    let live = true;
    fetch("/api/measurement-settings", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { reminder?: boolean } | null) => live && setOn(b?.reminder !== false))
      .catch(() => live && setOn(true));
    return () => {
      live = false;
    };
  }, []);

  const change = async (next: boolean) => {
    const before = on;
    setOn(next);
    setError(null);
    try {
      const res = await fetch("/api/measurement-settings", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ reminder: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setOn(before);
      setError("Couldn't save that. Try again.");
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-sm font-medium">
          Monthly measurement reminder
        </label>
        <p className="text-xs text-muted-foreground">A notification 4 weeks after your last measurements, around 9am.</p>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Switch id={id} checked={on === true} disabled={on === null} onCheckedChange={(v) => void change(v)} />
    </div>
  );
}
