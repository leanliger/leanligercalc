"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "prep-calculator:theme";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  // Start as null so the first paint matches whatever the inline script in
  // `layout.tsx` already applied; committing to a value before mount would
  // flash the wrong icon.
  const [theme, setTheme] = React.useState<Theme | null>(null);

  React.useEffect(() => {
    // Must match the pre-paint script in `layout.tsx`: dark unless the user has
    // explicitly chosen light. Any divergence shows up as the icon flipping on
    // load.
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      /* storage blocked in a third-party frame; fall through to the default */
    }
    const initial: Theme = stored === "light" ? "light" : "dark";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable; the theme still applies for this session */
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Moon /> : <Sun />}
    </Button>
  );
}
