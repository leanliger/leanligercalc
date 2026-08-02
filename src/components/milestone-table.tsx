"use client";

import * as React from "react";
import { ChevronDown, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { WeekProjection, WeightUnit } from "@/lib/types";
import { formatShort } from "@/lib/dates";
import { formatWeight } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLLAPSED_ROWS = 12;

interface MilestoneTableProps {
  projection: WeekProjection[];
  unit: WeightUnit;
}

export function MilestoneTable({ projection, unit }: MilestoneTableProps) {
  const [expanded, setExpanded] = React.useState(false);

  if (projection.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No milestones to show yet.
      </p>
    );
  }

  const truncated = !expanded && projection.length > COLLAPSED_ROWS;
  const rows = truncated ? projection.slice(0, COLLAPSED_ROWS) : projection;
  const lastWeek = projection[projection.length - 1]!.week;

  return (
    <div className="space-y-3">
      <div className="scrollbar-thin overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <caption className="sr-only">
            Week-by-week projected body weight, body fat, cumulative loss, and calorie
            targets.
          </caption>
          <thead>
            <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Week
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Date
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Weight
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Body fat
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Weekly loss
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Total lost
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Intake
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Trigger
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((week) => {
              const isFinal = week.week === lastWeek;
              const isCheckpoint = week.week > 0 && week.week % 4 === 0;
              return (
                <tr
                  key={week.week}
                  className={cn(
                    "border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40",
                    isCheckpoint && "bg-muted/25",
                    isFinal && "bg-success/10 font-medium",
                  )}
                >
                  <th
                    scope="row"
                    className="px-3 py-2 text-left font-medium tabular text-muted-foreground"
                  >
                    {week.week}
                  </th>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {formatShort(week.date)}
                  </td>
                  <td className="px-3 py-2 text-right tabular font-medium">
                    {formatWeight(week.weight, unit, 1, false)}
                  </td>
                  <td className="px-3 py-2 text-right tabular">{week.bodyFat}%</td>
                  <td className="px-3 py-2 text-right tabular text-muted-foreground">
                    {week.weeklyLoss > 0
                      ? `−${formatWeight(week.weeklyLoss, unit, 2, false)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular">
                    {week.cumulativeLoss > 0
                      ? `−${formatWeight(week.cumulativeLoss, unit, 1, false)}`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular">
                    <span className={cn(week.deficitClamped && "text-warning")}>
                      {week.targetCalories.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {week.note ? (
                      <span className="inline-flex items-center gap-1">
                        {isFinal ? <TrendingDown className="h-3 w-3 text-success" /> : null}
                        {week.note}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {projection.length > COLLAPSED_ROWS ? (
        <div className="flex items-center justify-between gap-3">
          {/* Row 0 is the pre-diet baseline, so the row count is one higher
              than the prep duration — label by week number, not row count. */}
          <Badge variant="secondary">
            {expanded
              ? `Weeks 0–${lastWeek}`
              : `Weeks 0–${rows[rows.length - 1]?.week ?? 0} of 0–${lastWeek}`}
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => setExpanded((prev) => !prev)}>
            <ChevronDown className={cn("transition-transform", expanded && "rotate-180")} />
            {expanded ? "Collapse" : `Show all ${lastWeek} weeks`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
