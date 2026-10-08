/**
 * Where check-in data lives, decided at startup:
 *
 *   cloud — the app is open inside a Whop app, so the Worker can verify who the
 *           user is. Weigh-ins and the plan are saved to the D1 database and
 *           follow the user across devices.
 *   local — anywhere else (direct link, a plain embed, local dev without the
 *           Worker, or Whop not configured yet). Weigh-ins are kept in this
 *           browser only, and the UI says so.
 *
 * All requests are same-origin relative URLs: inside Whop's iframe, only
 * same-origin requests carry the x-whop-user-token header.
 */

import { validateWeighIn, type WeighIn } from "./tracking";
import { validateHabitEntries, type HabitLog } from "./habits";
import { isEmptyReview, validateReview, type WeeklyReview } from "./reviews";
import { myFoodId, validateFoodLog, validateMyFood, type FoodLog, type FoodProduct } from "./food";
import { addDays, todayISO } from "./dates";
import type { RemindersRequest } from "./reminders";
import { validateMeasurement, type Measurement } from "./measurements";
import { MAX_WORKOUTS, validateWorkout, type Workout } from "./training";

export type StorageMode = "cloud" | "local";

export type LocalReason =
  /** The Worker is up but Whop isn't configured (no WHOP_APP_ID yet). */
  | "not-configured"
  /** Configured, but this request carried no valid Whop identity. */
  | "not-signed-in"
  /** No API at all — static hosting, or local preview without the Worker. */
  | "no-server"
  /** The API couldn't be reached. */
  | "offline";

export interface SessionInfo {
  mode: StorageMode;
  reason?: LocalReason;
  /** Cloud mode only: the server can send Whop notifications (API key set). */
  notifications?: boolean;
  /** Cloud mode only: the signed-in Whop user, so on-device backups stay with their owner. */
  userId?: string;
}

/** What the server needs to send a member's fasting notifications. */
export interface ReminderRequest {
  experienceId: string;
  timeZone: string;
  meals: { label: string; time: string }[];
}

const LOCAL_KEY = "prep-calculator:weigh-ins:v1";
const LOCAL_HABITS_KEY = "prep-calculator:habits:v1";
const LOCAL_REVIEWS_KEY = "prep-calculator:reviews:v1";
const LOCAL_FOOD_KEY = "prep-calculator:food-logs:v1";
const LOCAL_MY_FOODS_KEY = "prep-calculator:my-foods:v1";
const LOCAL_MEASUREMENTS_KEY = "prep-calculator:measurements:v1";
const LOCAL_WORKOUTS_KEY = "prep-calculator:workouts:v1";
/**
 * On-device food logs older than this are dropped, so browser storage (about
 * 5 MB) never fills up. Cloud storage keeps everything.
 */
export const LOCAL_FOOD_DAYS = 365;
const ALL_LOCAL_KEYS = [
  LOCAL_KEY,
  LOCAL_HABITS_KEY,
  LOCAL_REVIEWS_KEY,
  LOCAL_FOOD_KEY,
  LOCAL_MY_FOODS_KEY,
  LOCAL_MEASUREMENTS_KEY,
  LOCAL_WORKOUTS_KEY,
];

function readLocalReviews(): WeeklyReview[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_REVIEWS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        const weekStart = (item as { weekStart?: unknown })?.weekStart;
        if (typeof weekStart !== "string") return null;
        const result = validateReview(item, weekStart);
        return result.ok && !isEmptyReview(result.value) ? result.value : null;
      })
      .filter((r): r is WeeklyReview => r !== null)
      .sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  } catch {
    return [];
  }
}

function writeLocalReviews(list: WeeklyReview[]): void {
  try {
    window.localStorage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify(list));
  } catch {
    throw new Error("This browser blocked saving. Try opening the app outside private browsing.");
  }
}
const SESSION_TIMEOUT_MS = 4000;

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) },
  });
}

/** Workout uploads give up after this long, so a hung connection counts as no signal. */
const WORKOUT_TIMEOUT_MS = 15_000;

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

async function expectOk(res: Response): Promise<Response> {
  if (res.ok) return res;
  let message = `Request failed (${res.status}).`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch {
    /* non-JSON error body */
  }
  // The status tells a rejected request apart from a dropped connection.
  throw Object.assign(new Error(message), { status: res.status });
}

