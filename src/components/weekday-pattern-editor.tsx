"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DAY_LABELS } from "@/lib/carb-cycling";
import type { DayType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { WEEKDAY_SHORT, countsFromPattern, cycleDayType } from "@/lib/weekday-pattern";

const LETTER: Record<DayType, string> = { high: "H", medium: "M", low: "L" };

export type WeekdayEditorStyles = Record<DayType, { chip: string; letter: string }>;

/** Default: the gold brand ramp, letters in the day colour. */
const BRAND_STYLES: WeekdayEditorStyles = {
  high: { chip: "border-day-high/60 bg-day-high/15 text-day-high", letter: "" },
  medium: { chip: "border-day-medium/50 bg-day-medium/10 text-day-medium", letter: "" },
  low: { chip: "border-day-low/50 bg-day-low/10 text-day-low", letter: "" },
};

interface WeekdayPatternEditorProps {
  pattern: DayType[];
  /** True when the pattern was hand-edited rather than auto-placed. */
  isCustom: boolean;
  onChange: (pattern: DayType[]) => void;
  onReset: () => void;
  /** Override the chip palette, e.g. the roadmap's red / yellow / green. */
  styles?: WeekdayEditorStyles;
  className?: string;
}

/**
 * Seven weekday chips, Monday first. Clicking one cycles it high → medium →
 * low. The schedule counts follow the pattern, so editing here also updates
 * the "2 / 3 / 2" totals on the Carb Cycling tab.
 */
export function WeekdayPatternEditor({
  pattern,
  isCustom,
  onChange,
  onReset,
  styles = BRAND_STYLES,
  className,
}: WeekdayPatternEditorProps) {
  const counts = countsFromPattern(pattern);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Tap a day to switch it. Put high days on your hardest sessions.
        </span>
        {isCustom ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={onReset}
          >
            <RotateCcw />
            Auto
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-7 gap-1" role="group" aria-label="Day type for each weekday">
        {pattern.map((type, index) => {
          const style = styles[type];
          const weekday = WEEKDAY_SHORT[index] ?? "";
          return (
            <button
              key={index}
              type="button"
              onClick={() => {
                const next = [...pattern];
                next[index] = cycleDayType(type);
                onChange(next);
              }}
              aria-label={`${weekday}: ${DAY_LABELS[type]}. Activate to change.`}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md border py-1.5 transition-colors",
                "hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                style.chip,
              )}
            >
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {weekday}
              </span>
              <span
                className={cn(
                  "rounded px-1 text-sm font-semibold leading-5",
                  style.letter,
                )}
              >
                {LETTER[type]}
              </span>
            </button>
          );
        })}
      </div>

      <p className="tabular text-[11px] text-muted-foreground">
        {counts.high} high · {counts.medium} medium · {counts.low} low
      </p>
    </div>
  );
}
