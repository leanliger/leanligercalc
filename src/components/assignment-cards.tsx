"use client";

import * as React from "react";
import { Dumbbell, ListChecks } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { MemberAssignment } from "@/lib/assignments";
import type { ProgramEdit } from "@/lib/program-edits";
import { findExercise } from "@/lib/training";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) },
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `Request failed (${res.status}).`);
  return body;
}

export const loadAssignments = () => call<{ assignments: MemberAssignment[] }>("/api/assignments").then((r) => r.assignments);
export const answerAssignment = (id: string, accept: boolean) =>
  call(`/api/assignments/${id}`, { method: "PUT", body: JSON.stringify({ accept }) });

/** Coach edits to my programs, waiting for this app (src/lib/program-edits.ts). */
export const loadProgramEdits = () => call<{ edits: ProgramEdit[] }>("/api/program-edits").then((r) => r.edits);
export const markProgramEditApplied = async (id: string) => {
  const res = await fetch(`/api/program-edits/${id}/applied`, { method: "POST", credentials: "same-origin" });
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
};

/** One card per assignment waiting: what it is, and Use it / Not now. */
export function AssignmentCards({
  assignments,
  onUse,
  onDecline,
}: {
  assignments: MemberAssignment[];
  /** Apply it; resolves with an error message if it can't be used. */
  onUse: (a: MemberAssignment) => Promise<string | null>;
  onDecline: (a: MemberAssignment) => Promise<void>;
}) {
  return (
    <>
      {assignments.map((a) => (
        <AssignmentCard key={a.id} a={a} onUse={onUse} onDecline={onDecline} />
      ))}
    </>
  );
}

function AssignmentCard({
  a,
  onUse,
  onDecline,
}: {
  a: MemberAssignment;
  onUse: (a: MemberAssignment) => Promise<string | null>;
  onDecline: (a: MemberAssignment) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const isProgram = a.kind === "program";
  const act = async (fn: () => Promise<string | null | void>) => {
    setBusy(true);
    setError(null);
    try {
      const err = await fn();
      if (err) setError(err);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't do that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardContent className="space-y-3 p-4 sm:p-6">
        <div className="flex items-start gap-3">
          {isProgram ? <Dumbbell className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> : <ListChecks className="mt-0.5 h-5 w-5 shrink-0 text-primary" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {isProgram ? "Your coach sent you a program" : "Your coach set new daily habits"}: {a.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {isProgram
                ? `${a.program?.days.map((d) => d.name).join(" · ") ?? ""}. It becomes your active program; your own programs stay.`
                : `${a.habits?.length ?? 0} habits. They replace your current list; past ticks and streaks stay.`}{" "}
              <button type="button" className="underline underline-offset-2" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                {open ? "Hide" : "See it"}
              </button>
            </p>
            {a.note ? <p className="mt-1.5 whitespace-pre-line text-xs italic">&ldquo;{a.note}&rdquo;</p> : null}
            {open ? (
              isProgram && a.program ? (
                <ul className="mt-2 space-y-1.5 text-xs">
                  {a.program.days.map((d) => (
                    <li key={d.id}>
                      <span className="font-medium">{d.name}:</span>{" "}
                      <span className="text-muted-foreground">
                        {d.exercises.map((e) => `${findExercise(e.exerciseId, [])?.name ?? "Exercise"} ${e.sets}×${e.repsMin === e.repsMax ? e.repsMin : `${e.repsMin}–${e.repsMax}`}`).join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : a.habits ? (
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {a.habits.map((h) => (
                    <li key={h.id}>• {h.name}{h.kind === "count" ? ` (${h.target} ${h.unit ?? ""})` : ""}</li>
                  ))}
                </ul>
              ) : null
            ) : null}
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => void act(() => onUse(a))}>
            {isProgram ? "Add to my training" : "Use these habits"}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => onDecline(a))}>
            Not now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
