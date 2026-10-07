"use client";

import * as React from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Plus, Star, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmButton } from "@/components/confirm-button";
import { ExercisePicker } from "@/components/exercise-library";
import type { Exercise } from "@/lib/exercises";
import {
  DAY_NAME_MAX,
  MAX_DAYS,
  MAX_DAY_EXERCISES,
  MAX_REPS,
  MAX_SETS,
  NAME_MAX,
  findExercise,
  formatRest,
  nextDayId,
  type Program,
  type ProgramDay,
  type ProgramExercise,
} from "@/lib/training";

const REST_OPTIONS = [60, 90, 120, 150, 180, 240, 300];

/** A whole number input that only reports valid values. */
function IntInput({
  value,
  min,
  max,
  onChange,
  label,
  className,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
  className?: string;
}) {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => setText(String(value)), [value]);
  return (
    <Input
      value={text}
      inputMode="numeric"
      aria-label={label}
      className={className}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (Number.isInteger(n) && n >= min && n <= max) onChange(n);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}

export function ProgramEditor({
  program,
  custom,
  defaultRest,
  isActive,
  onChange,
  onMakeActive,
  onDelete,
  onBack,
  onAddCustom,
}: {
  program: Program;
  custom: readonly Exercise[];
  defaultRest: number;
  isActive: boolean;
  onChange: (p: Program) => void;
  onMakeActive: () => void;
  onDelete: () => void;
  onBack: () => void;
  onAddCustom: (e: Exercise) => void;
}) {
  const [name, setName] = React.useState(program.name);
  const [picking, setPicking] = React.useState<string | null>(null);

  const setDay = (id: string, patch: Partial<ProgramDay>) =>
    onChange({ ...program, days: program.days.map((d) => (d.id === id ? { ...d, ...patch } : d)) });

  const moveDay = (i: number, dir: -1 | 1) => {
    const days = [...program.days];
    const j = i + dir;
    if (j < 0 || j >= days.length) return;
    [days[i], days[j]] = [days[j]!, days[i]!];
    onChange({ ...program, days });
  };

  const addDay = () => {
    const id = nextDayId(program);
    onChange({ ...program, days: [...program.days, { id, name: `Day ${program.days.length + 1}`, exercises: [] }] });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" onClick={onBack}>
        <ArrowLeft />
        Back to training
      </Button>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg">Edit program</CardTitle>
            {isActive ? (
              <Badge variant="success">
                <Check />
                Active
              </Badge>
            ) : (
              <Button variant="outline" size="sm" onClick={onMakeActive}>
                <Star />
                Make active
              </Button>
            )}
          </div>
          <CardDescription>Changes save as you go. Workouts you&apos;ve already logged don&apos;t change.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1.5">
          <Label htmlFor="program-name">Program name</Label>
          <Input
            id="program-name"
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => {
              setName(e.target.value);
              if (e.target.value.trim()) onChange({ ...program, name: e.target.value });
            }}
            onBlur={() => setName(program.name)}
          />
        </CardContent>
      </Card>

      {program.days.map((day, i) => (
        <Card key={day.id}>
          <CardHeader className="space-y-3 p-4 pb-2 sm:p-6 sm:pb-2">
            <div className="flex items-center gap-2">
              <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <DayName day={day} onRename={(n) => setDay(day.id, { name: n })} />
              <div className="flex shrink-0 items-center">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => moveDay(i, -1)} aria-label={`Move ${day.name} up`}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === program.days.length - 1} onClick={() => moveDay(i, 1)} aria-label={`Move ${day.name} down`}>
                  <ArrowDown />
                </Button>
                <ConfirmButton
                  size="icon"
                  className="h-8 w-8"
                  label={<span className="sr-only">Remove {day.name}</span>}
                  icon={<Trash2 />}
                  confirmLabel="Remove day"
                  onConfirm={() => onChange({ ...program, days: program.days.filter((d) => d.id !== day.id) })}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 p-4 pt-2 sm:p-6 sm:pt-2">
            {day.exercises.length === 0 ? (
              <p className="text-sm text-muted-foreground">No exercises yet.</p>
            ) : (
              <ul className="space-y-2">
                {day.exercises.map((pe, j) => (
                  <ExerciseRow
                    key={`${pe.exerciseId}-${j}`}
                    pe={pe}
                    name={findExercise(pe.exerciseId, custom)?.name ?? "Deleted exercise"}
                    first={j === 0}
                    last={j === day.exercises.length - 1}
                    defaultRest={defaultRest}
                    onChange={(next) => setDay(day.id, { exercises: day.exercises.map((x, k) => (k === j ? next : x)) })}
                    onMove={(dir) => {
                      const list = [...day.exercises];
                      const k = j + dir;
                      [list[j], list[k]] = [list[k]!, list[j]!];
                      setDay(day.id, { exercises: list });
                    }}
                    onRemove={() => setDay(day.id, { exercises: day.exercises.filter((_, k) => k !== j) })}
                  />
                ))}
              </ul>
            )}
            {picking === day.id ? (
              <ExercisePicker
                custom={custom}
                onClose={() => setPicking(null)}
                onAddCustom={onAddCustom}
                exclude={day.exercises.map((e) => e.exerciseId)}
                onPick={(e) => {
                  setPicking(null);
                  setDay(day.id, {
                    exercises: [...day.exercises, { exerciseId: e.id, sets: 3, repsMin: 8, repsMax: 12, restSec: null }],
                  });
                }}
              />
            ) : day.exercises.length < MAX_DAY_EXERCISES ? (
              <Button variant="outline" size="sm" onClick={() => setPicking(day.id)}>
                <Plus />
                Add exercise
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" onClick={addDay} disabled={program.days.length >= MAX_DAYS}>
          <Plus />
          Add day
        </Button>
        <ConfirmButton label="Delete program" icon={<Trash2 />} confirmLabel="Yes, delete this program" onConfirm={onDelete} />
      </div>
      <Button className="w-full sm:w-auto" onClick={onBack}>
        <Check />
        Done
      </Button>
    </div>
  );
}

function DayName({ day, onRename }: { day: ProgramDay; onRename: (name: string) => void }) {
  const [text, setText] = React.useState(day.name);
  return (
    <Input
      value={text}
      maxLength={DAY_NAME_MAX}
      aria-label="Day name"
      className="h-9 min-w-0 flex-1 font-semibold"
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value.trim()) onRename(e.target.value);
      }}
      onBlur={() => setText(day.name)}
    />
  );
}

