"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

interface CopyButtonProps extends Omit<ButtonProps, "onClick" | "children"> {
  /** Resolved lazily so the copied text always reflects current state. */
  getText: () => string;
  label?: string;
  copiedLabel?: string;
}

/**
 * Copy-to-clipboard button with a transient confirmation state.
 *
 * Falls back to a hidden textarea + `execCommand` because the async clipboard
 * API is unavailable on insecure origins, which is exactly where a coach
 * running this on a local network is likely to be.
 */
export function CopyButton({
  getText,
  label = "Copy",
  copiedLabel = "Copied",
  variant = "outline",
  size = "sm",
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);

  const handleCopy = React.useCallback(async () => {
    const text = getText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopied(true);
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied — leave the button in its resting state
      // rather than claiming a copy that did not happen.
      setCopied(false);
    }
  }, [getText]);

  return (
    <Button variant={variant} size={size} onClick={handleCopy} {...props}>
      {copied ? <Check className="text-success" /> : <Copy />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
