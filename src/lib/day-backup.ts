/**
 * Food logs and weigh-ins saved with no signal: kept on the phone and
 * uploaded with the workout backup (src/lib/workout-backup.ts) once there's
 * a connection, the same way habit ticks are (src/lib/habit-backup.ts).
 *
 * One entry per account, kind and day, holding that day's latest version
 * (a weigh-in's `null` means it was deleted). It's removed once the server
 * has exactly that version.
 */

import { validateFoodLog, type FoodEntry, type FoodLog } from "./food";
import { validateWeighIn, type WeighIn } from "./tracking";
import { BACKUP_MAX_AGE_MS } from "./workout-backup";

export const FOOD_BACKUP_KEY = "prep-calculator:food-backup:v1";
export const WEIGH_IN_BACKUP_KEY = "prep-calculator:weigh-in-backup:v1";
const MAX_ENTRIES = 120;

export interface DayBackupEntry<T> {
  date: string;
  /** The day's latest version; null = deleted on this device. */
  value: T | null;
  account: string;
  savedAt: number;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function recordDay<T>(list: readonly DayBackupEntry<T>[], date: string, value: T | null, account: string, now: number): DayBackupEntry<T>[] {
  return [...list.filter((e) => !(e.account === account && e.date === date)), { date, value, account, savedAt: now }];
}

/** The server has this version: drop the copy, unless something newer was recorded since. */
export function markDaySaved<T>(list: readonly DayBackupEntry<T>[], date: string, value: T | null, account: string): DayBackupEntry<T>[] {
  return list.filter((e) => !(e.account === account && e.date === date && same(e.value, value)));
}

export function dropDay<T>(list: readonly DayBackupEntry<T>[], date: string, account: string): DayBackupEntry<T>[] {
  return list.filter((e) => !(e.account === account && e.date === date));
}

export function pendingDays<T>(list: readonly DayBackupEntry<T>[], account: string | null): DayBackupEntry<T>[] {
  if (!account) return [];
  return list.filter((e) => e.account === account).sort((a, b) => a.savedAt - b.savedAt);
}

export function pruneDays<T>(list: readonly DayBackupEntry<T>[], now: number): DayBackupEntry<T>[] {
  return list
    .filter((e) => now - e.savedAt <= BACKUP_MAX_AGE_MS)
    .sort((a, b) => a.savedAt - b.savedAt)
    .slice(-MAX_ENTRIES);
}

/** Food days from the phone laid over the loaded logs (a cleared day stays, empty). */
export function overlayFoodLogs(logs: readonly FoodLog[], list: readonly DayBackupEntry<FoodEntry[]>[], account: string | null): FoodLog[] {
  const mine = pendingDays(list, account);
  if (mine.length === 0) return [...logs];
  const byDate = new Map(logs.map((l) => [l.date, l]));
  for (const e of mine) byDate.set(e.date, { date: e.date, entries: e.value ?? [] });
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Weigh-ins from the phone laid over the list: new or changed ones replace, deletions remove. */
export function overlayWeighIns(list: readonly WeighIn[], backup: readonly DayBackupEntry<WeighIn>[], account: string | null): WeighIn[] {
  const mine = pendingDays(backup, account);
  if (mine.length === 0) return [...list];
  const byDate = new Map(list.map((w) => [w.date, w]));
  for (const e of mine) {
    if (e.value) byDate.set(e.date, e.value);
    else byDate.delete(e.date);
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/* -------------------------------- storage -------------------------------- */

function read<T>(key: string, clean: (value: unknown, date: string) => T | null): DayBackupEntry<T>[] {
  try {
    const raw = window.localStorage.getItem(key);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    const out: DayBackupEntry<T>[] = [];
    for (const item of list) {
      const e = item as Partial<DayBackupEntry<unknown>> | null;
      if (!e || typeof e.date !== "string" || typeof e.account !== "string" || typeof e.savedAt !== "number") continue;
      if (e.value === null) {
        out.push({ date: e.date, value: null, account: e.account, savedAt: e.savedAt });
        continue;
      }
      const value = clean(e.value, e.date);
      if (value !== null) out.push({ date: e.date, value, account: e.account, savedAt: e.savedAt });
    }
    return out;
  } catch {
    return [];
  }
}

function write<T>(key: string, list: readonly DayBackupEntry<T>[]): void {
  try {
    if (list.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage blocked: kept for this visit only */
  }
}

export function readFoodBackup(): DayBackupEntry<FoodEntry[]>[] {
  return read(FOOD_BACKUP_KEY, (value, date) => {
    const v = validateFoodLog({ entries: value }, date);
    return v.ok ? v.value.entries : null;
  });
}

export function readWeighInBackup(): DayBackupEntry<WeighIn>[] {
  return read(WEIGH_IN_BACKUP_KEY, (value, date) => {
    const v = validateWeighIn(value, date);
    return v.ok ? v.value : null;
  });
}

export const writeFoodBackup = (list: readonly DayBackupEntry<FoodEntry[]>[]) => write(FOOD_BACKUP_KEY, list);
export const writeWeighInBackup = (list: readonly DayBackupEntry<WeighIn>[]) => write(WEIGH_IN_BACKUP_KEY, list);
