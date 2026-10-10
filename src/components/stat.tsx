import * as React from "react";
import { cn } from "@/lib/utils";

interface StatProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  /** Highlights the primary answer of a panel. */
  emphasis?: boolean;
  /** Smaller padding and type, so four fit two by two on a phone. */
  compact?: boolean;
  className?: string;
}

export function Stat({ label, value, sub, icon, emphasis, compact, className }: StatProps) {
  return (
    <div
      className={cn(
        "rounded-lg border",
        compact ? "p-2.5" : "p-4",
        emphasis ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 font-medium uppercase tracking-wide text-muted-foreground",
          compact ? "text-[11px]" : "text-xs",
        )}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          "tabular font-semibold leading-tight",
          compact ? "mt-1" : "mt-1.5",
          emphasis ? (compact ? "text-lg text-primary" : "text-2xl text-primary") : compact ? "text-base" : "text-xl",
        )}
      >
        {value}
      </div>
      {sub ? (
        <div className={cn("text-muted-foreground", compact ? "mt-0.5 text-[11px] leading-snug" : "mt-1 text-xs")}>{sub}</div>
      ) : null}
    </div>
  );
}
