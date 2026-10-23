"use client";

import * as React from "react";
import { AlertTriangle, CalendarRange, Download, ImageIcon, Loader2, Lock, MessageSquare, Quote, Share2, Sparkles, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CopyButton } from "@/components/copy-button";
import { PhotoImage } from "@/components/photos-card";
import { Sections } from "@/components/physique-card";
import { addDays, daysBetween, formatShort } from "@/lib/dates";
import { POSES, POSE_LABELS, type PhotoMeta, type Pose } from "@/lib/photos";
import { COMPARE_MIN_DAYS, COMPARE_TARGET_DAYS, COMPARISON_COMMENT_MAX, shareableSummary, type CompareIds, type PhysiqueSection } from "@/lib/physique";
import { comparePairs, photoCheckIssues, photoMetrics, type PhotoCheckIssue, type PhotoMetrics } from "@/lib/photo-check";
import { bodyFatSeries, compareStatChips, type BodyFatPoint, type CompareStats } from "@/lib/physique-stats";
import { drawComparisonImage } from "@/lib/share-image";
import type { WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface Comparison {
  id: string;
  beforeDate: string | null;
  afterDate: string | null;
  createdAt: string;
  photoIds: CompareIds;
  stats?: CompareStats | null;
  /** The coach's comment under it. */
  coachComment?: { text: string; at: string } | null;
  sections: PhysiqueSection[];
  raw: string;
}

/**
 * Small copies of the photos, measured on the device for the photo check
 * (src/lib/photo-check.ts). A photo that can't be read is left out.
 */
async function measurePhotos(ids: readonly string[], srcFor: (id: string) => string): Promise<Map<string, PhotoMetrics>> {
  const out = new Map<string, PhotoMetrics>();
  await Promise.all(
    [...new Set(ids)].map(async (id) => {
      try {
        const res = await fetch(srcFor(id), { credentials: "same-origin" });
        if (!res.ok) return;
        const bmp = await createImageBitmap(await res.blob());
        const w = 48;
        const h = Math.max(8, Math.round((w * bmp.height) / bmp.width));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(bmp, 0, 0, w, h);
        bmp.close();
        out.set(id, photoMetrics(ctx.getImageData(0, 0, w, h).data, w, h));
      } catch {
        /* not measured */
      }
    }),
  );
  return out;
}

/** The coach's comment, as the member sees it. */
function CoachCommentNote({ comment }: { comment: { text: string; at: string } }) {
  return (
    <div className="space-y-1 rounded-2xl border border-primary/25 bg-primary/[0.05] p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
        <MessageSquare className="h-3.5 w-3.5" aria-hidden />
        From your coach · {formatShort(comment.at.slice(0, 10))}
      </p>
      <p className="whitespace-pre-wrap text-sm">{comment.text}</p>
    </div>
  );
}

/* ------------------------------ share image ------------------------------ */

/**
 * The branded before/after image, made on the device. Share uses the phone's
 * share sheet where the page is allowed to; otherwise Save, and on iPhones
 * pressing and holding the preview saves it too.
 */
function ShareImageButton({ c, pose, srcFor, unit }: { c: Comparison; pose: Pose; srcFor: (id: string) => string; unit: WeightUnit }) {
  const [busy, setBusy] = React.useState(false);
  const [image, setImage] = React.useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.url);
  }, [image]);

  const make = async () => {
    const b = c.photoIds.before[pose];
    const a = c.photoIds.after[pose];
    if (!b || !a) return;
    setBusy(true);
    setError(null);
    try {
      const get = async (id: string) => {
        const res = await fetch(srcFor(id), { credentials: "same-origin" });
        if (!res.ok) throw new Error("One of the photos couldn't be loaded. It may have been deleted.");
        return res.blob();
      };
      const [before, after] = await Promise.all([get(b), get(a)]);
      const days = c.beforeDate && c.afterDate ? daysBetween(c.beforeDate, c.afterDate) : null;
      const blob = await drawComparisonImage({
        before,
        after,
        beforeLabel: `Before · ${c.beforeDate ? formatShort(c.beforeDate) : ""}`,
        afterLabel: `After · ${c.afterDate ? formatShort(c.afterDate) : ""}`,
        title: days ? `${days}-day transformation` : "Transformation",
        chips: compareStatChips(c.stats ?? null, unit),
        summary: shareableSummary(c),
      });
      setImage({ blob, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the image.");
    } finally {
      setBusy(false);
    }
  };

  const file = image ? new File([image.blob], "lean-stature-transformation.jpg", { type: "image/jpeg" }) : null;
  const canShare = !!file && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => void make()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <ImageIcon />}
        {busy ? "Making image…" : "Share image"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {image ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Your transformation image"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black p-4"
          onClick={() => setImage(null)}
        >
          <div className="flex w-full max-w-sm justify-end">
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setImage(null)} aria-label="Close">
              <X />
            </Button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated on the device */}
          <img
            src={image.url}
            alt="Before and after transformation"
            className="max-h-[65dvh] w-auto max-w-full rounded-md"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex flex-wrap justify-center gap-2" onClick={(e) => e.stopPropagation()}>
            {canShare ? (
              <Button
                onClick={() =>
                  void navigator.share({ files: [file!], title: "My transformation" }).catch(() => {
                    /* cancelled */
                  })
                }
              >
                <Share2 />
                Share
              </Button>
            ) : null}
            <a
              href={image.url}
              download="lean-stature-transformation.jpg"
              className={buttonVariants({ variant: canShare ? "outline" : "default" })}
            >
              <Download />
              Save image
            </a>
          </div>
          <p className="max-w-sm text-center text-xs text-white/70">
            On iPhone, you can also press and hold the image and choose Save to Photos.
          </p>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------ body fat chart ------------------------------ */

/** Estimated body fat ranges over time: a bar from low to high per date, joined through the middles. */
export function BodyFatChart({ points }: { points: BodyFatPoint[] }) {
  if (points.length < 2) return null;
  const W = 320;
  const H = 140;
  const padL = 30;
  const padR = 10;
  const padT = 10;
  const padB = 24;
  const lo = Math.floor(Math.min(...points.map((p) => p.low)) - 1);
  const hi = Math.ceil(Math.max(...points.map((p) => p.high)) + 1);
  const t0 = new Date(points[0]!.date).getTime();
  const t1 = new Date(points[points.length - 1]!.date).getTime();
  const x = (d: string) => padL + ((new Date(d).getTime() - t0) / Math.max(t1 - t0, 1)) * (W - padL - padR);
  const y = (v: number) => padT + ((hi - v) / Math.max(hi - lo, 1)) * (H - padT - padB);
  const mids = points.map((p) => `${x(p.date)},${y((p.low + p.high) / 2)}`).join(" ");
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return (
    <figure className="space-y-1">
      <figcaption className="text-xs font-medium text-muted-foreground">Estimated body fat over time</figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full max-w-sm"
        role="img"
        aria-label={`Estimated body fat from ${first.low}–${first.high}% on ${formatShort(first.date)} to ${last.low}–${last.high}% on ${formatShort(last.date)}`}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="hsl(var(--border))" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="hsl(var(--muted-foreground))">
              {t}%
            </text>
          </g>
        ))}
        <polyline points={mids} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeDasharray="3 3" />
        {points.map((p) => (
          <g key={p.date}>
            <line x1={x(p.date)} x2={x(p.date)} y1={y(p.high)} y2={y(p.low)} stroke="hsl(var(--primary))" strokeWidth={8} strokeLinecap="round" opacity={0.45} />
            <circle cx={x(p.date)} cy={y((p.low + p.high) / 2)} r={3.5} fill="hsl(var(--primary))" />
          </g>
        ))}
        <text x={padL} y={H - 6} fontSize={10} fill="hsl(var(--muted-foreground))">
          {formatShort(first.date)}
        </text>
        <text x={W - padR} y={H - 6} textAnchor="end" fontSize={10} fill="hsl(var(--muted-foreground))">
          {formatShort(last.date)}
        </text>
      </svg>
    </figure>
  );
}

