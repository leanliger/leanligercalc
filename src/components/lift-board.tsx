"use client";

import * as React from "react";
import { Check, Clock, Dumbbell, ExternalLink, Play, Send, ShieldCheck, Trash2, Trophy, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented";
import { ConfirmButton } from "@/components/confirm-button";
import type { NotificationStatus } from "@/components/fasting-card";
import { formatShort } from "@/lib/dates";
import { experienceIdFromPath } from "@/lib/fasting";
import {
  LIFTS,
  LIFT_BOARD_MAX,
  LIFT_LABELS,
  LIFT_NOTE_MAX,
  LIFT_RULES,
  REJECT_REASONS,
  REVIEW_NOTE_MAX,
  VIDEO_RULES,
  formatRatio,
  strengthRatio,
  validateSubmission,
  videoHost,
  type Lift,
  type LiftBoardEntry,
  type LiftBoardResponse,
  type MySubmission,
  type PendingSubmission,
} from "@/lib/lift-board";
import type { WeightUnit } from "@/lib/types";
import { fromLb, toLb } from "@/lib/units";
import { cn } from "@/lib/utils";

const UNAVAILABLE: Record<Exclude<NotificationStatus["availability"], "ok">, string> = {
  local: "The lift leaderboard is available when you open this app from inside Whop.",
  "no-key": "Coming soon — the leaderboard isn't switched on for this app yet.",
  "no-experience": "Open the app from your Whop community to see its lift leaderboard.",
};

const MEDAL = ["text-[#d4af37]", "text-[#c0c0c0]", "text-[#cd7f32]"];
const LIFT_OPTIONS = LIFTS.map((l) => ({ value: l, label: l === "bench" ? "Bench" : LIFT_LABELS[l] }));

const load1 = (lb: number, unit: WeightUnit) => `${Math.round(fromLb(lb, unit) * 10) / 10} ${unit}`;

export async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `Request failed (${res.status}).`);
  return body;
}

export function Avatar({ name, url }: { name: string; url: string | null }) {
  const [broken, setBroken] = React.useState(false);
  const initials = name
    .replace(/^@/, "")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return url && !broken ? (
    // eslint-disable-next-line @next/next/no-img-element -- static export: no image optimiser
    <img
      src={url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="h-8 w-8 shrink-0 rounded-full bg-muted object-cover"
    />
  ) : (
    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
      {initials || "?"}
    </span>
  );
}

export function VideoLink({ url, label, compact }: { url: string; label: string; compact?: boolean }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={`Opens ${videoHost(url)}`}
      className={cn(buttonVariants({ variant: "outline", size: compact ? "icon" : "sm" }), compact && "h-8 w-8")}
    >
      <Play />
      {compact ? null : <span>Watch · {videoHost(url)}</span>}
    </a>
  );
}

/* ================================== main ================================== */

