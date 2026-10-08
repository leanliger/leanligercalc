/**
 * Habit ticks made with no signal (including the "Completed workout" tick
 * when a workout is finished at the gym) are kept on the phone and uploaded
 * with the workout backup (src/lib/workout-backup.ts) once there's a
 * connection. One entry per account and day, holding that day's latest
 * entries; it's removed once the server has exactly that version.
 */

import { validateHabitEntries, type HabitEntries, type HabitLog } from "./habits";
import { BACKUP_MAX_AGE_MS } from "./workout-backup";

const KEY = "prep-calculator:habit-backup:v1";
const MAX_ENTRIES = 60;

export interface HabitBackupEntry {
  date: string;
  entries: HabitEntries;
  account: string;
  savedAt: number;
}

const same = (a: HabitEntries, b: HabitEntries) => {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]);
};

export function recordHabitDay(list: readonly HabitBackupEntry[], log: HabitLog, account: string, now: number): HabitBackupEntry[] {
  return [...list.filter((e) => !(e.account === account && e.date === log.date)), { date: log.date, entries: log.entries, account, savedAt: now }];
}

/** The server saved this day: drop the copy, unless something newer was recorded since. */
export function markHabitDaySaved(list: readonly HabitBackupEntry[], log: HabitLog, account: string): HabitBackupEntry[] {
  return list.filter((e) => !(e.account === account && e.date === log.date && same(e.entries, log.entries)));
}

export function dropHabitDay(list: readonly HabitBackupEntry[], date: string, account: string): HabitBackupEntry[] {
  return list.filter((e) => !(e.account === account && e.date === date));
}

export function pendingHabitDays(list: readonly HabitBackupEntry[], account: string | null): HabitBackupEntry[] {
  if (!account) return [];
  return list.filter((e) => e.account === account).sort((a, b) => a.savedAt - b.savedAt);
}

export function pruneHabitBackup(list: readonly HabitBackupEntry[], now: number): HabitBackupEntry[] {
  return list
    .filter((e) => now - e.savedAt <= BACKUP_MAX_AGE_MS)
    .sort((a, b) => a.savedAt - b.savedAt)
    .slice(-MAX_ENTRIES);
}

/** The phone's days laid over the logs (an emptied day disappears), oldest first. */
export function overlayHabitLogs(logs: readonly HabitLog[], list: readonly HabitBackupEntry[], account: string | null): HabitLog[] {
  const mine = pendingHabitDays(list, account);
  if (mine.length === 0) return [...logs];
  const byDate = new Map(logs.map((l) => [l.date, l]));
  for (const e of mine) {
    if (Object.keys(e.entries).length === 0) byDate.delete(e.date);
    else byDate.set(e.date, { date: e.date, entries: e.entries });
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function readHabitBackup(now: Date = new Date()): HabitBackupEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    const out: HabitBackupEntry[] = [];
    for (const item of list) {
      const e = item as Partial<HabitBackupEntry> | null;
      if (!e || typeof e.date !== "string" || typeof e.account !== "string" || typeof e.savedAt !== "number") continue;
      const v = validateHabitEntries({ entries: e.entries }, e.date, now);
      if (v.ok) out.push({ date: e.date, entries: v.value.entries, account: e.account, savedAt: e.savedAt });
    }
    return out;
  } catch {
    return [];
  }
}

export function writeHabitBackup(list: readonly HabitBackupEntry[]): void {
  try {
    if (list.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage blocked: kept for this visit only */
  }
}
