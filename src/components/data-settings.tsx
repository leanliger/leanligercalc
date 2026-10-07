"use client";

import * as React from "react";
import { AlertTriangle, Cloud, HardDrive, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionInfo } from "@/lib/checkin-store";
import { cn } from "@/lib/utils";

const LOCAL_REASONS: Record<string, string> = {
  "not-configured": "Account sync isn't switched on for this app yet.",
  "not-signed-in": "Open this app from inside Whop to sync your data to your account.",
  "no-server": "This version of the app has no sync server.",
  offline: "Couldn't reach the sync server.",
};

export interface DataSettingsProps {
  session: SessionInfo;
  /** How many entries are stored, for the delete button. */
  count: number;
  onDeleteAll: () => Promise<void>;
}

/**
 * Where the member's data lives (synced to Whop, or this device only), what
 * their coach can see, and "Delete all my data" behind an "Are you sure?" step.
 */
export function DataSettings({ session, count, onDeleteAll }: DataSettingsProps) {
  const cloud = session.mode === "cloud";
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const ids = React.useId();

  // The safe choice gets focus when the question appears.
  React.useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  const remove = async () => {
    setBusy(true);
    setResult(null);
    try {
      await onDeleteAll();
      setResult({ kind: "ok", text: "All your data has been deleted." });
      setConfirming(false);
    } catch (e) {
      setResult({ kind: "error", text: e instanceof Error ? e.message : "Couldn't delete. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Your data</p>

      <div className={cn("space-y-1 rounded-md border px-3 py-2.5", cloud ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5")}>
        <p className="flex items-center gap-2 text-sm font-medium">
          {cloud ? <Cloud className="h-4 w-4 shrink-0 text-success" aria-hidden /> : <HardDrive className="h-4 w-4 shrink-0 text-warning" aria-hidden />}
          {cloud ? "Synced to your Whop account" : "Saved on this device only"}
        </p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {cloud
            ? "Your weigh-ins, habits, food, workouts and plan follow you to any device where you open this app in Whop."
            : `${LOCAL_REASONS[session.reason ?? "not-signed-in"]} For now, everything stays in this browser — clearing site data or switching devices loses it.`}
        </p>
      </div>

      <p className="flex gap-2 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Your weight, food and habit logs are health data, stored only to run the app and for your coach to review. Your
          coach can see your plan, weigh-ins, measurements, habits and daily food totals (and progress photos only if you
          share them), but can&apos;t change them.{" "}
          <a href="/privacy/" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-foreground">
            Privacy policy
          </a>
        </span>
      </p>

      {confirming ? (
        <div role="alertdialog" aria-labelledby={`${ids}-title`} aria-describedby={`${ids}-detail`} className="space-y-3 rounded-md border border-destructive/60 bg-destructive/[0.06] p-3">
          <p id={`${ids}-title`} className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            Are you sure?
          </p>
          <p id={`${ids}-detail`} className="text-xs leading-relaxed">
            This permanently deletes everything you&apos;ve logged{count ? ` (${count} entries)` : ""}: weigh-ins, habits,
            weekly notes, food logs, saved foods, measurements, progress photos, workouts, programs, lift submissions, your
            plan and your reminders. You&apos;ll be removed from the leaderboards. <strong>This can&apos;t be undone.</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button ref={cancelRef} variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
              No, keep my data
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void remove()} disabled={busy}>
              <Trash2 />
              {busy ? "Deleting…" : "Yes, delete everything"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            setResult(null);
            setConfirming(true);
          }}
        >
          <Trash2 />
          Delete all my data{count ? ` (${count} entries)` : ""}
        </Button>
      )}

      {result ? (
        <p role="status" className={cn("text-xs", result.kind === "error" ? "text-destructive" : "text-success")}>
          {result.text}
        </p>
      ) : null}
    </div>
  );
}
