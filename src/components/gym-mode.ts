"use client";

import * as React from "react";

/**
 * Gym mode (Training → a workout in progress): bigger set buttons, a
 * full-screen rest timer, and the screen kept on. A per-phone preference, so
 * it's kept in this browser rather than the plan, and shared live between the
 * workout logger and the rest timer.
 */

const KEY = "prep-calculator:gym-mode:v1";
const listeners = new Set<() => void>();
let cached: boolean | null = null;

function read(): boolean {
  if (cached !== null) return cached;
  try {
    cached = window.localStorage.getItem(KEY) === "1";
  } catch {
    cached = false;
  }
  return cached;
}

function write(on: boolean): void {
  cached = on;
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* fine: it lasts for this visit */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useGymMode(): [boolean, (on: boolean) => void] {
  const on = React.useSyncExternalStore(subscribe, read, () => false);
  return [on, write];
}
