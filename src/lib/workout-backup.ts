/**
 * Workouts that survive bad gym signal.
 *
 * Every workout change is written to the phone straight away, and only marked
 * synced once the server has that exact version. So a member who loses signal
 * mid-workout and closes the app keeps every set: the next time the app opens
 * (with or without signal) the workout is still there, and it uploads as soon
 * as there's a connection. Deleting works the same way.
 *
 * The device also keeps a synced copy of any workout still in progress, so
 * opening the app at the gym with no signal can still resume it.
 *
 * Each entry belongs to one Whop account, so a shared phone never uploads one
 * person's workout to someone else. Pure functions plus two small storage
 * helpers; the browser's local storage may be blocked, in which case the
 * backup simply lives for the visit.
 */

import { STALE_WORKOUT_MS, validateWorkout, type Workout } from "./training";

const BACKUP_KEY = "prep-calculator:workout-backup:v1";
const ACCOUNT_KEY = "prep-calculator:account:v1";
/** Unsynced changes nobody came back for are dropped after this long. */
export const BACKUP_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 30;

export interface BackupEntry {
  id: string;
  /** The latest version on this device; null = deleted on this device. */
  workout: Workout | null;
  /** The server has exactly this version (or the deletion). */
  synced: boolean;
  /** The Whop user it belongs to; null when the device never knew. */
  account: string | null;
  /** When it was last changed on this device (epoch ms). */
  savedAt: number;
}

const same = (a: Workout, b: Workout) => JSON.stringify(a) === JSON.stringify(b);

function upsert(entries: readonly BackupEntry[], entry: BackupEntry): BackupEntry[] {
  return [...entries.filter((e) => e.id !== entry.id), entry];
}

/** A workout changed on this device: keep it until the server has this version. */
export function recordChange(entries: readonly BackupEntry[], w: Workout, account: string | null, now: number): BackupEntry[] {
  return upsert(entries, { id: w.id, workout: w, synced: false, account, savedAt: now });
}

/** A workout deleted on this device: remember to delete it on the server too. */
export function recordDelete(entries: readonly BackupEntry[], id: string, account: string | null, now: number): BackupEntry[] {
  return upsert(entries, { id, workout: null, synced: false, account, savedAt: now });
}

/**
 * The server saved `w`. Marked synced only if nothing newer was recorded in the
 * meantime; a finished workout then needs no copy at all.
 */
export function markSynced(entries: readonly BackupEntry[], w: Workout): BackupEntry[] {
  return entries.flatMap((e) => {
    if (e.id !== w.id || !e.workout || !same(e.workout, w)) return [e];
    return w.finishedAt === null ? [{ ...e, synced: true }] : [];
  });
}

/** The server deleted it (or never had it). */
export function markDeleted(entries: readonly BackupEntry[], id: string): BackupEntry[] {
  return entries.filter((e) => !(e.id === id && e.workout === null));
}

export function dropEntry(entries: readonly BackupEntry[], id: string): BackupEntry[] {
  return entries.filter((e) => e.id !== id);
}

/**
 * Tidy up: drop synced copies that are finished or no longer in progress, and
 * anything abandoned for BACKUP_MAX_AGE_MS. Keeps the newest MAX_ENTRIES.
 */
export function pruneBackup(entries: readonly BackupEntry[], now: number): BackupEntry[] {
  return entries
    .filter((e) => {
      if (now - e.savedAt > BACKUP_MAX_AGE_MS) return false;
      if (!e.synced) return true;
      return e.workout !== null && e.workout.finishedAt === null && now - e.workout.startedAt < STALE_WORKOUT_MS;
    })
    .sort((a, b) => a.savedAt - b.savedAt)
    .slice(-MAX_ENTRIES);
}

/** Changes waiting to go to the server for this account, oldest first. */
export function pendingFor(entries: readonly BackupEntry[], account: string | null): BackupEntry[] {
  if (!account) return [];
  return entries.filter((e) => !e.synced && e.account === account).sort((a, b) => a.savedAt - b.savedAt);
}

/** The device's copies laid over a list of workouts: newer versions replace, deletions remove. */
export function overlay(list: readonly Workout[], entries: readonly BackupEntry[], account: string | null): Workout[] {
  const mine = entries.filter((e) => e.account === account);
  if (mine.length === 0) return [...list];
  const byId = new Map(list.map((w) => [w.id, w]));
  for (const e of mine) {
    // A synced copy only fills in what the list doesn't have (offline).
    if (e.synced && byId.has(e.id)) continue;
    if (e.workout) byId.set(e.id, e.workout);
    else byId.delete(e.id);
  }
  return [...byId.values()];
}

/**
 * On a fresh connection, line the device's copies up with the server's list:
 *   - an unsynced copy of a workout the server already has finished, while the
 *     copy is still in progress, is out of date (finished on another device):
 *     dropped;
 *   - a synced copy takes the server's version, or goes if the server no
 *     longer has it (deleted elsewhere).
 * Other accounts' entries are left alone.
 */
export function reconcile(entries: readonly BackupEntry[], server: readonly Workout[], account: string | null): BackupEntry[] {
  const onServer = new Map(server.map((w) => [w.id, w]));
  return entries.flatMap((e) => {
    if (e.account !== account) return [e];
    const s = onServer.get(e.id);
    if (e.synced) return s ? [{ ...e, workout: s }] : [];
    if (e.workout && e.workout.finishedAt === null && s && s.finishedAt !== null) return [];
    return [e];
  });
}

/** Errors worth retrying: no connection, timeouts, server trouble, an expired sign-in. */
export function isRetryable(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status !== "number") return true; // fetch threw: no connection
  return status >= 500 || status === 401 || status === 403 || status === 408 || status === 429;
}

/* -------------------------------- storage -------------------------------- */

export function readBackup(now: Date = new Date()): BackupEntry[] {
  try {
    const raw = window.localStorage.getItem(BACKUP_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    const out: BackupEntry[] = [];
    for (const item of list) {
      const e = item as Partial<BackupEntry> | null;
      if (!e || typeof e.id !== "string" || typeof e.savedAt !== "number" || typeof e.synced !== "boolean") continue;
      const account = typeof e.account === "string" ? e.account : null;
      if (e.workout === null) {
        out.push({ id: e.id, workout: null, synced: e.synced, account, savedAt: e.savedAt });
        continue;
      }
      const v = validateWorkout(e.workout, e.id, now);
      if (v.ok) out.push({ id: e.id, workout: v.value, synced: e.synced, account, savedAt: e.savedAt });
    }
    return out;
  } catch {
    return [];
  }
}

/** False when the browser won't store it (the backup then lasts for this visit only). */
export function writeBackup(entries: readonly BackupEntry[]): boolean {
  try {
    if (entries.length === 0) window.localStorage.removeItem(BACKUP_KEY);
    else window.localStorage.setItem(BACKUP_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

/** The Whop account last signed in on this device, for opening the app offline. */
export function readAccount(): string | null {
  try {
    return window.localStorage.getItem(ACCOUNT_KEY);
  } catch {
    return null;
  }
}

export function writeAccount(account: string): void {
  try {
    window.localStorage.setItem(ACCOUNT_KEY, account);
  } catch {
    /* storage blocked: offline resume just won't know the account */
  }
}
