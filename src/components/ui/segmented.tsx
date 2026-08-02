"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  hint?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  className?: string;
  /** Accessible name for the group, since there is no visible <legend>. */
  ariaLabel: string;
  size?: "sm" | "default";
}

/**
 * A radio group styled as a segmented control. Built on native radio inputs
 * rather than buttons so arrow-key navigation and screen-reader semantics come
 * for free.
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  ariaLabel,
  size = "default",
}: SegmentedControlProps<T>) {
  const groupName = React.useId();

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "grid w-full auto-cols-fr grid-flow-col gap-1 rounded-md border border-border bg-muted/50 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const id = `${groupName}-${option.value}`;
        const selected = option.value === value;
        return (
          <div key={option.value} className="relative">
            <input
              type="radio"
              id={id}
              name={groupName}
              value={option.value}
              checked={selected}
              onChange={() => onValueChange(option.value)}
              className="peer sr-only"
            />
            <label
              htmlFor={id}
              title={option.hint}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-sm text-center font-medium transition-colors",
                "text-muted-foreground hover:text-foreground",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-background",
                size === "sm" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm",
                selected && "bg-background text-foreground shadow-sm",
              )}
            >
              <span>{option.label}</span>
              {option.hint ? (
                <span className="mt-0.5 text-[10px] font-normal opacity-70">
                  {option.hint}
                </span>
              ) : null}
            </label>
          </div>
        );
      })}
    </div>
  );
}
