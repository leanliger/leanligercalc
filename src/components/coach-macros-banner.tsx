"use client";

import { UserCheck } from "lucide-react";
import type { CoachMacros } from "@/lib/coach-macros";
import { formatShort } from "@/lib/dates";

/** Shown on Plan → Macros and Roadmap while the coach's macros replace the plan's. */
export function CoachMacrosBanner({ macros }: { macros: CoachMacros }) {
  return (
    <div className="mb-5 flex gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
      <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        <p className="font-semibold">
          Your coach set your macros:{" "}
          <span className="tabular">
            {macros.kcal.toLocaleString()} kcal · P {macros.protein} g · C {macros.carbs} g · F {macros.fat} g
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Your Food log, Today and habits use these every day (set {formatShort(macros.setAt.slice(0, 10))}). The plan below
          isn&apos;t in use until your coach clears them.
        </p>
        {macros.note ? <p className="text-xs italic">&ldquo;{macros.note}&rdquo;</p> : null}
      </div>
    </div>
  );
}