export async function detectSession(): Promise<SessionInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);
  try {
    const res = await fetch("/api/session", {
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
    // Static hosting answers /api/session with the HTML 404 page.
    if (!isJson) return { mode: "local", reason: "no-server" };
    const body = (await res.json()) as { storage?: string; reason?: LocalReason; notifications?: boolean; userId?: unknown };
    if (res.ok && body.storage === "cloud") {
      return {
        mode: "cloud",
        notifications: body.notifications === true,
        ...(typeof body.userId === "string" && body.userId ? { userId: body.userId } : {}),
      };
    }
    return { mode: "local", reason: body.reason ?? "not-signed-in" };
  } catch {
    return { mode: "local", reason: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------- local --------------------------------- */

function readLocal(): WeighIn[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        const date = (item as { date?: unknown })?.date;
        if (typeof date !== "string") return null;
        const result = validateWeighIn(item, date);
        return result.ok ? result.value : null;
      })
      .filter((w): w is WeighIn => w !== null)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  } catch {
    return [];
  }
}

function writeLocal(list: WeighIn[]): void {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
  } catch {
    throw new Error("This browser blocked saving. Try opening the app outside private browsing.");
  }
}

function readLocalHabits(): HabitLog[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_HABITS_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw) as unknown;
    if (typeof map !== "object" || map === null) return [];
    return Object.entries(map as Record<string, unknown>)
      .map(([date, entries]) => {
        const result = validateHabitEntries({ entries }, date);
        return result.ok && Object.keys(result.value.entries).length > 0 ? result.value : null;
      })
      .filter((l): l is HabitLog => l !== null)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  } catch {
    return [];
  }
}

function writeLocalHabits(logs: HabitLog[]): void {
  try {
    window.localStorage.setItem(
      LOCAL_HABITS_KEY,
      JSON.stringify(Object.fromEntries(logs.map((l) => [l.date, l.entries]))),
    );
  } catch {
    throw new Error("This browser blocked saving. Try opening the app outside private browsing.");
  }
}

function readLocalFood(): FoodLog[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_FOOD_KEY);
    if (!raw) return [];
    const map = JSON.parse(raw) as unknown;
    if (typeof map !== "object" || map === null || Array.isArray(map)) return [];
    return Object.entries(map as Record<string, unknown>)
      .map(([date, entries]) => {
        const result = validateFoodLog({ entries }, date);
        return result.ok && result.value.entries.length > 0 ? result.value : null;
      })
      .filter((l): l is FoodLog => l !== null)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  } catch {
    return [];
  }
}

function writeLocalFood(logs: FoodLog[]): void {
  const oldest = addDays(todayISO(), -LOCAL_FOOD_DAYS);
  const kept = logs.filter((l) => l.date >= oldest && l.entries.length > 0);
  try {
    window.localStorage.setItem(
      LOCAL_FOOD_KEY,
      JSON.stringify(Object.fromEntries(kept.map((l) => [l.date, l.entries]))),
    );
  } catch {
    throw new Error("This browser blocked saving. Try opening the app outside private browsing.");
  }
}

function readLocalMyFoods(): FoodProduct[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_MY_FOODS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        const key = (item as { key?: unknown })?.key;
        if (typeof key !== "string" || !key.startsWith("mine:")) return null;
        const result = validateMyFood(item, key.slice(5));
        return result.ok ? result.value : null;
      })
      .filter((f): f is FoodProduct => f !== null);
  } catch {
    return [];
  }
}

function writeLocalMyFoods(list: FoodProduct[]): void {
  try {
    window.localStorage.setItem(LOCAL_MY_FOODS_KEY, JSON.stringify(list));
  } catch {
    throw new Error("This browser blocked saving. Try opening the app outside private browsing.");
  }
}

function readLocalMeasurements(): Measurement[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_MEASUREMENTS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        const date = (item as { date?: unknown })?.date;
        if (typeof date !== "string") return null;
        const result = validateMeasurement(item, date);
        return result.ok ? result.value : null;
      })
      .filter((m): m is Measurement => m !== null)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  } catch {
    return [];
  }
}