/* ------------------------------ one comparison ------------------------------ */

/**
 * One comparison: the two sets side by side (one pose at a time), the measured
 * changes, the write-up, and the shareable summary with Copy and a share
 * image. Used by the member's card, the coach's view of that member, and the
 * coach's Testimonials list.
 */
export function ComparisonView({ c, srcFor, unit }: { c: Comparison; srcFor: (photoId: string) => string; unit: WeightUnit }) {
  const poses = POSES.filter((p) => c.photoIds.before[p] && c.photoIds.after[p]);
  const [pose, setPose] = React.useState<Pose>(poses[0] ?? "front");
  const summary = shareableSummary(c);
  const chips = compareStatChips(c.stats ?? null, unit);
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
      {chips.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Measured changes">
          {chips.map((chip) => (
            <li key={chip} className="tabular rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium">
              {chip}
            </li>
          ))}
        </ul>
      ) : null}
      <Sections analysis={c} />
      {summary ? (
        <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="text-xs font-semibold text-primary">For a check-in or testimonial</p>
          <p className="text-sm leading-relaxed">{summary}</p>
          <div className="flex flex-wrap items-start gap-2">
            <CopyButton getText={() => summary} label="Copy summary" className="h-8" />
            {before && after ? <ShareImageButton c={c} pose={pose} srcFor={srcFor} unit={unit} /> : null}
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">An estimate from photos, not a measurement or medical advice.</p>
    </div>
  );
}

