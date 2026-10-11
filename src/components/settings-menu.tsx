"use client";

import * as React from "react";
import { Moon, Settings, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import { RemindersSettings, type RemindersSettingsProps } from "@/components/reminders-settings";
import { DataSettings, type DataSettingsProps } from "@/components/data-settings";
import { PauseSettings, type PauseSettingsProps } from "@/components/pause-settings";
import { CoachAccessSettings, type CoachAccessProps } from "@/components/coach-access";
import type { WeightUnit } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_A11Y, readA11y, saveA11y, type A11ySettings, type TextSize } from "@/lib/accessibility";

const TEXT_SIZE_OPTIONS: { value: TextSize; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
  { value: "larger", label: "Larger" },
];

/** Accessibility settings for this device (src/lib/accessibility.ts). */
function AccessibilitySettings() {
  const [s, setS] = React.useState<A11ySettings>(DEFAULT_A11Y);
  const contrastId = React.useId();
  const motionId = React.useId();
  React.useEffect(() => setS(readA11y()), []);
  const change = (patch: Partial<A11ySettings>) => {
    const next = { ...s, ...patch };
    setS(next);
    saveA11y(next);
  };
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Accessibility</p>
      <div className="space-y-1.5">
        <p className="text-sm">Text size</p>
        <SegmentedControl ariaLabel="Text size" value={s.textSize} onValueChange={(textSize) => change({ textSize })} options={TEXT_SIZE_OPTIONS} />
      </div>
      <div className="flex items-center gap-2.5">
        <label htmlFor={contrastId} className="min-w-0 flex-1 text-sm">
          Stronger contrast
          <span className="block text-[11px] text-muted-foreground">Darker secondary text and firmer borders.</span>
        </label>
        <Switch id={contrastId} checked={s.highContrast} onCheckedChange={(highContrast) => change({ highContrast })} />
      </div>
      <div className="flex items-center gap-2.5">
        <label htmlFor={motionId} className="min-w-0 flex-1 text-sm">
          Reduce motion
          <span className="block text-[11px] text-muted-foreground">Turns off animations.</span>
        </label>
        <Switch id={motionId} checked={s.reduceMotion} onCheckedChange={(reduceMotion) => change({ reduceMotion })} />
      </div>
      <p className="text-[11px] text-muted-foreground">Saved on this device.</p>
    </div>
  );
}

const THEME_KEY = "prep-calculator:theme";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

/**
 * The colour theme. Dark unless the member chose light — this must match the
 * pre-paint script in `layout.tsx`, or the page flips on load. Starts as null
 * so the first render matches whatever that script already applied.
 */
function useTheme(): [Theme | null, (t: Theme) => void] {
  const [theme, setTheme] = React.useState<Theme | null>(null);

  React.useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_KEY);
    } catch {
      /* storage blocked in a third-party frame; fall through to the default */
    }
    const initial: Theme = stored === "light" ? "light" : "dark";
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const choose = React.useCallback((next: Theme) => {
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable; the theme still applies for this visit */
    }
  }, []);

  return [theme, choose];
}

const UNIT_OPTIONS = [
  { value: "lb" as const, label: "lb" },
  { value: "kg" as const, label: "kg" },
];

const THEME_OPTIONS = [
  {
    value: "light" as const,
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Sun className="h-3.5 w-3.5" aria-hidden />
        Light
      </span>
    ),
  },
  {
    value: "dark" as const,
    label: (
      <span className="inline-flex items-center gap-1.5">
        <Moon className="h-3.5 w-3.5" aria-hidden />
        Dark
      </span>
    ),
  },
];

/**
 * The gear button at the top left of the header, and the settings panel it
 * opens: weight unit, light / dark mode and (in the member app) reminders.
 *
 * Built on the native <dialog> element, so focus moves into the panel and
 * stays there, Escape closes it, and the page behind can't be tabbed to.
 */
export function SettingsMenu({
  unit,
  onUnitChange,
  reminders,
  pause,
  coach,
  data,
  openRequest = 0,
}: {
  unit: WeightUnit;
  onUnitChange: (unit: WeightUnit) => void;
  /** Weigh-in / habits / recap reminders; left out on the coach dashboard. */
  reminders?: RemindersSettingsProps;
  /** Pause mode (sick or travelling); left out on the coach dashboard. */
  pause?: PauseSettingsProps;
  /** Whether the member shares their progress with their coach; left out on the coach dashboard. */
  coach?: CoachAccessProps;
  /** Sync status and "Delete all my data"; left out on the coach dashboard. */
  data?: DataSettingsProps;
  /** Bump to open the panel from elsewhere (Today's first-week checklist). */
  openRequest?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [theme, setTheme] = useTheme();
  const dialog = React.useRef<HTMLDialogElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();
  React.useEffect(() => {
    if (openRequest > 0) setOpen(true);
  }, [openRequest]);

  React.useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <Button
        ref={button}
        variant="ghost"
        size="icon"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="shrink-0"
      >
        <Settings />
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => {
          setOpen(false);
          button.current?.focus();
        }}
        // A click on the backdrop lands on the dialog element itself.
        onClick={(e) => {
          if (e.target === dialog.current) setOpen(false);
        }}
        className="fixed left-3 right-auto top-3 m-0 max-h-[calc(100dvh-1.5rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/40 sm:left-6 sm:top-4"
      >
        <div className="space-y-5 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold">
              <Settings className="h-4 w-4 text-primary" aria-hidden />
              Settings
            </h2>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setOpen(false)} aria-label="Close settings">
              <X />
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Weight unit</p>
            <SegmentedControl ariaLabel="Weight unit" value={unit} onValueChange={onUnitChange} options={UNIT_OPTIONS} />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Used for body weight, lifts and measurements (inches with lb, centimetres with kg).
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Appearance</p>
            <SegmentedControl ariaLabel="Appearance" value={theme ?? "dark"} onValueChange={setTheme} options={THEME_OPTIONS} />
          </div>

          <div className="border-t border-border pt-4">
            <AccessibilitySettings />
          </div>

          {pause ? (
            <div className="border-t border-border pt-4">
              <PauseSettings {...pause} />
            </div>
          ) : null}

          {coach ? (
            <div className="border-t border-border pt-4">
              <CoachAccessSettings {...coach} />
            </div>
          ) : null}

          {reminders ? (
            <div className="border-t border-border pt-4">
              <RemindersSettings {...reminders} />
            </div>
          ) : null}

          {data ? (
            <div className="border-t border-border pt-4">
              <DataSettings {...data} />
            </div>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
