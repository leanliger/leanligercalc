"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

/** Two-step destructive button. Native confirm() is blocked in iframes. */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  size = "sm",
  variant = "ghost",
  icon,
  className,
  ariaLabel,
}: {
  label: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  size?: "sm" | "icon";
  variant?: "ghost" | "outline";
  icon?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const [armed, setArmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  if (!armed) {
    return (
      <Button variant={variant} size={size} className={className} aria-label={ariaLabel} onClick={() => setArmed(true)}>
        {icon}
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        variant="destructive"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setArmed(false);
          }
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}
