"use client";

import * as React from "react";
import { CircleCheck, Clock, Frown, LifeBuoy, Loader2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ANSWERS, CHOICES, NOTE_MAX, type Answer, type Choice } from "@/lib/accountability";
import { cn } from "@/lib/utils";

/**
 * Today → the coach's accountability check (src/lib/accountability.ts): one
 * question, four one-tap answers and an optional note. A busy week then
 * offers an easier week or a week's pause (which really pauses the plan);
 * struggling or needing help goes straight to the coach.
 */

interface OpenCheck {
  id: string;
  question: string;
  answer: Answer | null;
  choice: Choice | null;
  sentAt: string;
}

const ICON: Record<Answer, React.ReactNode> = {
  "on-track": <CircleCheck className="h-4 w-4 text-success" aria-hidden />,
  busy: <Clock className="h-4 w-4 text-warning" aria-hidden />,
  struggling: <Frown className="h-4 w-4 text-warning" aria-hidden />,
  help: <LifeBuoy className="h-4 w-4 text-destructive" aria-hidden />,
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !json) throw new Error(json?.error ?? "Couldn't send it. Try again.");
  return json;
}

export function AccountabilityCard({ onPause }: { onPause: (days: number) => string | null }) {
  const [check, setCheck] = React.useState<OpenCheck | null>(null);
  const [note, setNote] = React.useState("");
  const [noteOpen, setNoteOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // The last thing said back, shown until closed (remembered per check on this device).
  const [closed, setClosed] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    fetch("/api/accountability", { credentials: "same-origin", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<{ check: OpenCheck | null }>) : null))
      .then((b) => {
        if (!live || !b?.check) return;
        setCheck(b.check);
        try {
          setClosed(localStorage.getItem(`prep-calculator:accountability:${b.check.id}`) === "1");
        } catch {
          /* shown */
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!check) return null;
  const close = () => {
    setClosed(true);
    try {
      localStorage.setItem(`prep-calculator:accountability:${check.id}`, "1");
    } catch {
      /* closed for now */
    }
  };
  // Answered and settled (and not a busy week still to pick for): only until closed.
  const settled = check.answer !== null && (check.answer !== "busy" || check.choice !== null);
  if (settled && closed) return null;

  const answer = async (a: Answer) => {
    setBusy(true);
    setError(null);
    try {
      await post(`/api/accountability/${check.id}`, { answer: a, note: note.trim() || undefined });
      setCheck({ ...check, answer: a });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send it.");
    } finally {
      setBusy(false);
    }
  };
  const choose = async (c: Choice) => {
    setError(null);
    // A week's pause is the app's own pause: streaks freeze, reminders and nudges stop.
    if (c === "pause") {
      const problem = onPause(7);
      if (problem) return setError(problem);
    }
    setBusy(true);
    try {
      await post(`/api/accountability/${check.id}`, { choice: c });
      setCheck({ ...check, choice: c });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save it.");
    } finally {
      setBusy(false);
    }
  };

  const said =
    check.answer === "on-track"
      ? "Nice. Keep doing what you're doing."
      : check.answer === "help" || check.answer === "struggling"
        ? "Sent to your coach. They'll message you soon."
        : check.choice === "pause"
          ? "Your plan is paused for a week: streaks are frozen and reminders are off. Resume any time from this screen."
          : check.choice === "two-things"
            ? "This week: just hit your protein and your steps. Everything else is a bonus."
            : check.choice === "keep"
              ? "Got it. Your coach can see you're keeping going."
              : null;

  return (
    <Card className="border-primary/45">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary">From your coach</p>
            <p className="text-base font-bold">{check.answer === "busy" && !check.choice ? "Keep it simple this week" : check.question}</p>
          </div>
          {settled ? (
            <button type="button" onClick={close} aria-label="Close" className="rounded-full p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {check.answer === null ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              {ANSWERS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void answer(a.id)}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-left text-sm font-semibold transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  {ICON[a.id]}
                  {a.label}
                </button>
              ))}
            </div>
            {noteOpen ? (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={NOTE_MAX}
                rows={2}
                placeholder="Anything your coach should know (optional), then tap an answer"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            ) : (
              <button type="button" onClick={() => setNoteOpen(true)} className="text-[12px] font-semibold text-primary underline-offset-2 hover:underline">
                Add a note (optional)
              </button>
            )}
          </>
        ) : check.answer === "busy" && !check.choice ? (
          <>
            <p className="text-sm text-muted-foreground">Pick one. Your coach sees what you chose.</p>
            <div className="grid gap-2">
              {CHOICES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void choose(c.id)}
                  className="min-h-11 rounded-xl border border-border px-3 text-left text-sm font-semibold transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </>
        ) : said ? (
          <p className={cn("flex items-start gap-2 text-sm")}>
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
            {said}
          </p>
        ) : null}
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Sending" /> : null}
        {error ? (
          <p role="alert" className="text-[12px] text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
