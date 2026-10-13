"use client";

import * as React from "react";
import { Check, Crosshair, Loader2, Plus, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatShort } from "@/lib/dates";
import { MUSCLES, MUSCLE_LABELS, type Muscle } from "@/lib/exercises";
import { parsePhysique } from "@/lib/physique";
import { applyFocus, draftFocus, laggingMuscles, targetAreaText, type FocusChange } from "@/lib/physique-focus";
import type { MemberTraining } from "@/lib/program-edits";
import { cn } from "@/lib/utils";

interface PhysiqueRow {
  id: string;
  photoDate: string | null;
  text: string;
  createdAt: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", headers: { accept: "application/json" } });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? "Couldn't load.");
  return body;
}

/**
 * Coach dashboard → a member: when their latest physique analysis names
 * target areas, draft extra weekly sets for those muscles on their program
 * (src/lib/physique-focus.ts). The coach ticks what to keep and sends it as a
 * normal program edit; the member's app applies it and they get a notification.
 * Hidden when there's no analysis to work from, or the member doesn't share
 * their photos.
 */
export function PhysiqueFocusCard({
  companyId,
  memberId,
  memberName,
  onSent,
}: {
  companyId: string;
  memberId: string;
  memberName: string;
  /** After sending, so the program card above can reload. */
  onSent?: () => void;
}) {
  const [physique, setPhysique] = React.useState<PhysiqueRow | null>(null);
  const [training, setTraining] = React.useState<MemberTraining | null>(null);
  const [muscles, setMuscles] = React.useState<Muscle[]>([]);
  const [programId, setProgramId] = React.useState<string | null>(null);
  const [off, setOff] = React.useState<Set<string>>(() => new Set());
  const [sending, setSending] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const q = `company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}`;

  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        const p = await get<{ shared: boolean; analysis: PhysiqueRow | null }>(`/api/coach/member-physique?${q}`);
        if (!live || !p.analysis) return;
        const t = await get<{ training: MemberTraining }>(`/api/coach/member-training?${q}`);
        if (!live) return;
        setPhysique(p.analysis);
        setTraining(t.training);
        setMuscles(laggingMuscles(parsePhysique(p.analysis.text)));
        setProgramId(t.training.activeProgramId ?? t.training.programs[0]?.id ?? null);
      } catch {
        /* nothing to show: this card is an extra, not something to error about */
      }
    })();
    return () => {
      live = false;
    };
  }, [q]);

  const program = training?.programs.find((p) => p.id === programId) ?? null;
  const changes: FocusChange[] = React.useMemo(
    () => (program && training ? draftFocus(program, muscles, training.customExercises) : []),
    [program, muscles, training],
  );
  const chosen = changes.filter((c) => !off.has(c.id));
  if (!physique || !training) return null;

  const areas = targetAreaText(parsePhysique(physique.text));
  const toggleMuscle = (m: Muscle) => {
    setMessage(null);
    setMuscles((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };
  const toggleChange = (id: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    if (!program || chosen.length === 0) return;
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/coach/member-training", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ company: companyId, member: memberId, program: applyFocus(program, chosen) }),
      });
      const body = (await res.json().catch(() => null)) as { notified?: boolean; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? "Couldn't send it. Try again.");
      setMessage({
        ok: true,
        text: `Sent. ${memberName}'s app adds it to ${program.name} next time it opens${body?.notified ? ", and they got a notification" : ""}.`,
      });
      // The edit is now what the coach's view shows; draft again on top of it.
      const t = await get<{ training: MemberTraining }>(`/api/coach/member-training?${q}`).catch(() => null);
      if (t) setTraining(t.training);
      setOff(new Set());
      setMuscles([]);
      onSent?.();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't send it. Try again." });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Crosshair className="h-4 w-4 text-primary" />
          Program focus from the physique analysis
        </CardTitle>
        <CardDescription>
          {memberName}&apos;s analysis from {formatShort((physique.photoDate ?? physique.createdAt).slice(0, 10))}. Extra weekly sets for the
          areas it flagged, drafted on their program for you to check and send.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {areas ? (
          <blockquote className="max-h-32 overflow-y-auto border-l-2 border-primary/40 pl-3 text-xs leading-relaxed text-muted-foreground">
            {areas.split("\n").map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </blockquote>
        ) : null}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Focus on</p>
          <div className="flex flex-wrap gap-1.5">
            {MUSCLES.map((m) => {
              const on = muscles.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleMuscle(m)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "border-primary bg-primary/15 font-medium text-primary" : "border-border text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {MUSCLE_LABELS[m]}
                </button>
              );
            })}
          </div>
          {muscles.length === 0 ? <p className="text-xs text-muted-foreground">Pick the muscles to bring up.</p> : null}
        </div>

        {training.programs.length > 1 ? (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Program
            <select
              value={programId ?? ""}
              onChange={(e) => setProgramId(e.target.value)}
              className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs text-foreground"
            >
              {training.programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === training.activeProgramId ? " (active)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {!program ? (
          <p className="text-sm text-muted-foreground">{memberName} doesn&apos;t have a program yet. Send them one first.</p>
        ) : changes.length > 0 ? (
          <ul className="space-y-1.5" aria-label="Drafted changes">
            {changes.map((c) => {
              const on = !off.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggleChange(c.id)}
                    className="flex w-full items-start gap-2.5 rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                        on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50",
                      )}
                    >
                      {on ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        {c.kind === "sets" ? (
                          <>
                            {c.exerciseName}: <span className="tabular font-semibold">{c.from} → {c.to} sets</span>
                          </>
                        ) : (
                          <>
                            <Plus className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-primary" />
                            {c.exerciseName} <span className="tabular font-semibold">{c.sets} × {c.repsMin}–{c.repsMax}</span>
                          </>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {MUSCLE_LABELS[c.muscle]} · {c.dayName}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : muscles.length > 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to add: those muscles are already at the most sets this drafts.</p>
        ) : null}

        {program && changes.length > 0 ? (
          <Button onClick={() => void send()} disabled={sending || chosen.length === 0}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            Send {chosen.length} change{chosen.length === 1 ? "" : "s"} to {memberName}
          </Button>
        ) : null}
        {message ? (
          <p role="status" className={cn("text-xs", message.ok ? "text-success" : "text-destructive")}>
            {message.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
