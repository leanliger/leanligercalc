"use client";

import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import type { TimelineWarning, TimelineWarningLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

const LEVEL_STYLES: Record<
  TimelineWarningLevel,
  { wrapper: string; icon: typeof Info; iconClass: string; role: "alert" | "status" }
> = {
  info: {
    wrapper: "border-border bg-muted/40",
    icon: Info,
    iconClass: "text-muted-foreground",
    role: "status",
  },
  warning: {
    wrapper: "border-warning/40 bg-warning/[0.09]",
    icon: AlertTriangle,
    iconClass: "text-warning",
    role: "status",
  },
  danger: {
    wrapper: "border-destructive/50 bg-destructive/[0.09]",
    icon: ShieldAlert,
    iconClass: "text-destructive",
    role: "alert",
  },
};

export function WarningList({
  warnings,
  className,
}: {
  warnings: TimelineWarning[];
  className?: string;
}) {
  if (warnings.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {warnings.map((warning, index) => {
        const style = LEVEL_STYLES[warning.level];
        const Icon = style.icon;
        return (
          <div
            key={`${warning.title}-${index}`}
            role={style.role}
            className={cn(
              "flex gap-3 rounded-lg border p-3 text-sm animate-fade-in",
              style.wrapper,
            )}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconClass)} />
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium leading-snug">{warning.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {warning.detail}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