function writeLocalMeasurements(list: Measurement[]): void {
  try {
    window.localStorage.setItem(LOCAL_MEASUREMENTS_KEY, JSON.stringify(list));
  } catch {
    throw new Error("This browser blocked saving. Try opening the app outside private browsing.");
  }
}

const byWorkoutTime = (a: Workout, b: Workout) => (a.date === b.date ? a.startedAt - b.startedAt : a.date < b.date ? -1 : 1);

function readLocalWorkouts(): Workout[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_WORKOUTS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        const id = (item as { id?: unknown })?.id;
        if (typeof id !== "string") return null;
        const result = validateWorkout(item, id);
        return result.ok ? result.value : null;
      })
      .filter((w): w is Workout => w !== null)
      .sort(byWorkoutTime);
  } catch {
    return [];
  }
}

function writeLocalWorkouts(list: Workout[]): void {
  try {
    window.localStorage.setItem(LOCAL_WORKOUTS_KEY, JSON.stringify(list.slice(-MAX_WORKOUTS)));
  } catch {
    throw new Error("This browser blocked saving. Try opening the app outside private browsing.");
  }
}

function clearLocal(): void {
  try {
    for (const key of ALL_LOCAL_KEYS) window.localStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}

/** The fields of a saved food that the API stores (its key comes from the URL). */
function myFoodBody(f: FoodProduct) {
  return {
    name: f.name,
    brand: f.brand,
    barcode: f.barcode,
    per100: f.per100,
    perServing: f.perServing,
    servingLabel: f.servingLabel,
    servingSize: f.servingSize,
    baseUnit: f.baseUnit,
  };
}

/* ---------------------------------- store --------------------------------- */

export interface CheckinStore {
  mode: StorageMode;
  list(): Promise<WeighIn[]>;
  save(weighIn: WeighIn): Promise<WeighIn>;
  remove(date: string): Promise<void>;
  listHabits(): Promise<HabitLog[]>;
  /** Replace one day's habit log; an empty `entries` removes the day. */
  saveHabits(log: HabitLog): Promise<HabitLog>;
  listReviews(): Promise<WeeklyReview[]>;
  /** Save one week's self-audit; an empty review removes it. */
  saveReview(review: WeeklyReview): Promise<WeeklyReview>;
  /** Food logs for days from `from` to `to`, inclusive. */
  listFoodLogs(from: string, to: string): Promise<FoodLog[]>;
  /** Replace one day's food log; no entries removes the day. */
  saveFoodLog(log: FoodLog): Promise<FoodLog>;
  listMyFoods(): Promise<FoodProduct[]>;
  saveMyFood(food: FoodProduct): Promise<FoodProduct>;
  removeMyFood(id: string): Promise<void>;
  listMeasurements(): Promise<Measurement[]>;
  saveMeasurement(m: Measurement): Promise<Measurement>;
  removeMeasurement(date: string): Promise<void>;
  /** Every workout, oldest first. */
  listWorkouts(): Promise<Workout[]>;
  /** Create or replace one workout (also while it's in progress). */
  saveWorkout(w: Workout): Promise<Workout>;
  removeWorkout(id: string): Promise<void>;
  /** Turn on, or update, fasting notifications (cloud only). */
  saveFastingReminders(req: ReminderRequest): Promise<void>;
  deleteFastingReminders(): Promise<void>;
  /** Weigh-in / habits / recap reminders (cloud only). */
  saveReminders(req: RemindersRequest): Promise<void>;
  deleteReminders(): Promise<void>;
  loadPlan(): Promise<unknown | null>;
  savePlan(state: unknown): Promise<void>;
  /** Delete everything: weigh-ins, habits, reviews, food logs, my foods and the plan. */
  deleteAll(): Promise<void>;
}

export function createStore(mode: StorageMode): CheckinStore {
  if (mode === "cloud") {
    return {
      mode,
      async list() {
        const res = await expectOk(await api("/api/weigh-ins"));
        return ((await res.json()) as { weighIns: WeighIn[] }).weighIns;
      },
      async save(w) {
        const res = await expectOk(
          await api(`/api/weigh-ins/${w.date}`, {
            method: "PUT",
            body: JSON.stringify({ weightLb: w.weightLb, calories: w.calories, note: w.note }),
          }),
        );
        return ((await res.json()) as { weighIn: WeighIn }).weighIn;
      },
      async remove(date) {
        await expectOk(await api(`/api/weigh-ins/${date}`, { method: "DELETE" }));
      },
      async listHabits() {
        const res = await expectOk(await api("/api/habits"));
        return ((await res.json()) as { logs: HabitLog[] }).logs;
      },
      async saveHabits(log) {
        const res = await expectOk(
          await api(`/api/habits/${log.date}`, {
            method: "PUT",
            body: JSON.stringify({ entries: log.entries }),
          }),
        );
        return ((await res.json()) as { log: HabitLog }).log;
      },
      async listReviews() {
        const res = await expectOk(await api("/api/reviews"));
        return ((await res.json()) as { reviews: WeeklyReview[] }).reviews;
      },
      async saveReview(review) {
        const res = await expectOk(
          await api(`/api/reviews/${review.weekStart}`, {
            method: "PUT",
            body: JSON.stringify({ wins: review.wins, friction: review.friction, rule: review.rule }),
          }),
        );
        return ((await res.json()) as { review: WeeklyReview }).review;
      },
      async listFoodLogs(from, to) {
        const res = await expectOk(await api(`/api/food-logs?from=${from}&to=${to}`));
        return ((await res.json()) as { logs: FoodLog[] }).logs;
      },
      async saveFoodLog(log) {
        const res = await expectOk(
          await api(`/api/food-logs/${log.date}`, {
            method: "PUT",
            body: JSON.stringify({ entries: log.entries }),
          }),
        );
        return ((await res.json()) as { log: FoodLog }).log;
      },
      async listMyFoods() {
        const res = await expectOk(await api("/api/my-foods"));
        return ((await res.json()) as { foods: FoodProduct[] }).foods;
      },
      async saveMyFood(food) {
        const id = myFoodId(food);
        if (!id) throw new Error("Only your own foods can be saved.");
        const res = await expectOk(
          await api(`/api/my-foods/${id}`, { method: "PUT", body: JSON.stringify(myFoodBody(food)) }),
        );
        return ((await res.json()) as { food: FoodProduct }).food;
      },
      async removeMyFood(id) {
        await expectOk(await api(`/api/my-foods/${id}`, { method: "DELETE" }));
      },
      async listMeasurements() {
        const res = await expectOk(await api("/api/measurements"));
        return ((await res.json()) as { measurements: Measurement[] }).measurements;
      },
      async saveMeasurement(m) {
        const { date, ...sites } = m;
        const res = await expectOk(await api(`/api/measurements/${date}`, { method: "PUT", body: JSON.stringify(sites) }));
        return ((await res.json()) as { measurement: Measurement }).measurement;
      },
      async removeMeasurement(date) {
        await expectOk(await api(`/api/measurements/${date}`, { method: "DELETE" }));
      },
      async listWorkouts() {
        const res = await expectOk(await api("/api/workouts"));
        return ((await res.json()) as { workouts: Workout[] }).workouts;
      },
      async saveWorkout(w) {
        const { id, ...body } = w;
        const res = await expectOk(
          await api(`/api/workouts/${id}`, { method: "PUT", body: JSON.stringify(body), signal: timeoutSignal(WORKOUT_TIMEOUT_MS) }),
        );
        return ((await res.json()) as { workout: Workout }).workout;
      },
      async removeWorkout(id) {
        await expectOk(await api(`/api/workouts/${id}`, { method: "DELETE", signal: timeoutSignal(WORKOUT_TIMEOUT_MS) }));
      },
      async saveFastingReminders(req) {
        await expectOk(await api("/api/fasting-reminders", { method: "PUT", body: JSON.stringify(req) }));
      },
      async deleteFastingReminders() {
        await expectOk(await api("/api/fasting-reminders", { method: "DELETE" }));
      },
      async saveReminders(req) {
        await expectOk(await api("/api/reminders", { method: "PUT", body: JSON.stringify(req) }));
      },
      async deleteReminders() {
        await expectOk(await api("/api/reminders", { method: "DELETE" }));
      },
      async loadPlan() {
        const res = await expectOk(await api("/api/plan"));
        return ((await res.json()) as { state: unknown }).state ?? null;
      },
      async savePlan(state) {
        await expectOk(await api("/api/plan", { method: "PUT", body: JSON.stringify({ state }) }));
      },
      async deleteAll() {
        await expectOk(await api("/api/me", { method: "DELETE" }));
        clearLocal();
      },
    };
  }

  return {
    mode,
    async list() {
      return readLocal();
    },
    async save(w) {
      const result = validateWeighIn(w, w.date);
      if (!result.ok) throw new Error(result.error);
      const next = readLocal().filter((x) => x.date !== w.date);
      next.push(result.value);
      next.sort((a, b) => (a.date < b.date ? -1 : 1));
      writeLocal(next);
      return result.value;
    },
    async remove(date) {
      writeLocal(readLocal().filter((x) => x.date !== date));
    },
    async listHabits() {
      return readLocalHabits();
    },
    async saveHabits(log) {
      const result = validateHabitEntries({ entries: log.entries }, log.date);
      if (!result.ok) throw new Error(result.error);
      const rest = readLocalHabits().filter((l) => l.date !== log.date);
      if (Object.keys(result.value.entries).length > 0) rest.push(result.value);
      writeLocalHabits(rest);
      return result.value;
    },
    async listReviews() {
      return readLocalReviews();
    },
    async saveReview(review) {
      const result = validateReview(review, review.weekStart);
      if (!result.ok) throw new Error(result.error);
      const rest = readLocalReviews().filter((r) => r.weekStart !== review.weekStart);
      if (!isEmptyReview(result.value)) rest.push(result.value);
      writeLocalReviews(rest);
      return result.value;
    },
    async listFoodLogs(from, to) {
      return readLocalFood().filter((l) => l.date >= from && l.date <= to);
    },
    async saveFoodLog(log) {
      const result = validateFoodLog({ entries: log.entries }, log.date);
      if (!result.ok) throw new Error(result.error);
      const rest = readLocalFood().filter((l) => l.date !== log.date);
      if (result.value.entries.length > 0) rest.push(result.value);
      writeLocalFood(rest);
      return result.value;
    },
    async listMyFoods() {
      return readLocalMyFoods();
    },
    async saveMyFood(food) {
      const id = myFoodId(food);
      if (!id) throw new Error("Only your own foods can be saved.");
      const result = validateMyFood(myFoodBody(food), id);
      if (!result.ok) throw new Error(result.error);
      writeLocalMyFoods([result.value, ...readLocalMyFoods().filter((f) => f.key !== result.value.key)]);
      return result.value;
    },
    async removeMyFood(id) {
      writeLocalMyFoods(readLocalMyFoods().filter((f) => f.key !== `mine:${id}`));
    },
    async listMeasurements() {
      return readLocalMeasurements();
    },
    async saveMeasurement(m) {
      const result = validateMeasurement(m, m.date);
      if (!result.ok) throw new Error(result.error);
      writeLocalMeasurements([...readLocalMeasurements().filter((x) => x.date !== m.date), result.value].sort((a, b) => (a.date < b.date ? -1 : 1)));
      return result.value;
    },
    async removeMeasurement(date) {
      writeLocalMeasurements(readLocalMeasurements().filter((x) => x.date !== date));
    },
    async listWorkouts() {
      return readLocalWorkouts();
    },
    async saveWorkout(w) {
      const result = validateWorkout(w, w.id);
      if (!result.ok) throw new Error(result.error);
      writeLocalWorkouts([...readLocalWorkouts().filter((x) => x.id !== w.id), result.value].sort(byWorkoutTime));
      return result.value;
    },
    async removeWorkout(id) {
      writeLocalWorkouts(readLocalWorkouts().filter((x) => x.id !== id));
    },
    // Notifications are sent by the server, so they need a Whop identity.
    async saveFastingReminders() {
      throw new Error("Notifications work when the app is open inside Whop.");
    },
    async deleteFastingReminders() {},
    async saveReminders() {
      throw new Error("Reminders work when the app is open inside Whop.");
    },
    async deleteReminders() {},
    // In local mode the plan is already kept by persistence.ts.
    async loadPlan() {
      return null;
    },
    async savePlan() {},
    async deleteAll() {
      clearLocal();
    },
  };
}
