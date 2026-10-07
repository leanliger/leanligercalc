"use client";

import * as React from "react";
import { BellRing, Minus, Plus, SkipForward, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REST_PRESETS, formatRest } from "@/lib/training";
import { cn } from "@/lib/utils";

/**
 * The rest timer between sets.
 *
 * It counts down to a timestamp rather than counting ticks, so it shows the
 * right time even after the phone pauses the page (switching apps, locking the
 * screen). It's kept in this browser so a reload doesn't lose it.
 *
 * At zero it chimes (Web Audio, unlocked by the tap that started it) and
 * vibrates where the browser allows it (Android; iPhones don't). It only makes
 * noise if the page is open at that moment — coming back later just shows that
 * rest is over.
 */

const STORAGE_KEY = "prep-calculator:rest-timer:v1";
/** How long "Rest over" stays on screen. */
const DONE_SHOW_MS = 10_000;
/** Chime only if we notice zero within this long of it. */
const ALERT_WINDOW_MS = 3_000;

export interface RestTimerState {
  startedAt: number;
  endsAt: number;
  /** What the rest is for, e.g. "Bench press". */
  label: string;
}

function readSaved(): RestTimerState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<RestTimerState>) : null;
    if (!v || typeof v.startedAt !== "number" || typeof v.endsAt !== "number" || typeof v.label !== "string") return null;
    return { startedAt: v.startedAt, endsAt: v.endsAt, label: v.label.slice(0, 60) };
  } catch {
    return null;
  }
}

let audio: AudioContext | null = null;

/** Must run inside a tap: browsers only allow sound that a gesture started. */
function unlockAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio ??= new AC();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    audio = null;
  }
}

function chime(): void {
  const ctx = audio;
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;
    [0, 0.22, 0.44].forEach((dt, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, t0 + dt);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + dt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + dt);
      osc.stop(t0 + dt + 0.2);
    });
  } catch {
    /* no sound is fine */
  }
}

function buzz(): void {
  try {
    navigator.vibrate?.([250, 120, 250]);
  } catch {
    /* not supported */
  }
}

export interface RestTimer {
  timer: RestTimerState | null;
  now: number;
  start: (seconds: number, label: string) => void;
  adjust: (deltaSeconds: number) => void;
  /** Change the length of the current rest, counted from when it started. */
  setLength: (seconds: number) => void;
  skip: () => void;
}

export function useRestTimer(): RestTimer {
  const [timer, setTimer] = React.useState<RestTimerState | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  // The end time we've already alerted for, so it chimes once.
  const alerted = React.useRef<number | null>(null);

  React.useEffect(() => {
    const saved = readSaved();
    if (saved && Date.now() - saved.endsAt < DONE_SHOW_MS) {
      if (Date.now() >= saved.endsAt) alerted.current = saved.endsAt;
      setTimer(saved);
    }
  }, []);

  React.useEffect(() => {
    try {
      if (timer) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(timer));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage blocked: the timer still works for this visit */
    }
  }, [timer]);

  React.useEffect(() => {
    if (!timer) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t >= timer.endsAt && alerted.current !== timer.endsAt) {
        alerted.current = timer.endsAt;
        if (t - timer.endsAt < ALERT_WINDOW_MS && document.visibilityState === "visible") {
          chime();
          buzz();
        }
      }
      if (t - timer.endsAt > DONE_SHOW_MS) setTimer(null);
    };
    tick();
    const id = window.setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [timer]);

  const start = React.useCallback((seconds: number, label: string) => {
    unlockAudio();
    const t = Date.now();
    alerted.current = null;
    setNow(t);
    setTimer({ startedAt: t, endsAt: t + seconds * 1000, label });
  }, []);

  const adjust = React.useCallback((deltaSeconds: number) => {
    unlockAudio();
    setTimer((prev) => (prev ? { ...prev, endsAt: Math.max(Date.now(), prev.endsAt + deltaSeconds * 1000) } : prev));
  }, []);

  const setLength = React.useCallback((seconds: number) => {
    unlockAudio();
    setTimer((prev) => (prev ? { ...prev, endsAt: Math.max(Date.now(), prev.startedAt + seconds * 1000) } : prev));
  }, []);

  const skip = React.useCallback(() => setTimer(null), []);

  return { timer, now, start, adjust, setLength, skip };
}

/** The bar pinned to the bottom of the screen while resting. */
export function RestTimerBar({ rest, onPreset }: { rest: RestTimer; onPreset?: (seconds: number) => void }) {
  const { timer, now } = rest;
  if (!timer) return null;
  const length = Math.round((timer.endsAt - timer.startedAt) / 1000);
  const remaining = Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  const done = remaining === 0;
  const pct = timer.endsAt > timer.startedAt ? Math.min(100, ((now - timer.startedAt) / (timer.endsAt - timer.startedAt)) * 100) : 100;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        role="timer"
        aria-label="Rest timer"
        className={cn(
          "pointer-events-auto mx-auto max-w-md space-y-2.5 rounded-xl border bg-card/95 p-3 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/85",
          done ? "border-success/60" : "border-primary/40",
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              done ? "bg-success/15 text-success" : "bg-primary/10 text-primary",
            )}
          >
            {done ? <BellRing className="h-5 w-5" /> : <Timer className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] text-muted-foreground" aria-live="polite">
              {done ? "Rest over — next set" : `Rest · ${timer.label}`}
            </p>
            <p className={cn("tabular text-2xl font-semibold leading-tight", done && "text-success")}>{formatRest(remaining)}</p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => rest.adjust(-15)} aria-label="15 seconds less" disabled={done}>
              <Minus />
            </Button>
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => rest.adjust(15)} aria-label="15 seconds more">
              <Plus />
            </Button>
            <Button variant={done ? "default" : "ghost"} size="sm" className="h-9 px-2.5" onClick={rest.skip}>
              {done ? "OK" : (
                <>
                  <SkipForward />
                  Skip
                </>
              )}
            </Button>
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className={cn("h-full rounded-full transition-[width] duration-200", done ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
        </div>
        {!done ? (
          <div className="flex items-center gap-1.5" role="group" aria-label="Rest length">
            {REST_PRESETS.map((sec) => (
              <Button
                key={sec}
                variant={length === sec ? "secondary" : "ghost"}
                size="sm"
                className={cn("h-7 flex-1 px-2 tabular", length === sec && "ring-1 ring-primary/40")}
                aria-pressed={length === sec}
                onClick={() => {
                  rest.setLength(sec);
                  onPreset?.(sec);
                }}
              >
                {formatRest(sec)}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
