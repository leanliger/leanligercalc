"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, ClipboardList } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExerciseThumb } from "@/components/exercise-art";
import { ExerciseProgress } from "@/components/exercise-progress";
import { LiftProgressCard } from "@/components/lift-progress";
import { StrengthTrendsCard } from "@/components/strength-trends-card";
import { MuscleVolumeCard } from "@/components/muscle-volume-card";
import { formatLong, todayISO } from "@/lib/dates";
import type { Exercise } from "@/lib/exercises";
import {
  doneSets,
  findExercise,
  formatDuration,
  formatSetEffort,
  formatWork,
  summarizeWorkout,
  type Workout,
} from "@/lib/training";
import type { WeightUnit } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Coach dashboard → a member → Training, one section at a time (`view`):
 * lift progress (strength trends and the Lift progress chart), the workout
 * log (each exercise's sets: weight × reps, and reps left when they record
 * it) or sets per muscle; any lift opens its own page with its charts and
 * history. Read-only; only while the member shares their progress
 * (worker/program-edits.ts coachMemberWorkouts).
 */

const PAGE = 10;

export function MemberWorkoutsCard({
  companyId,
  memberId,
  memberName,
  unit,
  view = "progress",
}: {
  companyId: string;
  memberId: string;
  memberName: string;
  unit: WeightUnit;
  view?: "progress" | "log" | "muscles";
}) {
  const [data, setData] = React.useState<{ workouts: Workout[]; customExercises: Exercise[] } | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [exerciseId, setExerciseId] = React.useState<string | null>(null);
  const first = memberName.split(" ")[0] || memberName;
  // A new section closes any lift page that was open.
  React.useEffect(() => setExerciseId(null), [view]);

  React.useEffect(() => {
    let live = true;
    setData(null);
    setLoadError(null);
    setExerciseId(null);
    fetch(`/api/coach/member-workouts?company=${encodeURIComponent(companyId)}&member=${encodeURIComponent(memberId)}`, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { workouts?: Workout[]; customExercises?: Exercise[]; error?: string } | null;
        if (!res.ok || !body?.workouts) throw new Error(body?.error ?? "Couldn't load their workouts.");
        if (live) setData({ workouts: body.workouts, customExercises: body.customExercises ?? [] });
      })
      .catch((e: unknown) => {
        if (live) setLoadError(e instanceof Error ? e.message : "Couldn't load their workouts.");
      });
    return () => {
      live = false;
    };
  }, [companyId, memberId]);

  if (loadError) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">{loadError}</CardContent>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Loading {first}&apos;s workouts…</CardContent>
      </Card>
    );
  }

  const exercise = exerciseId ? findExercise(exerciseId, data.customExercises) : undefined;
  if (exercise) {
    return (
      <ExerciseProgress
        exercise={exercise}
        workouts={data.workouts.filter((w) => w.finishedAt !== null)}
        unit={unit}
        onBack={() => setExerciseId(null)}
        backLabel={`${first}'s workouts`}
      />
    );
  }

  return (
    <div className="space-y-5">
      {view === "progress" ? (
        <>
          <StrengthTrendsCard workouts={data.workouts} unit={unit} today={todayISO()} onOpen={setExerciseId} who={first} />
          <LiftProgressCard workouts={data.workouts} custom={data.customExercises} unit={unit} onOpen={setExerciseId} />
        </>
      ) : view === "muscles" ? (
        <MuscleVolumeCard workouts={data.workouts} customExercises={data.customExercises} today={todayISO()} name={first} />
      ) : (
        <WorkoutLog workouts={data.workouts} custom={data.customExercises} unit={unit} name={first} onOpenExercise={setExerciseId} />
      )}
    </div>
  );
}

function WorkoutLog({
  workouts,
  custom,
  unit,
  name,
  onOpenExercise,
}: {
  workouts: Workout[];
  custom: Exercise[];
  unit: WeightUnit;
  name: string;
  onOpenExercise: (id: string) => void;
}) {
  const [shown, setShown] = React.useState(PAGE);
  const [open, setOpen] = React.useState<string | null>(workouts[0]?.id ?? null);
  const finished = workouts.filter((w) => w.finishedAt !== null).length;

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-primary" />
          Workout log
        </CardTitle>
        <CardDescription>
          {workouts.length === 0
            ? `${name} hasn't logged a workout yet.`
            : `${finished} finished workout${finished === 1 ? "" : "s"}, newest first. Tap one for every set; tap an exercise for its charts.`}
        </CardDescription>
      </CardHeader>
      {workouts.length > 0 ? (
        <CardContent className="space-y-2">
          <ul className="divide-y divide-border rounded-md border border-border">
            {workouts.slice(0, shown).map((w) => {
              const s = summarizeWorkout(w);
              const isOpen = open === w.id;
              return (
                <li key={w.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : w.id)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
                        {w.name || "Workout"}
                        {w.finishedAt === null ? <Badge variant="secondary">In progress</Badge> : null}
                      </span>
                      <span className="tabular block text-[12px] text-muted-foreground">
                        {formatLong(w.date)} · {s.sets} sets · {formatWork(s, unit)}
                        {s.durationMs ? ` · ${formatDuration(s.durationMs)}` : ""}
                      </span>
                    </span>
                  </button>
                  {isOpen ? <WorkoutDetail workout={w} custom={custom} unit={unit} onOpenExercise={onOpenExercise} /> : null}
                </li>
              );
            })}
          </ul>
          {workouts.length > shown ? (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => setShown((n) => n + PAGE * 2)}>
              Show more ({workouts.length - shown} older)
            </Button>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

function WorkoutDetail({
  workout,
  custom,
  unit,
  onOpenExercise,
}: {
  workout: Workout;
  custom: Exercise[];
  unit: WeightUnit;
  onOpenExercise: (id: string) => void;
}) {
  const rows = workout.exercises.map((e) => ({ e, sets: doneSets(e), ex: findExercise(e.exerciseId, custom) })).filter((r) => r.sets.length > 0);
  return (
    <div className="space-y-2.5 border-t border-border bg-muted/20 px-3 py-3">
      {rows.length === 0 ? <p className="text-xs text-muted-foreground">No sets ticked off.</p> : null}
      {rows.map(({ e, sets, ex }, i) => (
        <div key={`${e.exerciseId}-${i}`} className="flex gap-2.5">
          <ExerciseThumb exerciseId={e.exerciseId} className="mt-0.5 h-7 w-7 shrink-0" />
          <div className="min-w-0 flex-1">
            {ex ? (
              <button
                type="button"
                onClick={() => onOpenExercise(e.exerciseId)}
                className="text-left text-sm font-medium underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {e.name}
              </button>
            ) : (
              <p className="text-sm font-medium">{e.name}</p>
            )}
            <div className="mt-1 flex flex-wrap gap-1">
              {sets.map((set, j) => (
                <span
                  key={j}
                  className={cn("tabular rounded border border-border bg-background px-1.5 py-0.5 text-[12px]")}
                >
                  {formatSetEffort(set, unit, e.bodyweight)}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
      {workout.note ? <p className="text-xs italic text-muted-foreground">&ldquo;{workout.note}&rdquo;</p> : null}
    </div>
  );
}