export function LiftBoard({
  availability,
  unit,
  bodyweightLb,
  today,
}: {
  availability: NotificationStatus["availability"];
  unit: WeightUnit;
  /** Latest known bodyweight, to pre-fill the form. */
  bodyweightLb: number | null;
  today: string;
}) {
  const [data, setData] = React.useState<LiftBoardResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [lift, setLift] = React.useState<Lift>("squat");
  const experienceId = typeof window === "undefined" ? null : experienceIdFromPath(window.location.pathname);

  const load = React.useCallback(async () => {
    if (!experienceId) return;
    try {
      setData(await call<LiftBoardResponse>(`/api/lift-board?experience=${experienceId}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the lift leaderboard.");
    }
  }, [experienceId]);

  React.useEffect(() => {
    if (availability === "ok") void load();
  }, [availability, load]);

  if (availability !== "ok") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-primary" />
            Lift leaderboard
          </CardTitle>
          <CardDescription>{UNAVAILABLE[availability as Exclude<NotificationStatus["availability"], "ok">]}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-5">
        {data?.isAdmin && data.pending.length > 0 ? <ReviewQueue pending={data.pending} unit={unit} onDone={load} /> : null}
        <BoardCard data={data} error={error} lift={lift} onLift={setLift} unit={unit} onChanged={load} />
      </div>
      <div className="space-y-5">
        {experienceId ? (
          <SubmitCard
            experienceId={experienceId}
            initialLift={lift}
            mine={data?.mine ?? []}
            unit={unit}
            bodyweightLb={bodyweightLb}
            today={today}
            onSubmitted={load}
          />
        ) : null}
        {data && data.mine.length > 0 ? <MySubmissions mine={data.mine} unit={unit} onChanged={load} /> : null}
        <RulesCard lift={lift} />
      </div>
    </div>
  );
}

/* ================================== board ================================== */

function BoardCard({
  data,
  error,
  lift,
  onLift,
  unit,
  onChanged,
}: {
  data: LiftBoardResponse | null;
  error: string | null;
  lift: Lift;
  onLift: (l: Lift) => void;
  unit: WeightUnit;
  onChanged: () => Promise<void>;
}) {
  const entries = data?.boards[lift] ?? [];
  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-primary" />
            Lift leaderboard
          </CardTitle>
          <CardDescription>Verified one-rep lifts, ranked by weight lifted ÷ bodyweight. Every entry has a coach-approved video.</CardDescription>
        </div>
        <SegmentedControl ariaLabel="Lift" size="sm" value={lift} onValueChange={onLift} options={LIFT_OPTIONS} />
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {!data && !error ? <div className="h-40 animate-pulse rounded-md bg-muted/30" aria-busy="true" /> : null}
        {data && entries.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No approved {LIFT_LABELS[lift].toLowerCase()}s yet. Submit yours to be first on the board.
          </p>
        ) : null}
        {entries.length > 0 ? (
          <ol className="space-y-1.5" aria-label={`${LIFT_LABELS[lift]} leaderboard`}>
            {entries.map((e, i) => (
              <React.Fragment key={`${e.rank}-${e.name}-${e.liftedOn}-${i}`}>
                {/* Your own row, added below the top entries. */}
                {i === LIFT_BOARD_MAX && e.isYou ? (
                  <li aria-hidden className="py-0.5 text-center text-xs text-muted-foreground">
                    ⋯
                  </li>
                ) : null}
                <BoardRow e={e} lift={lift} unit={unit} isAdmin={Boolean(data?.isAdmin)} onChanged={onChanged} />
              </React.Fragment>
            ))}
          </ol>
        ) : null}
      </CardContent>
    </Card>
  );
}

function BoardRow({
  e,
  lift,
  unit,
  isAdmin,
  onChanged,
}: {
  e: LiftBoardEntry;
  lift: Lift;
  unit: WeightUnit;
  isAdmin: boolean;
  onChanged: () => Promise<void>;
}) {
  const medal = e.rank <= 3;
  return (
    <li className={cn("flex items-center gap-3 rounded-md border px-3 py-2", e.isYou ? "border-primary bg-primary/10" : "border-border")}>
      <span className={cn("tabular w-6 shrink-0 text-center text-sm font-semibold", medal ? MEDAL[e.rank - 1] : "text-muted-foreground")}>
        {medal ? <Trophy className="mx-auto h-4 w-4" aria-label={`Rank ${e.rank}`} /> : e.rank}
      </span>
      <Avatar name={e.name} url={e.avatarUrl} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{e.name}</span>
          {/* On phones the highlighted row says it; the badge would crowd the name. */}
          {e.isYou ? (
            <Badge variant="default" className="hidden px-1.5 py-0 text-[10px] sm:inline-flex">
              You
            </Badge>
          ) : null}
        </span>
        <span className="tabular block text-[11px] text-muted-foreground">
          {load1(e.weightLb, unit)} · {formatShort(e.liftedOn)}
        </span>
      </span>
      <span className="tabular shrink-0 text-right text-sm font-semibold">{formatRatio(e.ratio)}</span>
      <VideoLink url={e.videoUrl} label={`Watch ${e.name}'s ${LIFT_LABELS[lift].toLowerCase()} on ${videoHost(e.videoUrl)}`} compact />
      {isAdmin && e.id ? (
        <ConfirmButton
          size="icon"
          className="h-8 w-8"
          label={<span className="sr-only">Remove {e.name} from the board</span>}
          icon={<X />}
          confirmLabel="Remove"
          onConfirm={async () => {
            await call(`/api/lift-board/submissions/${e.id}/review`, {
              method: "PUT",
              body: JSON.stringify({ decision: "reject", note: "Removed by a coach." }),
            });
            await onChanged();
          }}
        />
      ) : null}
    </li>
  );
}

/* ================================= submit ================================= */

function SubmitCard({
  experienceId,
  initialLift,
  mine,
  unit,
  bodyweightLb,
  today,
  onSubmitted,
}: {
  experienceId: string;
  initialLift: Lift;
  mine: MySubmission[];
  unit: WeightUnit;
  bodyweightLb: number | null;
  today: string;
  onSubmitted: () => Promise<void>;
}) {
  const [lift, setLift] = React.useState<Lift>(initialLift);
  const [weight, setWeight] = React.useState("");
  const [bodyweight, setBodyweight] = React.useState(bodyweightLb ? String(Math.round(fromLb(bodyweightLb, unit) * 10) / 10) : "");
  const [date, setDate] = React.useState(today);
  const [video, setVideo] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const ids = React.useId();

  React.useEffect(() => setLift(initialLift), [initialLift]);

  const pending = mine.find((m) => m.lift === lift && m.status === "pending");
  const w = Number(weight.replace(",", "."));
  const bw = Number(bodyweight.replace(",", "."));
  const preview = weight && bodyweight && w > 0 && bw > 0 ? strengthRatio(toLb(w, unit), toLb(bw, unit)) : null;

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const body = {
      experienceId,
      lift,
      weightLb: Math.round(toLb(w, unit) * 100) / 100,
      bodyweightLb: Math.round(toLb(bw, unit) * 100) / 100,
      liftedOn: date,
      videoUrl: video.trim(),
      note,
    };
    const check = validateSubmission(body);
    if (!weight || !bodyweight || !Number.isFinite(w) || !Number.isFinite(bw)) {
      setMessage({ kind: "error", text: "Enter the weight you lifted and your bodyweight." });
      return;
    }
    if (!check.ok) {
      setMessage({ kind: "error", text: check.error });
      return;
    }
    setBusy(true);
    try {
      await call("/api/lift-board/submissions", { method: "POST", body: JSON.stringify(body) });
      setMessage({ kind: "ok", text: "Sent for review. You'll get a Whop notification when a coach has checked it." });
      setWeight("");
      setVideo("");
      setNote("");
      await onSubmitted();
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Couldn't submit. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="h-4 w-4 text-primary" />
          Submit a lift
        </CardTitle>
        <CardDescription>One rep, on video. A coach checks it before it goes on the board.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <SegmentedControl ariaLabel="Lift to submit" size="sm" value={lift} onValueChange={setLift} options={LIFT_OPTIONS} />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${ids}-w`}>Weight lifted</Label>
              <div className="relative">
                <Input id={`${ids}-w`} value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" className="pr-9" placeholder="e.g. 315" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${ids}-bw`}>Your bodyweight</Label>
              <div className="relative">
                <Input id={`${ids}-bw`} value={bodyweight} onChange={(e) => setBodyweight(e.target.value)} inputMode="decimal" className="pr-9" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
              </div>
            </div>
          </div>
          {preview ? (
            <p className="tabular text-xs">
              That&apos;s <span className="font-semibold text-primary">{formatRatio(preview)}</span>
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-date`}>Date lifted</Label>
            <Input id={`${ids}-date`} type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-video`}>Video link</Label>
            <Input id={`${ids}-video`} value={video} onChange={(e) => setVideo(e.target.value)} inputMode="url" placeholder="https://youtube.com/…" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Upload it to YouTube (unlisted is fine), Instagram or Google Drive (&ldquo;anyone with the link&rdquo;), then paste the link.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${ids}-note`}>
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input id={`${ids}-note`} value={note} maxLength={LIFT_NOTE_MAX} onChange={(e) => setNote(e.target.value)} placeholder="Belt, wraps, anything the coach should know" />
          </div>
          <p className="flex gap-2 rounded-md bg-muted/40 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Once approved, members of this community see your name, photo, the weight, your ratio and the video. Your
              bodyweight isn&apos;t shown, but it can be worked out from the ratio. Withdraw it any time.
            </span>
          </p>
          {pending ? (
            <p className="text-xs text-warning">
              Your {LIFT_LABELS[lift].toLowerCase()} from {formatShort(pending.liftedOn)} is waiting for review. Withdraw it below to send a different one.
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy || Boolean(pending)}>
            <Send />
            {busy ? "Sending…" : "Submit for review"}
          </Button>
          <p role="status" aria-live="polite" className={cn("min-h-4 text-xs", message?.kind === "error" ? "text-destructive" : "text-success")}>
            {message?.text ?? ""}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

/* ============================ your submissions ============================ */

const STATUS: Record<MySubmission["status"], { label: string; variant: "warning" | "success" | "danger"; icon: React.ReactNode }> = {
  pending: { label: "Waiting for review", variant: "warning", icon: <Clock /> },
  approved: { label: "Approved", variant: "success", icon: <Check /> },
  rejected: { label: "Not approved", variant: "danger", icon: <X /> },
};

function MySubmissions({ mine, unit, onChanged }: { mine: MySubmission[]; unit: WeightUnit; onChanged: () => Promise<void> }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Your submissions</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border rounded-md border border-border">
          {mine.map((m) => {
            const s = STATUS[m.status];
            return (
              <li key={m.id} className="space-y-1.5 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{LIFT_LABELS[m.lift]}</span>
                  <Badge variant={s.variant} className="px-1.5 py-0 text-[10px]">
                    {s.icon}
                    {s.label}
                  </Badge>
                </div>
                <p className="tabular text-xs text-muted-foreground">
                  {load1(m.weightLb, unit)} at {load1(m.bodyweightLb, unit)} bodyweight · {formatRatio(m.ratio)} · {formatShort(m.liftedOn)}
                </p>
                {m.status === "rejected" && m.reviewNote ? <p className="text-xs">Coach: {m.reviewNote}</p> : null}
                <div className="flex items-center gap-1">
                  <a
                    href={m.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {videoHost(m.videoUrl)}
                  </a>
                  <ConfirmButton
                    className="ml-auto h-7 px-2 text-xs"
                    label="Withdraw"
                    icon={<Trash2 />}
                    confirmLabel={m.status === "approved" ? "Remove from board" : "Withdraw"}
                    onConfirm={async () => {
                      await call(`/api/lift-board/submissions/${m.id}`, { method: "DELETE" });
                      await onChanged();
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/* ============================== review queue ============================== */

function ReviewQueue({ pending, unit, onDone }: { pending: PendingSubmission[]; unit: WeightUnit; onDone: () => Promise<void> }) {
  return (
    <Card className="border-warning/50">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-warning" />
          Lifts to review
          <Badge variant="warning">{pending.length}</Badge>
        </CardTitle>
        <CardDescription>Only coaches see this. Watch each video, then approve it or say what&apos;s missing.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {pending.map((p) => (
            <ReviewItem key={p.id} p={p} unit={unit} onDone={onDone} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ReviewItem({ p, unit, onDone }: { p: PendingSubmission; unit: WeightUnit; onDone: () => Promise<void> }) {
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    setError(null);
    try {
      await call(`/api/lift-board/submissions/${p.id}/review`, {
        method: "PUT",
        body: JSON.stringify({ decision, note: decision === "reject" ? reason || null : null }),
      });
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  };

  return (
    <li className="space-y-2.5 rounded-lg border border-border p-3">
      <div className="flex items-center gap-3">
        <Avatar name={p.name} url={p.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{p.name}</p>
          <p className="text-xs text-muted-foreground">
            {LIFT_LABELS[p.lift]} · lifted {formatShort(p.liftedOn)}
          </p>
        </div>
        <span className="tabular shrink-0 text-right">
          <span className="block text-sm font-semibold">{formatRatio(p.ratio)}</span>
          <span className="block text-[11px] text-muted-foreground">
            {load1(p.weightLb, unit)} @ {load1(p.bodyweightLb, unit)}
          </span>
        </span>
      </div>
      {p.note ? <p className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">“{p.note}”</p> : null}
      <VideoLink url={p.videoUrl} label={`Watch ${p.name}'s ${LIFT_LABELS[p.lift].toLowerCase()} on ${videoHost(p.videoUrl)}`} />
      {rejecting ? (
        <div className="space-y-2 rounded-md border border-border p-2.5">
          <p className="text-xs font-medium">What&apos;s missing? (sent to the member)</p>
          <div className="flex flex-wrap gap-1.5">
            {REJECT_REASONS.map((r) => (
              <Button key={r} type="button" variant={reason === r ? "secondary" : "outline"} size="sm" className="h-7 px-2 text-[11px]" onClick={() => setReason(r)}>
                {r}
              </Button>
            ))}
          </div>
          <Input value={reason} maxLength={REVIEW_NOTE_MAX} onChange={(e) => setReason(e.target.value)} placeholder="Or write your own" aria-label="Reason" />
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => void decide("reject")}>
              <X />
              Reject
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => void decide("approve")}>
            <Check />
            Approve
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setRejecting(true)}>
            <X />
            Reject
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/* ================================= rules ================================= */

function RulesCard({ lift }: { lift: Lift }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Trophy className="h-4 w-4 text-primary" />
          How it works
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        <p>
          <strong className="font-medium text-foreground">Ranking.</strong> Weight lifted ÷ your bodyweight, so a 150 lb lifter
          pulling 375 (2.50×) ranks above a 250 lb lifter pulling 500 (2.00×). Your best approved lift counts.
        </p>
        <div>
          <p className="font-medium text-foreground">The video must show</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {VIDEO_RULES.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-medium text-foreground">{LIFT_LABELS[lift]} standard</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {LIFT_RULES[lift].map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <p>A coach reviews every lift. You&apos;ll get a Whop notification when yours is approved, or told what to fix.</p>
      </CardContent>
    </Card>
  );
}
