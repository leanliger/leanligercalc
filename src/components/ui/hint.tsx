"use client";

import * as React from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

const KEY = (id: string) => `prep-calculator:hint:${id}`;

/**
 * An explanation shown in full the first time, then folded to a small
 * "How this works" link once dismissed (remembered on this device). Keeps
 * cards about the numbers instead of paragraphs a member has already read.
 */
export function Hint({
  id,
  children,
  label = "How this works",
  className,
}: {
  /** Stable id: dismissing one hint never hides another. */
  id: string;
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  // null until storage is read, so a returning member never sees it flash open.
  const [open, setOpen] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(KEY(id)) === "1";
    } catch {
      /* storage blocked: show it */
    }
    setOpen(!seen);
  }, [id]);

  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(KEY(id), "1");
    } catch {
      /* fine: it shows again next visit */
    }
  };

  if (open === null) return null;
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Info className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  }
  return (
    <div
      className={cn(
        "relative animate-fade-in rounded-md border border-border bg-muted/40 py-2 pl-3 pr-9 text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      {children}
      <button
        type="button"
        onClick={close}
        aria-label="Got it, hide this"
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