function ExerciseRow({
  pe,
  name,
  first,
  last,
  defaultRest,
  onChange,
  onMove,
  onRemove,
}: {
  pe: ProgramExercise;
  name: string;
  first: boolean;
  last: boolean;
  defaultRest: number;
  onChange: (pe: ProgramExercise) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <li className="space-y-2 rounded-md border border-border p-2.5">
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${name} up`}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${name} down`}>
          <ArrowDown />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove} aria-label={`Remove ${name}`}>
          <Trash2 />
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 text-xs">
        <label className="space-y-1">
          <span className="block text-muted-foreground">Sets</span>
          <IntInput value={pe.sets} min={1} max={MAX_SETS} onChange={(sets) => onChange({ ...pe, sets })} label={`${name} sets`} className="h-8 w-14 px-2 text-center" />
        </label>
        <div className="space-y-1">
          <span className="block text-muted-foreground">Reps</span>
          <div className="flex items-center gap-1">
            <IntInput
              value={pe.repsMin}
              min={1}
              max={MAX_REPS}
              onChange={(repsMin) => onChange({ ...pe, repsMin, repsMax: Math.max(repsMin, pe.repsMax) })}
              label={`${name} fewest reps`}
              className="h-8 w-14 px-2 text-center"
            />
            <span className="text-muted-foreground">to</span>
            <IntInput
              value={pe.repsMax}
              min={1}
              max={MAX_REPS}
              onChange={(repsMax) => onChange({ ...pe, repsMax, repsMin: Math.min(repsMax, pe.repsMin) })}
              label={`${name} most reps`}
              className="h-8 w-14 px-2 text-center"
            />
          </div>
        </div>
        <div className="space-y-1">
          <span className="block text-muted-foreground">Rest</span>
          <Select
            value={pe.restSec === null ? "default" : String(pe.restSec)}
            onValueChange={(v) => onChange({ ...pe, restSec: v === "default" ? null : Number(v) })}
          >
            <SelectTrigger className="h-8 w-[8.5rem] text-xs" aria-label={`${name} rest`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default ({formatRest(defaultRest)})</SelectItem>
              {REST_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {formatRest(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </li>
  );
}
