"use client";

import * as React from "react";
import { Clock, Dumbbell, Pencil, Save, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExerciseThumb } from "@/components/exercise-art";
import { ProgramEditor } from "@/components/program-editor";
import { formatShort } from "@/lib/dates";
import type { MemberTraining } from "@/lib/program-edits";
import { findExercise, formatTarget, type Program } from "@/lib/training";
import { cn } from "@/lib/utils";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? "Something went wrong. Try again.");
  return body;
}

/**
 * Coach dashboard → a member → their workout program. The coach can edit the
 * name, days and exercises of any program the member has; the edit reaches the
 * member's app the next time it opens (src/lib/program-edits.ts).
 */
export function MemberProgramCard({ companyId, memberId, memberName }: { companyId: string; memberId: string; memberName: string }) {
  const [data, setData] = React.useState<MemberTraining | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [programId, setProgramId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Program | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const first = memberName.split(" ")[0] || memberName;

  const load = React.useCallback(async () => {
    try {
      const r = await call<{ training: MemberTraining }>(
        `/api/coach/member-training?company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}`,
      );
      setData(r.training);
      setLoadError(null);
      setProgramId((prev) =>
        prev && r.training.programs.some((p) => p.id === prev) ? prev : (r.training.activeProgramId ?? r.training.programs[0]?.id ?? null),
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Couldn't load their program.");
    }
  }, [companyId, memberId]);

  React.useEffect(() => {
    setData(null);
    setEditing(null);
    setMessage(null);
    void load();
  }, [load]);

  const program = data?.programs.find((p) => p.id === programId) ?? null;
  const pendingSince = program ? data?.pending[program.id] : undefined;

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setMessage(null);
    try {
      const r = await call<{ notified: boolean }>("/api/coach/member-training", {
        method: "PUT",
        body: JSON.stringify({ company: companyId, member: memberId, program: editing }),
      });
      setEditing(null);
      await load();
      setMessage({
        ok: true,
        text: r.notified
          ? `Saved. ${first} got a notification, and it updates in their app next time they open it.`
          : `Saved. It updates in ${first}'s app next time they open it.`,
      });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't save. Try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Dumbbell className="h-4 w-4 text-primary" />
          Training program
        </CardTitle>
        <CardDescription>
          Edit {first}&apos;s program here. Changes reach their app the next time they open it; workouts they already logged stay as they were.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
        ) : !data ? (
          <div className="h-24 animate-pulse rounded-md bg-muted/30" aria-busy="true" />
        ) : data.programs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {first} hasn&apos;t set up a program yet. You can send one from <span className="font-medium text-foreground">Assign</span>.
          </p>
        ) : editing ? (
          <div className="space-y-3">
            <ProgramEditor
              program={editing}
              custom={data.customExercises}
              defaultRest={data.restSec}
              onChange={setEditing}
              title={`Edit ${first}'s program`}
              description="New exercises come from the app's library. Their own exercises already in the program can stay."
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={saving} onClick={() => void save()}>
                <Save />
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button variant="ghost" size="sm" disabled={saving} onClick={() => setEditing(null)}>
                <X />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            {data.programs.length > 1 ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Their programs">
                {data.programs.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={p.id === programId}
                    onClick={() => setProgramId(p.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      p.id === programId ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50",
                    )}
                  >
                    {p.name}
                    {p.id === data.activeProgramId ? " · active" : ""}
                  </button>
                ))}
              </div>
            ) : null}

            {program ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-semibold">
                    {program.name}
                    {program.id === data.activeProgramId ? <Badge variant="secondary">Active</Badge> : null}
                  </p>
                  <Button variant="outline" size="sm" onClick={() => (setMessage(null), setEditing(program))}>
                    <Pencil />
                    Edit program
                  </Button>
                </div>
                {pendingSince ? (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Your changes from {formatShort(pendingSince.slice(0, 10))} reach {first}&apos;s app next time they open it.
                  </p>
                ) : null}
                <ol className="space-y-3">
                  {program.days.map((d, i) => (
                    <li key={d.id} className="rounded-md border border-border p-3">
                      <p className="mb-2 text-sm font-medium">
                        <span className="text-muted-foreground">Day {i + 1} · </span>
                        {d.name}
                      </p>
                      {d.exercises.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No exercises yet.</p>
                      ) : (
                        <ul className="space-y-1.5 text-sm">
                          {d.exercises.map((pe, j) => (
                            <li key={`${pe.exerciseId}-${j}`} className="flex items-center gap-2.5">
                              <ExerciseThumb exerciseId={pe.exerciseId} className="h-7 w-7" />
                              <span className="min-w-0 flex-1 truncate">{findExercise(pe.exerciseId, data.customExercises)?.name ?? "Exercise"}</span>
                              <span className="tabular shrink-0 text-muted-foreground">{formatTarget(pe)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </>
        )}
        {message ? (
          <p role={message.ok ? "status" : "alert"} className={cn("text-xs", message.ok ? "text-success" : "text-destructive")}>
            {message.text}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
