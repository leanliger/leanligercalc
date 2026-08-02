import * as React from "react";
import { cn } from "@/lib/utils";

interface StatProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  /** Highlights the primary answer of a panel. */
  emphasis?: boolean;
  className?: string;
}

export function Stat({ label, value, sub, icon, emphasis, className }: StatProps) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        emphasis ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={cn(
          "mt-1.5 tabular font-semibold leading-tight",
          emphasis ? "text-2xl text-primary" : "text-xl",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
