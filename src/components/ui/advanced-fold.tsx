"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Settings most people never change, folded away under a heading. Opens by
 * itself when one of them has been changed from its default, so a changed
 * value is never hidden.
 */
export function AdvancedFold({
  title = "Advanced",
  hint,
  changed = false,
  children,
}: {
  title?: string;
  /** A few words on what's inside, shown while it's closed. */
  hint?: string;
  /** Something inside differs from the default. */
  changed?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(changed);
  const id = React.useId();
  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-md text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          {title}
          {changed ? <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">changed</span> : null}
        </span>
        <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
          {open ? null : hint}
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open ? (
        <div id={id} className="space-y-4 pt-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}
