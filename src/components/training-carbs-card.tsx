"use client";

import * as React from "react";
import { trainingDaySplit, type TrainingToday } from "@/lib/training-carbs";
import { cn } from "@/lib/utils";

/**
 * Food, today, on a training day (src/lib/training-carbs.ts): where to put
 * the day's carbs around the workout. The day's targets don't change. Shown
 * from a chip on the Food log's summary ("Training day · Upper A"); on a day
 * without a planned or logged workout the chip asks "Training today?".
 */

/** The chip's words for today's training. */
export function trainingChipLabel(training: TrainingToday): string {
  if (!training) return "Training today?";
  if (training.kind === "done") return `${training.name} done · refuel`;
  if (training.kind === "live") return `${training.name} in progress`;
  return `Training day · ${training.name}`;
}

/** Before and after (or, once done, the next meal): carbs and protein. */
export function TrainingCarbsPanel({ training, target }: { training: TrainingToday; target: { carbs: number; protein: number } }) {
  if (target.carbs <= 0) return null;
  const split = trainingDaySplit(target);
  const done = training?.kind === "done";
  const rows = done
    ? [{ label: "Your next meal", carbs: split.post.carbs, protein: split.post.protein, when: "within about 2 hours" }]
    : [
        { label: "Before", carbs: split.pre.carbs, protein: split.pre.protein, when: "1–3 hours before" },
        { label: "After", carbs: split.post.carbs, protein: split.post.protein, when: "within about 2 hours" },
      ];
  return (
    <div className="space-y-2">
      <div className={cn("grid gap-2", rows.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
        {rows.map((r) => (
          <div key={r.label} className="rounded-md bg-muted/40 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{r.label}</p>
            <p className="tabular text-sm">
              <span className="font-semibold text-macro-carb">{r.carbs} g</span> carbs ·{" "}
              <span className="font-semibold text-macro-protein">{r.protein} g</span> protein
            </p>
            <p className="text-[11px] text-muted-foreground">{r.when}</p>
          </div>
        ))}
      </div>
      <p className="tabular text-[12px] text-muted-foreground">
        Same totals for the day. The other {done ? split.rest + split.pre.carbs : split.rest} g of carbs go in your other meals.
        {done ? "" : " Keep fat lower in the meal before, so it digests in time."}
      </p>
    </div>
  );
}
