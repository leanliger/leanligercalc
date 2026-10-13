"use client";

import * as React from "react";
import { CalendarRange, Loader2, Lock, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { PhotoImage } from "@/components/photos-card";
import { Sections } from "@/components/physique-card";
import { addDays, daysBetween, formatShort } from "@/lib/dates";
import { POSES, POSE_LABELS, type PhotoMeta } from "@/lib/photos";
import { COMPARE_MIN_DAYS, COMPARE_TARGET_DAYS, shareableSummary, type CompareIds, type PhysiqueSection } from "@/lib/physique";
import { cn } from "@/lib/utils";

export interface Comparison {
  id: string;
  beforeDate: string | null;
  afterDate: string | null;
  createdAt: string;
  photoIds: CompareIds;
  sections: PhysiqueSection[];
  raw: string;
}

/**
 * One comparison: the two sets side by side (one pose at a time), the
 * write-up, and the shareable summary with a Copy button. Used by the member's
 * card and, read-only, on the coach's view of that member.
 */
export function ComparisonView({ c, srcFor }: { c: Comparison; srcFor: (photoId: string) => string }) {
  const poses = POSES.filter((p) => c.photoIds.before[p] && c.photoIds.after[p]);
  const [pose, setPose] = React.useState(poses[0] ?? "front");
  const summary = shareableSummary(c);
  const before = c.photoIds.before[pose];
  const after = c.photoIds.after[pose];
  const days = c.beforeDate && c.afterDate ? daysBetween(c.beforeDate, c.afterDate) : null;
  return (
    <div className="space-y-4">
      <p className="tabular flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarRange className="h-3.5 w-3.5 text-primary" />
        {c.beforeDate ? formatShort(c.beforeDate) : "?"} → {c.afterDate ? formatShort(c.afterDate) : "?"}
        {days !== null ? ` · ${days} days` : ""}
      </p>
      {before && after ? (
        <div className="space-y-2">
          {poses.length > 1 ? (
            <div className="flex gap-1.5" role="group" aria-label="Pose">
              {poses.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={p === pose}
                  onClick={() => setPose(p)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs",
                    p === pose ? "border-primary bg-primary/15 font-medium text-primary" : "border-border text-muted-foreground",
                  )}
                >
                  {POSE_LABELS[p]}
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid max-w-sm grid-cols-2 gap-2">
            {[
              ["Before", before, c.beforeDate],
              ["After", after, c.afterDate],
            ].map(([label, id, date]) => (
              <figure key={label as string} className="space-y-1">
                <PhotoImage src={srcFor(id as string)} alt={`${label}, ${POSE_LABELS[pose]}`} className="aspect-[3/4] w-full" />
                <figcaption className="text-center text-[12px] text-muted-foreground">
                  {label as string}
                  {date ? ` · ${formatShort(date as string)}` : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      ) : null}
      <Sections analysis={c} />
      {summary ? (
        <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs font-semibold text-primary">For a check-in or testimonial</p>
          <p className="text-sm leading-relaxed">{summary}</p>
          <CopyButton getText={() => summary} label="Copy summary" className="h-8" />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">An estimate from photos, not a measurement or medical advice.</p>
    </div>
  );
}

/**
 * Progress → Photos: once a month, compare the newest front / side / back with
 * the set from about a month earlier (worker/physique.ts → comparePhysique).
 * Uses one of the day's physique analyses.
 */
export function PhysiqueCompareCard({ enabled }: { enabled: boolean }) {
  const [photos, setPhotos] = React.useState<PhotoMeta[] | null>(null);
  const [comparisons, setComparisons] = React.useState<Comparison[]>([]);
  const [shownId, setShownId] = React.useState<string | null>(null);
  const [left, setLeft] = React.useState<number | null>(null);
  const [before, setBefore] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    let live = true;
    void (async () => {
      try {
        const [p, a] = await Promise.all([
          fetch("/api/photos", { credentials: "same-origin", headers: { accept: "application/json" } }).then((r) => r.json()),
          fetch("/api/physique", { credentials: "same-origin", headers: { accept: "application/json" } }).then((r) => r.json()),
        ]);
        if (!live) return;
        setPhotos((p as { photos?: PhotoMeta[] }).photos ?? []);
        setComparisons((a as { comparisons?: Comparison[] }).comparisons ?? []);
        setLeft((a as { left?: number }).left ?? null);
      } catch {
        if (live) setPhotos([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [enabled]);

  if (!enabled || photos === null) return null;

  const dates = [...new Set(photos.map((p) => p.date))].sort().reverse();
  const newest = dates[0] ?? null;
  // Earlier set dates far enough back to compare against, newest first.
  const options = newest ? dates.filter((d) => d <= addDays(newest, -COMPARE_MIN_DAYS)) : [];
  const target = newest ? addDays(newest, -COMPARE_TARGET_DAYS) : null;
  const defaultBefore =
    target && options.length > 0
      ? [...options].sort((a, b) => Math.abs(daysBetween(a, target)) - Math.abs(daysBetween(b, target)))[0]!
      : null;
  const chosen = before && options.includes(before) ? before : defaultBefore;
  const last = comparisons[0] ?? null;
  // A month since the last comparison, and newer photos than it used: time for this month's.
  const due = !!newest && !!chosen && (!last?.afterDate || (newest > last.afterDate && daysBetween(last.afterDate, newest) >= COMPARE_MIN_DAYS));
  const shown = comparisons.find((c) => c.id === shownId) ?? last;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/physique/compare", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ before: chosen }),
      });
      const body = (await res.json().catch(() => null)) as { comparison?: Comparison; left?: number; error?: string } | null;
      if (!res.ok || !body?.comparison) throw new Error(body?.error ?? "The comparison didn't come back. Try again.");
      setComparisons((prev) => [body.comparison!, ...prev]);
      setShownId(body.comparison.id);
      setLeft(body.left ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The comparison didn't come back. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={cn(due && "border-primary/50")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" />
          Monthly comparison
        </CardTitle>
        <CardDescription>
          What changed between your newest photos and the ones from about a month before, with a short summary you can share.
          {left !== null ? ` ${left} ${left === 1 ? "analysis" : "analyses"} left today.` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!newest ? (
          <p className="text-sm text-muted-foreground">Add front, side and back photos to start. Next month you can compare.</p>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your first comparison unlocks with photos taken on or after{" "}
            <span className="font-medium text-foreground">{formatShort(addDays(dates[dates.length - 1]!, COMPARE_MIN_DAYS))}</span>.
            Same spot, same lighting, same poses.
          </p>
        ) : (
          <>
            {due ? (
              <p className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                <Sparkles className="h-4 w-4 shrink-0" />
                This month&apos;s comparison is ready.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Compare {formatShort(newest)} with
                <select
                  value={chosen ?? ""}
                  onChange={(e) => setBefore(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  {options.map((d) => (
                    <option key={d} value={d}>
                      {formatShort(d)} ({daysBetween(d, newest)} days)
                    </option>
                  ))}
                </select>
              </label>
              <Button onClick={() => void run()} disabled={busy || left === 0}>
                {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {busy ? "Comparing…" : "Compare"}
              </Button>
            </div>
            <p className="flex gap-1.5 text-xs text-muted-foreground">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Uses your saved photos of each pose from both dates. They go to Google for this comparison only.
            </p>
          </>
        )}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {shown ? (
          <div className="space-y-3 border-t border-border pt-4">
            {comparisons.length > 1 ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Earlier comparisons
                <select
                  value={shown.id}
                  onChange={(e) => setShownId(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  {comparisons.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.beforeDate ? formatShort(c.beforeDate) : "?"} → {c.afterDate ? formatShort(c.afterDate) : "?"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <ComparisonView key={shown.id} c={shown} srcFor={(id) => `/api/photos/${id}`} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Coach dashboard → a member: their newest comparison, when they share photos. */
export function CoachComparisonCard({ companyId, memberId, memberName }: { companyId: string; memberId: string; memberName: string }) {
  const [c, setC] = React.useState<Comparison | null>(null);
  React.useEffect(() => {
    let live = true;
    fetch(`/api/coach/member-physique?company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { comparison?: Comparison | null } | null) => live && setC(b?.comparison ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [companyId, memberId]);
  if (!c) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="h-4 w-4 text-primary" />
          {memberName}&apos;s monthly comparison
        </CardTitle>
        <CardDescription>Their newest photo comparison, for check-ins and (with their OK) testimonials.</CardDescription>
      </CardHeader>
      <CardContent>
        <ComparisonView
          c={c}
          srcFor={(id) =>
            `/api/coach/photo?company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}&id=${encodeURIComponent(id)}`
          }
        />
      </CardContent>
    </Card>
  );
}