/* ------------------------------ member card ------------------------------ */

interface AnalysisLite {
  photoDate: string | null;
  createdAt?: string;
  sections: PhysiqueSection[];
}

/**
 * Progress → Check-in → Photos: once a month, compare the newest front / side / back with
 * the set from about a month earlier (worker/physique.ts → comparePhysique).
 * Uses one of the day's physique analyses.
 */
export function PhysiqueCompareCard({ enabled, unit }: { enabled: boolean; unit: WeightUnit }) {
  const [photos, setPhotos] = React.useState<PhotoMeta[] | null>(null);
  const [analyses, setAnalyses] = React.useState<AnalysisLite[]>([]);
  const [comparisons, setComparisons] = React.useState<Comparison[]>([]);
  const [shownId, setShownId] = React.useState<string | null>(null);
  const [left, setLeft] = React.useState<number | null>(null);
  const [before, setBefore] = React.useState<string | null>(null);
  const [consent, setConsent] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // The photo check's warnings, shown before an analysis is spent.
  const [issues, setIssues] = React.useState<PhotoCheckIssue[] | null>(null);
  const [checking, setChecking] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;
    let live = true;
    const get = (path: string) =>
      fetch(path, { credentials: "same-origin", headers: { accept: "application/json" } }).then((r) => (r.ok ? r.json() : null));
    void (async () => {
      try {
        const [p, a, t] = await Promise.all([get("/api/photos"), get("/api/physique"), get("/api/testimonial-consent")]);
        if (!live) return;
        setPhotos((p as { photos?: PhotoMeta[] } | null)?.photos ?? []);
        setAnalyses((a as { analyses?: AnalysisLite[] } | null)?.analyses ?? []);
        setComparisons((a as { comparisons?: Comparison[] } | null)?.comparisons ?? []);
        setLeft((a as { left?: number } | null)?.left ?? null);
        setConsent((t as { allowed?: boolean } | null)?.allowed ?? false);
      } catch {
        if (live) setPhotos([]);
      }
    })();
    return () => {
      live = false;
    };
  }, [enabled]);

  const series = React.useMemo(() => bodyFatSeries(analyses, comparisons), [analyses, comparisons]);
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
  // Newer photos than the last comparison used, far enough on: time for this month's.
  const due = !!newest && !!chosen && (!last?.afterDate || (newest > last.afterDate && daysBetween(last.afterDate, newest) >= COMPARE_MIN_DAYS));
  const shown = comparisons.find((c) => c.id === shownId) ?? last;

  // Check the photos line up first; the comparison only runs straight away when nothing looks off.
  const check = async () => {
    setChecking(true);
    setError(null);
    setIssues(null);
    let found: PhotoCheckIssue[] = [];
    try {
      const { pairs } = comparePairs(photos, chosen);
      const metrics = await measurePhotos(
        pairs.flatMap((p) => [p.before.id, p.after.id]),
        (id) => `/api/photos/${id}`,
      );
      found = photoCheckIssues(photos, pairs, metrics);
    } catch {
      found = []; // the check only helps; it never stops a comparison
    } finally {
      setChecking(false);
    }
    if (found.length > 0) setIssues(found);
    else await run();
  };

  const run = async () => {
    setIssues(null);
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

  const changeConsent = async (allowed: boolean) => {
    const prev = consent;
    setConsent(allowed);
    const res = await fetch("/api/testimonial-consent", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ allowed }),
    }).catch(() => null);
    if (!res?.ok) {
      setConsent(prev);
      setError("Couldn't save that. Try again.");
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
          What changed between your newest photos and the ones from about a month before, checked against your weight, tape
          measurements and lifts, with a short summary and an image you can share.
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
            Same spot, same lighting, same poses. We&apos;ll send a notification when it&apos;s ready.
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
              <Button onClick={() => void check()} disabled={busy || checking || left === 0}>
                {busy || checking ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {checking ? "Checking photos…" : busy ? "Comparing…" : "Compare"}
              </Button>
            </div>
            {issues ? (
              <div role="alert" className="space-y-2 rounded-2xl border border-warning/40 bg-warning/[0.07] p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  These photos may not line up
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {issues.map((i) => (
                    <li key={i.text}>{i.text}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  Retaking them gives a fairer comparison. Comparing anyway uses one of today&apos;s analyses
                  {left !== null ? ` (${left} left)` : ""}.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => void run()} disabled={busy}>
                    Compare anyway
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIssues(null)}>
                    I&apos;ll retake them
                  </Button>
                </div>
              </div>
            ) : null}
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

        {consent !== null ? (
          <div className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5">
            <Quote className={cn("mt-0.5 h-4 w-4 shrink-0", consent ? "text-primary" : "text-muted-foreground")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">My coach may use my comparisons as testimonials</p>
              <p className="text-xs text-muted-foreground">
                {consent
                  ? "On: your coach can share your before/after and summary (no name) to show results. Needs photo sharing on too. Turn off any time."
                  : "Off: your comparisons stay between you and your coach."}
              </p>
            </div>
            <Switch checked={consent} onCheckedChange={(v) => void changeConsent(v)} aria-label="Allow testimonials" />
          </div>
        ) : null}

        <BodyFatChart points={series} />

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
            {shown.coachComment ? <CoachCommentNote comment={shown.coachComment} /> : null}
            <ComparisonView key={shown.id} c={shown} srcFor={(id) => `/api/photos/${id}`} unit={unit} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ------------------------------ coach ------------------------------ */

const coachPhoto = (companyId: string, memberId: string) => (id: string) =>
  `/api/coach/photo?company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}&id=${encodeURIComponent(id)}`;

/** Coach dashboard → a member: their newest comparison and body fat chart, when they share photos. */
export function CoachComparisonCard({
  companyId,
  memberId,
  memberName,
  unit,
}: {
  companyId: string;
  memberId: string;
  memberName: string;
  unit: WeightUnit;
}) {
  const [data, setData] = React.useState<{ comparison: Comparison | null; bodyFat: BodyFatPoint[] } | null>(null);
  React.useEffect(() => {
    let live = true;
    fetch(`/api/coach/member-physique?company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { comparison?: Comparison | null; bodyFat?: BodyFatPoint[] } | null) =>
        live && setData(b ? { comparison: b.comparison ?? null, bodyFat: b.bodyFat ?? [] } : null),
      )
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [companyId, memberId]);
  if (!data || (!data.comparison && data.bodyFat.length < 2)) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="h-4 w-4 text-primary" />
          {memberName}&apos;s monthly comparison
        </CardTitle>
        <CardDescription>Their newest photo comparison, for check-ins and (with their OK) testimonials.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <BodyFatChart points={data.bodyFat} />
        {data.comparison ? (
          <>
            <CommentEditor
              key={data.comparison.id}
              companyId={companyId}
              memberId={memberId}
              memberName={memberName}
              comparisonId={data.comparison.id}
              initial={data.comparison.coachComment ?? null}
            />
            <ComparisonView c={data.comparison} srcFor={coachPhoto(companyId, memberId)} unit={unit} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** The coach's comment on a comparison: the member sees it under it and gets a notification. */
function CommentEditor({
  companyId,
  memberId,
  memberName,
  comparisonId,
  initial,
}: {
  companyId: string;
  memberId: string;
  memberName: string;
  comparisonId: string;
  initial: { text: string; at: string } | null;
}) {
  const [saved, setSaved] = React.useState(initial);
  const [text, setText] = React.useState(initial?.text ?? "");
  const [editing, setEditing] = React.useState(!initial);
  const [state, setState] = React.useState<"idle" | "saving">("idle");
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const first = memberName.split(" ")[0] || memberName;

  const save = async (comment: string) => {
    setState("saving");
    setMessage(null);
    try {
      const res = await fetch("/api/coach/comparison-comment", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ company: companyId, member: memberId, id: comparisonId, comment }),
      });
      const b = (await res.json().catch(() => null)) as { comment?: { text: string; at: string } | null; notified?: boolean; error?: string } | null;
      if (!res.ok || !b) throw new Error(b?.error ?? "Couldn't save it. Try again.");
      setSaved(b.comment ?? null);
      setText(b.comment?.text ?? "");
      setEditing(!b.comment);
      setMessage({
        ok: true,
        text: b.comment ? (b.notified ? `Saved. ${first} got a notification.` : `Saved. ${first} sees it under their comparison.`) : "Comment removed.",
      });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't save it. Try again." });
    } finally {
      setState("idle");
    }
  };

  return (
    <div className="space-y-2 rounded-2xl border border-border p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <MessageSquare className="h-3.5 w-3.5 text-primary" aria-hidden />
        Your comment for {first}
      </p>
      {saved && !editing ? (
        <>
          <p className="whitespace-pre-wrap text-sm">{saved.text}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" disabled={state === "saving"} onClick={() => void save("")}>
              Remove
            </Button>
          </div>
        </>
      ) : (
        <>
          <label htmlFor={`compare-comment-${comparisonId}`} className="sr-only">
            Comment on {first}&apos;s comparison
          </label>
          <textarea
            id={`compare-comment-${comparisonId}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={COMPARISON_COMMENT_MAX}
            rows={3}
            placeholder={`e.g. Shoulders and upper back are filling out, ${first}. Waist is tighter too. Keep protein where it is.`}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!text.trim() || state === "saving"} onClick={() => void save(text)}>
              {state === "saving" ? "Saving…" : saved ? "Save changes" : "Send comment"}
            </Button>
            {saved ? (
              <Button size="sm" variant="ghost" onClick={() => {
                setText(saved.text);
                setEditing(false);
              }}>
                Cancel
              </Button>
            ) : null}
          </div>
        </>
      )}
      {message ? (
        <p role="status" className={cn("text-[12px]", message.ok ? "text-muted-foreground" : "text-destructive")}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Coach dashboard → Testimonials: members who said yes (and share photos),
 * each with their newest comparison: summary to copy and a share image.
 */
export function CoachTestimonials({ companyId, names, unit }: { companyId: string; names: Map<string, string>; unit: WeightUnit }) {
  const [items, setItems] = React.useState<{ memberId: string; comparison: Comparison }[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  React.useEffect(() => {
    let live = true;
    fetch(`/api/coach/testimonials?company=${encodeURIComponent(companyId)}`, { credentials: "same-origin", headers: { accept: "application/json" } })
      .then(async (r) => {
        const b = (await r.json().catch(() => null)) as { testimonials?: { memberId: string; comparison: Comparison }[]; error?: string } | null;
        if (!r.ok || !b?.testimonials) throw new Error(b?.error ?? "Couldn't load testimonials.");
        if (live) setItems(b.testimonials);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : "Couldn't load testimonials."));
    return () => {
      live = false;
    };
  }, [companyId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Quote className="h-4 w-4 text-primary" />
          Testimonials
        </CardTitle>
        <CardDescription>
          Only members who switched on &ldquo;My coach may use my comparisons as testimonials&rdquo; and share their photos. If they
          turn either off, they leave this list. Summaries are written without names.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : items === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No one yet. Members find the switch under Progress → Check-in → Photos → Monthly comparison; it&apos;s worth mentioning in a check-in.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map(({ memberId, comparison: c }) => {
              const name = names.get(memberId) ?? "A member";
              const summary = shareableSummary(c);
              const chips = compareStatChips(c.stats ?? null, unit);
              const isOpen = open === memberId;
              return (
                <li key={memberId} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="tabular text-xs text-muted-foreground">
                      {c.beforeDate ? formatShort(c.beforeDate) : "?"} → {c.afterDate ? formatShort(c.afterDate) : "?"}
                    </p>
                  </div>
                  {chips.length ? <p className="tabular text-xs text-primary">{chips.join(" · ")}</p> : null}
                  {summary ? <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p> : null}
                  {isOpen ? (
                    <ComparisonView c={c} srcFor={coachPhoto(companyId, memberId)} unit={unit} />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {summary ? <CopyButton getText={() => summary} label="Copy summary" className="h-8" /> : null}
                      <Button variant="outline" size="sm" onClick={() => setOpen(memberId)}>
                        <ImageIcon />
                        Photos and image
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
