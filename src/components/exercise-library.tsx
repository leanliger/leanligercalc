"use client";

import * as React from "react";
import { BookOpen, ChevronRight, Plus, Search, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatShort } from "@/lib/dates";
import { EQUIPMENT, EQUIPMENT_LABELS, MUSCLES, MUSCLE_LABELS, type Equipment, type Exercise, type Muscle } from "@/lib/exercises";
import {
  CUE_MAX,
  NAME_MAX,
  allExercises,
  e1rm,
  doneSets,
  formatLoad,
  isValidVideoUrl,
  sanitizeCustomExercise,
  type Workout,
} from "@/lib/training";
import type { WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

type MuscleFilter = Muscle | "all";

function matches(e: Exercise, query: string, muscle: MuscleFilter): boolean {
  if (muscle !== "all" && e.muscle !== muscle) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((word) =>
    `${e.name} ${MUSCLE_LABELS[e.muscle]} ${EQUIPMENT_LABELS[e.equipment]}`.toLowerCase().includes(word),
  );
}

function SearchRow({
  query,
  onQuery,
  muscle,
  onMuscle,
  autoFocus,
}: {
  query: string;
  onQuery: (q: string) => void;
  muscle: MuscleFilter;
  onMuscle: (m: MuscleFilter) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search exercises"
          aria-label="Search exercises"
          className="pl-8"
          autoFocus={autoFocus}
        />
      </div>
      <Select value={muscle} onValueChange={(v) => onMuscle(v as MuscleFilter)}>
        <SelectTrigger className="w-[8.5rem] shrink-0" aria-label="Muscle group">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All muscles</SelectItem>
          {MUSCLES.map((m) => (
            <SelectItem key={m} value={m}>
              {MUSCLE_LABELS[m]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const meta = (e: Exercise) => `${MUSCLE_LABELS[e.muscle]} · ${EQUIPMENT_LABELS[e.equipment]}${e.custom ? " · yours" : ""}`;

/* ------------------------------ picking one ------------------------------ */

/** Search the library and pick an exercise (programs and workouts). */
export function ExercisePicker({
  custom,
  onPick,
  onClose,
  onAddCustom,
  title = "Add an exercise",
  exclude = [],
  initialMuscle = "all",
  footer,
  allowCustom = true,
}: {
  custom: readonly Exercise[];
  onPick: (e: Exercise) => void;
  onClose: () => void;
  /** Save a member's own exercise; returns it once saved. */
  onAddCustom: (e: Exercise) => void;
  title?: string;
  /** Ids already in the list, shown as added. */
  exclude?: readonly string[];
  /** Start filtered to one muscle (a swap shows similar exercises first). */
  initialMuscle?: MuscleFilter;
  /** Extra controls under the list. */
  footer?: React.ReactNode;
  /** Offer "Add your own" (off when a coach builds a program for many members). */
  allowCustom?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [muscle, setMuscle] = React.useState<MuscleFilter>(initialMuscle);
  const [adding, setAdding] = React.useState(false);
  const list = React.useMemo(() => allExercises(custom).filter((e) => matches(e, query, muscle)), [custom, query, muscle]);

  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>
      {adding ? (
        <CustomExerciseForm
          initialName={query}
          onCancel={() => setAdding(false)}
          onSave={(e) => {
            onAddCustom(e);
            onPick(e);
          }}
        />
      ) : (
        <>
          <SearchRow query={query} onQuery={setQuery} muscle={muscle} onMuscle={setMuscle} autoFocus />
          <ul className="scrollbar-thin max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border bg-background">
            {list.length === 0 ? (
              <li className="p-3 text-sm text-muted-foreground">No exercises match.</li>
            ) : (
              list.map((e) => {
                const added = exclude.includes(e.id);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onPick(e)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{e.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{meta(e)}</span>
                      </span>
                      {added ? <span className="shrink-0 text-[11px] text-muted-foreground">added</span> : <Plus className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          {footer}
          {allowCustom ? (
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setAdding(true)}>
              <Plus />
              Can&apos;t find it? Add your own
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

/* ---------------------------- your own exercise ---------------------------- */

export function newCustomId(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `c-${rand}`;
}

export function CustomExerciseForm({
  initial,
  initialName = "",
  onSave,
  onCancel,
}: {
  /** Editing an existing one. */
  initial?: Exercise;
  initialName?: string;
  onSave: (e: Exercise) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? initialName);
  const [muscle, setMuscle] = React.useState<Muscle>(initial?.muscle ?? "chest");
  const [equipment, setEquipment] = React.useState<Equipment>(initial?.equipment ?? "machine");
  const [video, setVideo] = React.useState(initial?.video ?? "");
  const [cue1, setCue1] = React.useState(initial?.cues[0] ?? "");
  const [cue2, setCue2] = React.useState(initial?.cues[1] ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const ids = React.useId();

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!name.trim()) return setError("Give it a name.");
    if (video.trim() && !isValidVideoUrl(video.trim())) return setError("The video link must start with https://");
    const clean = sanitizeCustomExercise({
      id: initial?.id ?? newCustomId(),
      name,
      muscle,
      equipment,
      bodyweight: equipment === "bodyweight",
      video: video.trim() || null,
      cues: [cue1, cue2],
    });
    if (!clean) return setError("Check the details and try again.");
    onSave(clean);
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-name`}>Name</Label>
        <Input id={`${ids}-name`} value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pendulum squat" autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label>Muscle</Label>
          <Select value={muscle} onValueChange={(v) => setMuscle(v as Muscle)}>
            <SelectTrigger aria-label="Muscle">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MUSCLES.map((m) => (
                <SelectItem key={m} value={m}>
                  {MUSCLE_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Equipment</Label>
          <Select value={equipment} onValueChange={(v) => setEquipment(v as Equipment)}>
            <SelectTrigger aria-label="Equipment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EQUIPMENT.map((q) => (
                <SelectItem key={q} value={q}>
                  {EQUIPMENT_LABELS[q]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {equipment === "bodyweight" ? (
        <p className="text-[11px] text-muted-foreground">Bodyweight: you log reps, plus any added weight.</p>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-video`}>
          Demo video link <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id={`${ids}-video`} value={video} onChange={(e) => setVideo(e.target.value)} placeholder="https://youtube.com/…" inputMode="url" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${ids}-cue1`}>
          Form cues <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input id={`${ids}-cue1`} value={cue1} maxLength={CUE_MAX} onChange={(e) => setCue1(e.target.value)} placeholder="e.g. Feet high on the platform" />
        <Input value={cue2} maxLength={CUE_MAX} onChange={(e) => setCue2(e.target.value)} placeholder="e.g. Pause at the bottom" aria-label="Second form cue" />
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          {initial ? "Save changes" : "Add exercise"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------ the library ------------------------------ */

interface ExerciseStats {
  sessions: number;
  last: string;
  /** Weighted: best estimated 1RM in lb. Bodyweight: most reps in a set. */
  best: number;
}

/** Per-exercise numbers for the library list. */
export function useExerciseStats(workouts: readonly Workout[]): Map<string, ExerciseStats> {
  return React.useMemo(() => {
    const map = new Map<string, ExerciseStats>();
    for (const w of workouts) {
      for (const e of w.exercises) {
        const sets = doneSets(e);
        if (sets.length === 0) continue;
        const best = e.bodyweight ? Math.max(...sets.map((s) => s.reps)) : Math.max(...sets.map((s) => e1rm(s.weight, s.reps)));
        const prev = map.get(e.exerciseId);
        map.set(e.exerciseId, {
          sessions: (prev?.sessions ?? 0) + 1,
          last: prev && prev.last > w.date ? prev.last : w.date,
          best: Math.max(prev?.best ?? 0, best),
        });
      }
    }
    return map;
  }, [workouts]);
}

export function ExerciseLibraryCard({
  custom,
  workouts,
  unit,
  onOpen,
  onAddCustom,
}: {
  custom: readonly Exercise[];
  workouts: readonly Workout[];
  unit: WeightUnit;
  onOpen: (id: string) => void;
  onAddCustom: (e: Exercise) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [muscle, setMuscle] = React.useState<MuscleFilter>("all");
  const [mineOnly, setMineOnly] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const stats = useExerciseStats(workouts);
  const list = React.useMemo(
    () =>
      allExercises(custom)
        .filter((e) => matches(e, query, muscle))
        .filter((e) => !mineOnly || stats.has(e.id)),
    [custom, query, muscle, mineOnly, stats],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          Exercise library
        </CardTitle>
        <CardDescription>Tap an exercise for form cues, a demo and your progress charts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding ? (
          <div className="rounded-lg border border-primary/40 bg-primary/[0.03] p-3">
            <p className="mb-3 text-sm font-semibold">Add your own exercise</p>
            <CustomExerciseForm
              initialName={query}
              onCancel={() => setAdding(false)}
              onSave={(e) => {
                onAddCustom(e);
                setAdding(false);
              }}
            />
          </div>
        ) : (
          <>
            <SearchRow query={query} onQuery={setQuery} muscle={muscle} onMuscle={setMuscle} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-muted/50 p-1 text-xs" role="radiogroup" aria-label="Which exercises">
                {[
                  { v: false, label: "All" },
                  { v: true, label: "Done before" },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={mineOnly === o.v}
                    onClick={() => setMineOnly(o.v)}
                    className={cn(
                      "rounded px-2.5 py-1 font-medium transition-colors",
                      mineOnly === o.v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setAdding(true)}>
                <Plus />
                Add your own
              </Button>
            </div>
            <ul className="scrollbar-thin max-h-[26rem] divide-y divide-border overflow-y-auto rounded-md border border-border">
              {list.length === 0 ? (
                <li className="p-3 text-sm text-muted-foreground">
                  {mineOnly ? "Nothing logged yet. Finish a workout and your exercises show up here." : "No exercises match."}
                </li>
              ) : (
                list.map((e) => {
                  const s = stats.get(e.id);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(e.id)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{e.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{meta(e)}</span>
                        </span>
                        {s ? (
                          <span className="shrink-0 text-right text-[11px] leading-tight text-muted-foreground">
                            <span className="tabular block font-medium text-foreground">
                              {e.bodyweight ? `${s.best} reps` : `${formatLoad(s.best, unit)} ${unit}`}
                            </span>
                            {e.bodyweight ? "best set" : "est. 1RM"} · {formatShort(s.last)}
                          </span>
                        ) : null}
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
