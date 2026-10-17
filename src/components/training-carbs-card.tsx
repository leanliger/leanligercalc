"use client";

import * as React from "react";
import { Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trainingDaySplit, type TrainingToday } from "@/lib/training-carbs";
import { cn } from "@/lib/utils";

/**
 * Food, today, on a training day (src/lib/training-carbs.ts): where to put
 * the day's carbs around the workout. The day's targets don't change. On a
 * day without a planned or logged workout it folds to one line, for members
 * who train without a calendar.
 */
export function TrainingCarbsCard({ training, target }: { training: TrainingToday; target: { carbs: number; protein: number } }) {
  const [open, setOpen] = React.useState(false);
  if (target.carbs <= 0) return null;
  const split = trainingDaySplit(target);
  const known = training !== null;

  if (!known && !open) {
    return (
      <Button variant="ghost" size="sm" className="h-8 w-full justify-start px-2 text-muted-foreground" onClick={() => setOpen(true)}>
        <Dumbbell />
        Training today? See where to put your carbs
      </Button>
    );
  }

  const done = training?.kind === "done";
  const rows = done
    ? [{ label: "Your next meal", carbs: split.post.carbs, protein: split.post.protein, when: "within about 2 hours" }]
    : [
        { label: "Before", carbs: split.pre.carbs, protein: split.pre.protein, when: "1–3 hours before" },
        { label: "After", carbs: split.post.carbs, protein: split.post.protein, when: "within about 2 hours" },
      ];

  return (
    <section aria-label="Training-day carbs" className="space-y-2.5 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Dumbbell className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {training?.kind === "done"
              ? `${training.name} done: refuel`
              : training?.kind === "live"
                ? `${training.name} in progress`
                : training?.kind === "planned"
                  ? `Training day: ${training.name}`
                  : "Training day"}
          </p>
          <p className="text-[12px] text-muted-foreground">Same totals for the day; more of the carbs go around the workout.</p>
        </div>
      </div>
      <div className={cn("grid gap-2", rows.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
        {rows.map((r) => (
          <div key={r.label} className="rounded-md bg-muted/40 px-3 py-2">
            <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{r.label}</p>
            <p className="tabular text-sm">
              <span className="text-base font-semibold text-macro-carb">{r.carbs} g</span> carbs ·{" "}
              <span className="font-semibold text-macro-protein">{r.protein} g</span> protein
            </p>
            <p className="text-[12px] text-muted-foreground">{r.when}</p>
          </div>
        ))}
      </div>
      <p className="tabular text-[12px] text-muted-foreground">
        The other {done ? split.rest + split.pre.carbs : split.rest} g of carbs go in your other meals.
        {done ? "" : " Keep fat lower in the meal before, so it digests in time."}
      </p>
    </section>
  );
}
