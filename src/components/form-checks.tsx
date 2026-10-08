"use client";

import * as React from "react";
import { MessageSquareText, Send, Trash2, Video, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/confirm-button";
import { ExercisePicker } from "@/components/exercise-library";
import { Avatar, VideoLink, call } from "@/components/lift-board";
import type { NotificationStatus } from "@/components/fasting-card";
import { formatShort } from "@/lib/dates";
import type { Exercise } from "@/lib/exercises";
import { experienceIdFromPath } from "@/lib/fasting";
import {
  FEEDBACK_MAX,
  FEEDBACK_STARTERS,
  FILMING_TIPS,
  QUESTION_MAX,
  type FormCheck,
  type FormChecksResponse,
  type PendingFormCheck,
} from "@/lib/form-checks";
import { findExercise } from "@/lib/training";
import { cn } from "@/lib/utils";

const FIELD =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background";

const UNAVAILABLE: Record<Exclude<NotificationStatus["availability"], "ok">, string> = {
  local: "Available when you open this app from inside Whop.",
  "no-key": "Coming soon — form checks aren't switched on for this app yet.",
  "no-experience": "Open the app from your Whop community to ask for a form check.",
};

const day = (iso: string) => formatShort(iso.slice(0, 10));

export interface FormChecksCardProps {
  availability: NotificationStatus["availability"];
  custom: readonly Exercise[];
  onAddCustom: (e: Exercise) => void;
  /** Open the request form with this exercise picked (from an exercise's page). */
  askFor: string | null;
  onAskForHandled: () => void;
}

/**
 * Form checks on the Training tab: ask your coach to look at a set, see their
 * feedback, and — for admins of the community — the queue to answer.
 */
export function FormChecksCard({ availability, custom, onAddCustom, askFor, onAskForHandled }: FormChecksCardProps) {
  const experienceId = typeof window === "undefined" ? null : experienceIdFromPath(window.location.pathname);
  const available = availability === "ok" && experienceId !== null;
  const [data, setData] = React.useState<FormChecksResponse | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [asking, setAsking] = React.useState<Exercise | "pick" | null>(null);
  const card = React.useRef<HTMLDivElement>(null);

  const load = React.useCallback(async () => {
    if (!available) return;
    try {
      setData(await call<FormChecksResponse>(`/api/form-checks?experience=${encodeURIComponent(experienceId!)}`));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load form checks.");
    }
  }, [available, experienceId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // "Get a form check" on an exercise's page lands here with it picked.
  React.useEffect(() => {
    if (!askFor) return;
    const ex = findExercise(askFor, custom);
    setAsking(ex ?? "pick");
    onAskForHandled();
    requestAnimationFrame(() => card.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [askFor, custom, onAskForHandled]);

  const pendingMine = data?.mine.filter((f) => f.status === "pending").length ?? 0;

  return (
    <Card ref={card} className="scroll-mt-20">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Video className="h-4 w-4 text-primary" />
          Form checks
        </CardTitle>
        <CardDescription>
          Film a set and get your coach&apos;s feedback on your technique. Only you and your coaches see it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!available ? (
          <p className="text-sm text-muted-foreground">
            {UNAVAILABLE[(availability === "ok" ? "no-experience" : availability) as Exclude<NotificationStatus["availability"], "ok">]}
          </p>
        ) : (
          <>
            {loadError ? (
              <p role="alert" className="text-xs text-destructive">
                {loadError}{" "}
                <button type="button" className="underline" onClick={() => void load()}>
                  Try again
                </button>
              </p>
            ) : null}

            {data?.isAdmin && data.pending.length > 0 ? <ReviewQueue items={data.pending} onDone={load} /> : null}

            {asking ? (
              <AskForm
                experienceId={experienceId!}
                exercise={asking === "pick" ? null : asking}
                custom={custom}
                onAddCustom={onAddCustom}
                onPickExercise={(e) => setAsking(e ?? "pick")}
                onCancel={() => setAsking(null)}
                onSent={async () => {
                  setAsking(null);
                  await load();
                }}
              />
            ) : (
              <Button className="w-full" variant="outline" onClick={() => setAsking("pick")} disabled={!data}>
                <Video />
                Ask for a form check
              </Button>
            )}

            {data && data.mine.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Your form checks{pendingMine > 0 ? ` · ${pendingMine} waiting` : ""}
                </p>
                <ul className="space-y-2">
                  {data.mine.map((f) => (
                    <MyFormCheck key={f.id} f={f} onDeleted={load} />
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------- asking --------------------------------- */

function AskForm({
  experienceId,
  exercise,
  custom,
  onAddCustom,
  onPickExercise,
  onCancel,
  onSent,
}: {
  experienceId: string;
  exercise: Exercise | null;
  custom: readonly Exercise[];
  onAddCustom: (e: Exercise) => void;
  onPickExercise: (e: Exercise | null) => void;
  onCancel: () => void;
  onSent: () => Promise<void>;
}) {
  const [videoUrl, setVideoUrl] = React.useState("");
  const [question, setQuestion] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const urlId = React.useId();
  const qId = React.useId();

  if (!exercise) {
    return (
      <ExercisePicker title="Which exercise?" custom={custom} onAddCustom={onAddCustom} onPick={onPickExercise} onClose={onCancel} />
    );
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call("/api/form-checks", {
        method: "POST",
        body: JSON.stringify({ experienceId, exerciseId: exercise.id, exerciseName: exercise.name, videoUrl: videoUrl.trim(), question }),
      });
      await onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send it. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="space-y-3 rounded-lg border border-primary/40 bg-primary/[0.03] p-3" noValidate>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-primary">Form check</p>
          <p className="truncate text-sm font-semibold">{exercise.name}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => onPickExercise(null)}>
            Change
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onCancel} aria-label="Cancel">
            <X />
          </Button>
        </div>
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {FILMING_TIPS.map((t) => (
          <li key={t} className="flex gap-2">
            <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
            {t}
          </li>
        ))}
      </ul>
      <div className="space-y-1">
        <label htmlFor={urlId} className="text-xs font-medium">
          Video link
        </label>
        <Input id={urlId} type="url" inputMode="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://" />
      </div>
      <div className="space-y-1">
        <label htmlFor={qId} className="text-xs font-medium">
          What should your coach look at? <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id={qId}
          className={cn(FIELD, "min-h-[4rem] resize-y")}
          value={question}
          maxLength={QUESTION_MAX}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Is my depth OK? My lower back feels it."
        />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        <Send />
        Send to my coach
      </Button>
    </form>
  );
}

function MyFormCheck({ f, onDeleted }: { f: FormCheck; onDeleted: () => Promise<void> }) {
  const reviewed = f.status === "reviewed";
  return (
    <li className={cn("space-y-2 rounded-md border px-3 py-2.5", reviewed ? "border-success/40" : "border-border")}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{f.exerciseName}</p>
          <p className="text-[11px] text-muted-foreground">Sent {day(f.createdAt)}</p>
        </div>
        <Badge variant={reviewed ? "success" : "secondary"} className="shrink-0">
          {reviewed ? "Feedback ready" : "Waiting for coach"}
        </Badge>
      </div>
      {f.question ? <p className="text-xs italic text-muted-foreground">&ldquo;{f.question}&rdquo;</p> : null}
      {reviewed && f.feedback ? (
        <div className="space-y-1 rounded-md bg-muted/40 px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-success">
            <MessageSquareText className="h-3.5 w-3.5" />
            Coach feedback{f.reviewedAt ? ` · ${day(f.reviewedAt)}` : ""}
          </p>
          <p className="whitespace-pre-line text-sm">{f.feedback}</p>
        </div>
      ) : null}
      <div className="flex items-center gap-1">
        <VideoLink url={f.videoUrl} label={`Watch your ${f.exerciseName} video`} />
        <ConfirmButton
          label={reviewed ? "Delete" : "Withdraw"}
          icon={<Trash2 />}
          confirmLabel={reviewed ? "Yes, delete" : "Yes, withdraw"}
          className="ml-auto text-muted-foreground"
          onConfirm={async () => {
            await call(`/api/form-checks/${f.id}`, { method: "DELETE" });
            await onDeleted();
          }}
        />
      </div>
    </li>
  );
}

/* ------------------------------ coach's queue ------------------------------ */

function ReviewQueue({ items, onDone }: { items: PendingFormCheck[]; onDone: () => Promise<void> }) {
  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/[0.03] p-3">
      <p className="text-sm font-semibold">
        Form checks to review <span className="tabular text-muted-foreground">({items.length})</span>
      </p>
      <ul className="space-y-3">
        {items.map((f) => (
          <ReviewItem key={f.id} f={f} onDone={onDone} />
        ))}
      </ul>
    </div>
  );
}

function ReviewItem({ f, onDone }: { f: PendingFormCheck; onDone: () => Promise<void> }) {
  const [feedback, setFeedback] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await call(`/api/form-checks/${f.id}/feedback`, { method: "PUT", body: JSON.stringify({ feedback }) });
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send it. Try again.");
      setBusy(false);
    }
  };

  return (
    <li className="space-y-2 rounded-md border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={f.name} url={f.avatarUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{f.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {f.exerciseName} · {day(f.createdAt)}
          </p>
        </div>
        <VideoLink url={f.videoUrl} label={`Watch ${f.name}'s ${f.exerciseName} video`} compact />
      </div>
      {f.question ? <p className="text-xs italic text-muted-foreground">&ldquo;{f.question}&rdquo;</p> : null}
      <label htmlFor={id} className="sr-only">
        Feedback for {f.name}
      </label>
      <textarea
        id={id}
        className={cn(FIELD, "min-h-[5rem] resize-y")}
        value={feedback}
        maxLength={FEEDBACK_MAX}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="What looks good, and the one thing to fix"
      />
      <div className="flex flex-wrap gap-1">
        {FEEDBACK_STARTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFeedback((prev) => (prev ? `${prev} ${s}` : s))}
            className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/50"
          >
            {s.length > 34 ? `${s.slice(0, 33).trimEnd()}…` : s}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <Button size="sm" className="w-full" disabled={busy || !feedback.trim()} onClick={send}>
        <Send />
        Send feedback
      </Button>
    </li>
  );
}
