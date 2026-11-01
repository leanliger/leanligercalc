"use client";

import * as React from "react";
import { Loader2, MessageCircleQuestion, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { foodDayOf } from "@/lib/coach-api";
import type { DayTarget } from "@/lib/day-targets";
import type { FoodLog } from "@/lib/food";
import { MISS_NOTE_MAX, MISS_REASONS, missToAsk, type MissReason, type MissReasonId } from "@/lib/miss-reasons";
import { cn } from "@/lib/utils";

/**
 * Today: "What made yesterday's calorie target difficult?" (src/lib/miss-reasons.ts),
 * the morning after a full day off its calories. One tap sends the reason to
 * their coach; Skip stops it asking about that day.
 */
export function MissReasonCard({ foodLogs, targetFor, today }: { foodLogs: readonly FoodLog[]; targetFor: (date: string) => DayTarget | null; today: string }) {
  const [answered, setAnswered] = React.useState<Set<string> | null>(null);
  const [pick, setPick] = React.useState<MissReasonId | null>(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [thanks, setThanks] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    fetch("/api/miss-reasons", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<{ reasons: MissReason[] }>) : null))
      .then((b) => live && b && setAnswered(new Set(b.reasons.map((x) => x.date))))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const days = React.useMemo(() => foodLogs.filter((l) => l.entries.length > 0).map((l) => foodDayOf(l.date, l.entries)), [foodLogs]);
  // Until the answers have loaded nothing shows, so an answered day never flashes up.
  const miss = answered ? missToAsk(days, targetFor, today, answered) : null;

  const send = async (reason: MissReasonId | null) => {
    if (!miss) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/miss-reasons", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ date: miss.date, kind: "calories", reason, note, kcal: miss.kcal, target: miss.target }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? "Couldn't send it. Try again.");
      }
      setAnswered((a) => new Set([...(a ?? []), miss.date]));
      if (reason) setThanks(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send it. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (thanks) {
    return (
      <Card className="border-success/40 bg-success/5">
        <CardContent className="flex items-center gap-3 p-4 text-sm">
          <span className="flex-1">Thanks, your coach can see it. Today&apos;s a fresh start.</span>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Close" onClick={() => setThanks(false)}>
            <X />
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (!miss) return null;
  const over = miss.kcal > miss.target;

  return (
    <Card className="border-warning/40">
      <CardContent className="space-y-3 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <MessageCircleQuestion className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">What made yesterday&apos;s calorie target difficult?</p>
            <p className="tabular text-xs text-muted-foreground">
              You ate {miss.kcal.toLocaleString()} of {miss.target.toLocaleString()} kcal ({over ? "over" : "under"} by {Math.abs(miss.kcal - miss.target).toLocaleString()}). One
              tap tells your coach; no judgement.
            </p>
          </div>
        </div>
        <div role="radiogroup" aria-label="What made it difficult" className="flex flex-wrap gap-1.5">
          {MISS_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={pick === r.id}
              onClick={() => setPick(r.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                pick === r.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/40",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        <Input placeholder="Anything else? (optional)" maxLength={MISS_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || !pick} onClick={() => void send(pick)}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Send to my coach
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void send(null)}>
            Skip
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
