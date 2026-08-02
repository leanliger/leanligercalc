"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  /** Text shown in a tooltip behind an info icon. */
  help?: string;
  /**
   * Hide the label visually but keep it for assistive technology. Used where
   * an adjacent field already carries the visible label — the inches half of a
   * feet/inches pair, for example.
   */
  labelSrOnly?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  label,
  htmlFor,
  hint,
  help,
  labelSrOnly,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className={cn("flex items-center gap-1.5", labelSrOnly && "sr-only")}>
        <Label htmlFor={htmlFor}>{label}</Label>
        {help ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`About ${label}`}
                className="text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded-sm"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{help}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

interface NumberFieldProps extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  label: string;
  value: number;
  onValueChange: (value: number) => void;
  /** Trailing unit label rendered inside the input. */
  suffix?: string;
  hint?: string;
  help?: string;
  labelSrOnly?: boolean;
  decimals?: number;
  containerClassName?: string;
}

/**
 * Numeric input that keeps its own string draft while focused.
 *
 * Without the draft, typing "1" into a field bound to `175` would immediately
 * be re-formatted or clamped to a valid weight and fight the user's keystrokes.
 * The committed numeric value only propagates when the text parses cleanly.
 */
export function NumberField({
  label,
  value,
  onValueChange,
  suffix,
  hint,
  help,
  labelSrOnly,
  decimals = 1,
  containerClassName,
  className,
  id,
  ...props
}: NumberFieldProps) {
  const reactId = React.useId();
  const inputId = id ?? reactId;
  const [draft, setDraft] = React.useState<string | null>(null);

  const display =
    draft ?? (Number.isFinite(value) ? String(Number(value.toFixed(decimals))) : "");

  return (
    <Field
      label={label}
      htmlFor={inputId}
      hint={hint}
      help={help}
      labelSrOnly={labelSrOnly}
      className={containerClassName}
    >
      <div className="relative">
        <Input
          id={inputId}
          inputMode="decimal"
          type="number"
          value={display}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            const parsed = Number(next);
            if (next !== "" && Number.isFinite(parsed)) onValueChange(parsed);
          }}
          onBlur={() => setDraft(null)}
          className={cn(suffix && "pr-12", className)}
          {...props}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </Field>
  );
}
