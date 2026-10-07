"use client";

import * as React from "react";
import {
  Activity,
  CloudOff,
  Dumbbell,
  Link2,
  RotateCcw,
  Salad,
  Scale,
  TrendingDown,
  Trophy,
  Utensils,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import { SettingsMenu } from "@/components/settings-menu";
import { CopyButton } from "@/components/copy-button";
import { FatLossCalculator } from "@/components/fat-loss-calculator";
import { CarbCyclingCalculator } from "@/components/carb-cycling-calculator";
import { ProfileCard, ProfileSummary } from "@/components/profile-card";
import { RoadmapCalendar } from "@/components/roadmap-calendar";
import { CheckinTab, type CheckinSection } from "@/components/checkin-tab";
import { MacrosTab } from "@/components/macros-tab";
import { LeaderboardTab } from "@/components/leaderboard-tab";
import { TrainingTab } from "@/components/training-tab";
import type { NotificationStatus } from "@/components/fasting-card";
import type { ProgressAnalysis, Recommendation } from "@/lib/adaptive";
import {
  createStore,
  detectSession,
  type CheckinStore,
  type SessionInfo,
} from "@/lib/checkin-store";
import { addDays, daysBetween, todayISO } from "@/lib/dates";
import { FOOD_DAYS_AHEAD, type FoodEntry, type FoodLog, type FoodProduct } from "@/lib/food";
import {
  DEFAULT_APP_STATE,
  buildShareUrl,
  clearStorage,
  decodeStateFromQuery,
  loadFromStorage,
  sanitizeAppState,
  saveToStorage,
  syncUrl,
  type AppState,
  type AppTab,
} from "@/lib/persistence";
import type { CalorieAdjustment, WeighIn } from "@/lib/tracking";
import type { HabitDef, HabitLog } from "@/lib/habits";
import { experienceIdFromPath, sortedMeals, type FastingSettings } from "@/lib/fasting";
import { remindersRequest, type ReminderPrefs } from "@/lib/reminders";
import type { Measurement } from "@/lib/measurements";
import type { WeeklyReview } from "@/lib/reviews";
import type { TrainingSettings, Workout } from "@/lib/training";
import type {
  BiometricProfile,
  CarbCyclingInputs,
  FatLossInputs,
} from "@/lib/types";

const PLAN_SAVE_DEBOUNCE_MS = 800;

/**
 * The plan as the cloud should hold it. The active tab is left out: it's
 * navigation, not data, and including it made every tab switch a database
 * write.
 */
function cloudDoc(state: AppState): string {
  return JSON.stringify({ ...state, activeTab: undefined });
}

function sortByDate<T extends { date: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Food logs load in pages: this many days back at startup and per page. */
const FOOD_PAGE_DAYS = 35;

/** The food-log days loaded at startup: recent weeks plus the days ahead. */
function foodWindow(today: string): { from: string; to: string } {
  return { from: addDays(today, -FOOD_PAGE_DAYS), to: addDays(today, FOOD_DAYS_AHEAD + 2) };
}

/** Replace one day's log; an empty day is removed. */
function withFoodDay(list: FoodLog[], date: string, entries: FoodEntry[]): FoodLog[] {
  const rest = list.filter((l) => l.date !== date);
  return sortByDate(entries.length > 0 ? [...rest, { date, entries }] : rest);
}

const byWorkoutTime = (a: Workout, b: Workout) => (a.date === b.date ? a.startedAt - b.startedAt : a.date < b.date ? -1 : 1);

/** How long workout edits wait before saving, so typing a weight is one write. */
const WORKOUT_SAVE_DEBOUNCE_MS = 600;

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `adj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Startup, in order:
 *
 *  1. Settings from a shared link win over this browser's saved settings —
 *     but adjustments are never in links, so they always come from storage.
 *     (Without that, reloading a page whose URL carries settings would load
 *     zero adjustments, and the next auto-save would erase them.)
 *  2. Ask the Worker who we are. Inside a configured Whop app → cloud mode,
 *     and the saved plan replaces the local one. Otherwise → local mode.
 *  3. In cloud mode, any weigh-ins logged locally before sync existed are
 *     uploaded, so nothing is stranded on one device. Cloud wins on clashes.
 */
async function bootstrap(): Promise<{
  state: AppState;
  session: SessionInfo;
  store: CheckinStore;
  weighIns: WeighIn[];
  habitLogs: HabitLog[];
  reviews: WeeklyReview[];
  foodLogs: FoodLog[];
  /** First day covered by `foodLogs`; older days load on demand. */
  foodFrom: string;
  myFoods: FoodProduct[];
  measurements: Measurement[];
  workouts: Workout[];
  /** The plan exactly as loaded from the cloud, if there was one. */
  cloudState: AppState | null;
}> {
  const fromUrl = decodeStateFromQuery(window.location.search);
  const stored = loadFromStorage();
  let state: AppState = fromUrl ?? stored ?? DEFAULT_APP_STATE;
  if (fromUrl) state = { ...state, tracking: stored?.tracking ?? state.tracking };

  let session = await detectSession();
  const food = foodWindow(todayISO());

  if (session.mode === "cloud") {
    const cloud = createStore("cloud");
    const local = createStore("local");
    try {
      const plan = await cloud.loadPlan();
      const saved = plan ? sanitizeAppState(plan) : null;
      if (saved) state = fromUrl ? { ...state, tracking: saved.tracking } : saved;

      let weighIns = await cloud.list();
      const onDevice = await local.list();
      const known = new Set(weighIns.map((w) => w.date));
      const toUpload = onDevice.filter((w) => !known.has(w.date));
      for (const w of toUpload) await cloud.save(w);
      if (toUpload.length > 0) weighIns = await cloud.list();
      // Same for habit logs: upload days the cloud doesn't have yet.
      let habitLogs = await cloud.listHabits();
      const habitsOnDevice = await local.listHabits();
      const knownDays = new Set(habitLogs.map((l) => l.date));
      const habitsToUpload = habitsOnDevice.filter((l) => !knownDays.has(l.date));
      for (const l of habitsToUpload) await cloud.saveHabits(l);
      if (habitsToUpload.length > 0) habitLogs = await cloud.listHabits();
      // And weekly reviews.
      let reviews = await cloud.listReviews();
      const reviewsOnDevice = await local.listReviews();
      const knownWeeks = new Set(reviews.map((r) => r.weekStart));
      const reviewsToUpload = reviewsOnDevice.filter((r) => !knownWeeks.has(r.weekStart));
      for (const r of reviewsToUpload) await cloud.saveReview(r);
      if (reviewsToUpload.length > 0) reviews = await cloud.listReviews();

      // And food logs and saved foods.
      const foodOnDevice = await local.listFoodLogs("2000-01-01", addDays(food.to, 1));
      if (foodOnDevice.length > 0) {
        const cloudDays = await cloud.listFoodLogs(foodOnDevice[0]!.date, foodOnDevice[foodOnDevice.length - 1]!.date);
        const knownFoodDays = new Set(cloudDays.map((l) => l.date));
        for (const l of foodOnDevice) if (!knownFoodDays.has(l.date)) await cloud.saveFoodLog(l);
      }
      let myFoods = await cloud.listMyFoods();
      const myFoodsOnDevice = await local.listMyFoods();
      const knownFoods = new Set(myFoods.map((x) => x.key));
      const foodsToUpload = myFoodsOnDevice.filter((x) => !knownFoods.has(x.key));
      for (const x of foodsToUpload) await cloud.saveMyFood(x);
      if (foodsToUpload.length > 0) myFoods = await cloud.listMyFoods();
      const foodLogs = await cloud.listFoodLogs(food.from, food.to);
      // And measurements.
      let measurements = await cloud.listMeasurements();
      const measurementsOnDevice = await local.listMeasurements();
      const knownMeasureDays = new Set(measurements.map((m) => m.date));
      const measuresToUpload = measurementsOnDevice.filter((m) => !knownMeasureDays.has(m.date));
      for (const m of measuresToUpload) await cloud.saveMeasurement(m);
      if (measuresToUpload.length > 0) measurements = await cloud.listMeasurements();
      // And workouts.
      let workouts = await cloud.listWorkouts();
      const workoutsOnDevice = await local.listWorkouts();
      const knownWorkouts = new Set(workouts.map((w) => w.id));
      const workoutsToUpload = workoutsOnDevice.filter((w) => !knownWorkouts.has(w.id));
      for (const w of workoutsToUpload) await cloud.saveWorkout(w);
      if (workoutsToUpload.length > 0) workouts = await cloud.listWorkouts();

      if (
        onDevice.length > 0 ||
        habitsOnDevice.length > 0 ||
        reviewsOnDevice.length > 0 ||
        foodOnDevice.length > 0 ||
        myFoodsOnDevice.length > 0 ||
        measurementsOnDevice.length > 0 ||
        workoutsOnDevice.length > 0
      ) {
        await local.deleteAll();
      }

      return {
        state,
        session,
        store: cloud,
        weighIns: sortByDate(weighIns),
        habitLogs,
        reviews,
        foodLogs,
        foodFrom: food.from,
        myFoods,
        measurements,
        workouts: [...workouts].sort(byWorkoutTime),
        cloudState: saved,
      };
    } catch {
      // Signed in, but the database call failed: keep working locally.
      session = { mode: "local", reason: "offline" };
    }
  }

  const store = createStore("local");
  return {
    state,
    session,
    store,
    weighIns: await store.list(),
    habitLogs: await store.listHabits(),
    reviews: await store.listReviews(),
    foodLogs: await store.listFoodLogs(food.from, food.to),
    foodFrom: food.from,
    myFoods: await store.listMyFoods(),
    measurements: await store.listMeasurements(),
    workouts: await store.listWorkouts(),
    cloudState: null,
  };
}

export function AppShell() {
  const [state, setState] = React.useState<AppState>(DEFAULT_APP_STATE);
  const [linkedToTimeline, setLinkedToTimeline] = React.useState(false);
  // Nothing date- or storage-dependent renders until the client is ready —
  // this is a static export, so build-time HTML would carry the build date.
  const [ready, setReady] = React.useState(false);
  const [today, setToday] = React.useState("");
  const [session, setSession] = React.useState<SessionInfo>({ mode: "local", reason: "no-server" });
  const [weighIns, setWeighIns] = React.useState<WeighIn[]>([]);
  const [habitLogs, setHabitLogs] = React.useState<HabitLog[]>([]);
  const [reviews, setReviews] = React.useState<WeeklyReview[]>([]);
  const [foodLogs, setFoodLogs] = React.useState<FoodLog[]>([]);
  const [myFoods, setMyFoods] = React.useState<FoodProduct[]>([]);
  const [measurements, setMeasurements] = React.useState<Measurement[]>([]);
  const [workouts, setWorkouts] = React.useState<Workout[]>([]);
  const [workoutSaveError, setWorkoutSaveError] = React.useState<string | null>(null);
  const [syncError, setSyncError] = React.useState(false);
  const storeRef = React.useRef<CheckinStore | null>(null);
  // First food-log day loaded so far, and the chain that keeps food saves in
  // order (two quick adds must reach the database in the order they happened).
  const foodFrom = React.useRef("");
  const foodQueue = React.useRef<Promise<unknown>>(Promise.resolve());
  // Workout edits: the latest version of each changed workout, saved together
  // after a short pause (or straight away when the page is hidden), in order.
  const pendingWorkouts = React.useRef(new Map<string, Workout>());
  const workoutTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const workoutQueue = React.useRef<Promise<unknown>>(Promise.resolve());
  // What the server holds for fasting notifications ("off", or the request
  // last sent), so they're only re-sent when something actually changed.
  const reminderSynced = React.useRef<string | null>(null);
  const [reminderError, setReminderError] = React.useState<string | null>(null);
  // The same, for the weigh-in / habits / recap reminders.
  const checkinRemindersSynced = React.useRef<string | null>(null);
  const [checkinReminderError, setCheckinReminderError] = React.useState<string | null>(null);
  // What the cloud currently holds (as `cloudDoc`). A save happens only when
  // the plan differs from it — so loading the plan doesn't immediately write
  // it back, tab switches don't write, and "delete all my data" doesn't
  // re-create the row it just deleted.
  const lastSynced = React.useRef<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setToday(todayISO());
    bootstrap()
      // Whatever goes wrong, the calculators must still open — worst case on
      // defaults, in local mode.
      .catch(async () => ({
        state: loadFromStorage() ?? DEFAULT_APP_STATE,
        session: { mode: "local" as const, reason: "offline" as const },
        store: createStore("local"),
        weighIns: [] as WeighIn[],
        habitLogs: [] as HabitLog[],
        reviews: [] as WeeklyReview[],
        foodLogs: [] as FoodLog[],
        foodFrom: foodWindow(todayISO()).from,
        myFoods: [] as FoodProduct[],
        measurements: [] as Measurement[],
        workouts: [] as Workout[],
        cloudState: null,
      }))
      .then((result) => {
      if (cancelled) return;
      storeRef.current = result.store;
      lastSynced.current = result.cloudState ? cloudDoc(result.cloudState) : null;
      setSession(result.session);
      setWeighIns(result.weighIns);
      setHabitLogs(result.habitLogs);
      setReviews(result.reviews);
      setFoodLogs(result.foodLogs);
      setMyFoods(result.myFoods);
      setMeasurements(result.measurements);
      setWorkouts(result.workouts);
      foodFrom.current = result.foodFrom;
      // Notifications on: re-send once per visit (picks up a new time zone).
      reminderSynced.current = result.state.tracking.fasting.notify ? null : "off";
      checkinRemindersSynced.current = Object.values(result.state.tracking.reminders).some((r) => r.on) ? null : "off";
      setState(result.state);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist locally on every change; in cloud mode also save the plan to the
  // database, debounced so dragging a slider is one write, not fifty.
  React.useEffect(() => {
    if (!ready) return;
    saveToStorage(state);
    syncUrl(state);
    if (session.mode !== "cloud") return;
    const doc = cloudDoc(state);
    if (doc === lastSynced.current) return;
    const timer = setTimeout(() => {
      storeRef.current
        ?.savePlan(state)
        .then(() => {
          lastSynced.current = doc;
          setSyncError(false);
        })
        .catch(() => setSyncError(true));
    }, PLAN_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state, ready, session.mode]);

  // Keep the server's fasting notifications in step with the meal times.
  React.useEffect(() => {
    if (!ready || session.mode !== "cloud" || !session.notifications) return;
    const fasting = state.tracking.fasting;
    const experienceId = experienceIdFromPath(window.location.pathname);
    const want =
      fasting.notify && fasting.meals.length > 0 && experienceId
        ? JSON.stringify({
            experienceId,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            meals: sortedMeals(fasting.meals).map(({ label, time }) => ({ label, time })),
          })
        : "off";
    if (want === reminderSynced.current) return;
    const timer = setTimeout(() => {
      const store = storeRef.current;
      if (!store) return;
      (want === "off" ? store.deleteFastingReminders() : store.saveFastingReminders(JSON.parse(want)))
        .then(() => {
          reminderSynced.current = want;
          setReminderError(null);
        })
        .catch((e: unknown) =>
          setReminderError(e instanceof Error ? e.message : "Couldn't update notifications. Try again."),
        );
    }, PLAN_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [ready, session, state.tracking.fasting]);

  // Keep the server's check-in reminders in step with the member's choices.
  React.useEffect(() => {
    if (!ready || session.mode !== "cloud" || !session.notifications) return;
    const experienceId = experienceIdFromPath(window.location.pathname);
    const req = experienceId
      ? remindersRequest(state.tracking.reminders, experienceId, Intl.DateTimeFormat().resolvedOptions().timeZone)
      : null;
    const want = req ? JSON.stringify(req) : "off";
    if (want === checkinRemindersSynced.current) return;
    const timer = setTimeout(() => {
      const store = storeRef.current;
      if (!store) return;
      (req ? store.saveReminders(req) : store.deleteReminders())
        .then(() => {
          checkinRemindersSynced.current = want;
          setCheckinReminderError(null);
        })
        .catch((e: unknown) =>
          setCheckinReminderError(e instanceof Error ? e.message : "Couldn't update reminders. Try again."),
        );
    }, PLAN_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [ready, session, state.tracking.reminders]);

  const setTab = React.useCallback((tab: AppTab) => {
    setState((prev) => ({ ...prev, activeTab: tab }));
  }, []);

  // Which Check-in sub-section is open. Links into Check-in from other tabs
  // open the section they're about (habits from Macros and the leaderboard,
  // weigh-ins from the roadmap).
  const [checkinSection, setCheckinSection] = React.useState<CheckinSection>("weigh-in");
  const navigateFor = React.useMemo(() => {
    const to = (section: CheckinSection) => (tab: AppTab) => {
      if (tab === "checkin") setCheckinSection(section);
      setTab(tab);
    };
    return { weighIn: to("weigh-in"), habits: to("habits") };
  }, [setTab]);

  const updateProfile = React.useCallback((patch: Partial<BiometricProfile>) => {
    setState((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));
  }, []);

  const updateFatLoss = React.useCallback((patch: Partial<FatLossInputs>) => {
    setState((prev) => ({ ...prev, fatLoss: { ...prev.fatLoss, ...patch } }));
  }, []);

  const updateCarbs = React.useCallback((patch: Partial<CarbCyclingInputs>) => {
    setState((prev) => ({ ...prev, carbs: { ...prev.carbs, ...patch } }));
  }, []);

  const handleSendToCarbCycling = React.useCallback(
    (payload: { dailyCalories: number; tdee: number }) => {
      setState((prev) => ({
        ...prev,
        activeTab: "carbs",
        carbs: {
          ...prev.carbs,
          tdee: Math.round(payload.tdee),
          dailyCalorieTarget: Math.round(payload.dailyCalories),
        },
      }));
      setLinkedToTimeline(true);
    },
    [],
  );

  // Resets the calculator inputs. Applied adjustments are progress history, not
  // inputs, so they survive; only "delete all my data" removes them.
  const handleReset = React.useCallback(() => {
    clearStorage();
    setState((prev) => ({ ...DEFAULT_APP_STATE, tracking: prev.tracking }));
    setLinkedToTimeline(false);
  }, []);

  /* ------------------------------ check-ins ------------------------------ */

  const saveWeighIn = React.useCallback(async (w: WeighIn) => {
    const saved = await storeRef.current!.save(w);
    setWeighIns((prev) => sortByDate([...prev.filter((x) => x.date !== saved.date), saved]));
  }, []);

  const saveMeasurement = React.useCallback(async (m: Measurement) => {
    const saved = await storeRef.current!.saveMeasurement(m);
    setMeasurements((prev) => sortByDate([...prev.filter((x) => x.date !== saved.date), saved]));
  }, []);

  const deleteMeasurement = React.useCallback(async (date: string) => {
    await storeRef.current!.removeMeasurement(date);
    setMeasurements((prev) => prev.filter((x) => x.date !== date));
  }, []);

  const deleteWeighIn = React.useCallback(async (date: string) => {
    await storeRef.current!.remove(date);
    setWeighIns((prev) => prev.filter((x) => x.date !== date));
  }, []);

  const applyAdjustment = React.useCallback(
    (rec: Recommendation, _analysis: ProgressAnalysis) => {
      const adjustment: CalorieAdjustment = {
        id: newId(),
        appliedOn: today,
        effectiveFrom: rec.effectiveFrom,
        kcal: rec.kcal,
        reason: rec.reason,
      };
      setState((prev) => ({
        ...prev,
        tracking: { ...prev.tracking, adjustments: [...prev.tracking.adjustments, adjustment] },
      }));
    },
    [today],
  );

  const removeAdjustment = React.useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      tracking: { ...prev.tracking, adjustments: prev.tracking.adjustments.filter((a) => a.id !== id) },
    }));
  }, []);

  const saveHabitDay = React.useCallback(async (log: HabitLog) => {
    const saved = await storeRef.current!.saveHabits(log);
    setHabitLogs((prev) => {
      const rest = prev.filter((l) => l.date !== saved.date);
      const next = Object.keys(saved.entries).length > 0 ? [...rest, saved] : rest;
      return next.sort((a, b) => (a.date < b.date ? -1 : 1));
    });
  }, []);

  const saveReview = React.useCallback(async (review: WeeklyReview) => {
    const saved = await storeRef.current!.saveReview(review);
    setReviews((prev) => {
      const rest = prev.filter((r) => r.weekStart !== saved.weekStart);
      const empty = !saved.wins.some((w) => w) && !saved.friction && !saved.rule;
      return (empty ? rest : [...rest, saved]).sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
    });
  }, []);

  /* -------------------------------- food -------------------------------- */

  // Shown straight away, saved in the background, in order. If a save fails,
  // the day is reloaded so the screen matches what was actually stored.
  const saveFoodDay = React.useCallback((date: string, entries: FoodEntry[]) => {
    setFoodLogs((prev) => withFoodDay(prev, date, entries));
    const run = foodQueue.current
      .catch(() => {})
      .then(() => storeRef.current!.saveFoodLog({ date, entries }));
    foodQueue.current = run;
    return run.then(
      () => undefined,
      async (e: unknown) => {
        try {
          const [stored] = await storeRef.current!.listFoodLogs(date, date);
          setFoodLogs((prev) => withFoodDay(prev, date, stored?.entries ?? []));
        } catch {
          /* leave the screen as it is */
        }
        throw e instanceof Error ? e : new Error("Couldn't save. Try again.");
      },
    );
  }, []);

  // Older days load a page at a time as the member steps back through them.
  const ensureFoodLoaded = React.useCallback((date: string) => {
    const loadedFrom = foodFrom.current;
    if (!loadedFrom || date >= loadedFrom || !storeRef.current) return;
    const to = addDays(loadedFrom, -1);
    let from = addDays(date, -FOOD_PAGE_DAYS);
    if (daysBetween(from, to) > 365) from = addDays(to, -365);
    foodFrom.current = from;
    storeRef.current
      .listFoodLogs(from, to)
      .then((older) => {
        setFoodLogs((prev) => {
          const have = new Set(prev.map((l) => l.date));
          return sortByDate([...prev, ...older.filter((l) => !have.has(l.date))]);
        });
      })
      .catch(() => {
        foodFrom.current = loadedFrom; // try again next time
      });
  }, []);

  const saveMyFood = React.useCallback(async (food: FoodProduct) => {
    const saved = await storeRef.current!.saveMyFood(food);
    setMyFoods((prev) => [saved, ...prev.filter((x) => x.key !== saved.key)]);
    return saved;
  }, []);

  const removeMyFood = React.useCallback(async (id: string) => {
    await storeRef.current!.removeMyFood(id);
    setMyFoods((prev) => prev.filter((x) => x.key !== `mine:${id}`));
  }, []);

  /* ------------------------------ training ------------------------------ */

  const flushWorkouts = React.useCallback((): Promise<void> => {
    if (workoutTimer.current) clearTimeout(workoutTimer.current);
    workoutTimer.current = null;
    const batch = [...pendingWorkouts.current.values()];
    pendingWorkouts.current.clear();
    if (batch.length === 0 || !storeRef.current) return workoutQueue.current.then(() => undefined, () => undefined);
    const store = storeRef.current;
    const run = workoutQueue.current
      .catch(() => {})
      .then(async () => {
        for (const w of batch) await store.saveWorkout(w);
      });
    workoutQueue.current = run;
    return run.then(
      () => setWorkoutSaveError(null),
      (e: unknown) => {
        // Keep them pending so the next change (or leaving the page) tries again.
        for (const w of batch) if (!pendingWorkouts.current.has(w.id)) pendingWorkouts.current.set(w.id, w);
        setWorkoutSaveError(e instanceof Error ? e.message : "Couldn't save your workout. Try again.");
        throw e instanceof Error ? e : new Error("Couldn't save your workout.");
      },
    );
  }, []);

  /** Show a workout change straight away; save it shortly after (or now). */
  const saveWorkout = React.useCallback(
    (w: Workout, now = false): Promise<void> => {
      setWorkouts((prev) => [...prev.filter((x) => x.id !== w.id), w].sort(byWorkoutTime));
      pendingWorkouts.current.set(w.id, w);
      if (now) return flushWorkouts();
      if (workoutTimer.current) clearTimeout(workoutTimer.current);
      workoutTimer.current = setTimeout(() => {
        flushWorkouts().catch(() => {});
      }, WORKOUT_SAVE_DEBOUNCE_MS);
      return Promise.resolve();
    },
    [flushWorkouts],
  );

  const removeWorkout = React.useCallback(async (id: string) => {
    pendingWorkouts.current.delete(id);
    await workoutQueue.current.catch(() => {});
    await storeRef.current!.removeWorkout(id);
    setWorkouts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  // Leaving the page (or switching apps on a phone) saves anything unsaved.
  React.useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushWorkouts().catch(() => {});
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flushWorkouts]);

  // Takes an updater, so two changes in one tap (add an exercise, then put it
  // in a program) build on each other instead of the second undoing the first.
  const updateTraining = React.useCallback((update: (prev: TrainingSettings) => TrainingSettings) => {
    setState((prev) => ({ ...prev, tracking: { ...prev.tracking, training: update(prev.tracking.training) } }));
  }, []);

  const updateReminders = React.useCallback((reminders: ReminderPrefs) => {
    setState((prev) => ({ ...prev, tracking: { ...prev.tracking, reminders } }));
  }, []);

  const updateFasting = React.useCallback((fasting: FastingSettings) => {
    setState((prev) => ({ ...prev, tracking: { ...prev.tracking, fasting } }));
  }, []);

  const updateHabitDefs = React.useCallback((habits: HabitDef[]) => {
    setState((prev) => ({ ...prev, tracking: { ...prev.tracking, habits } }));
  }, []);

  const deleteAllData = React.useCallback(async () => {
    pendingWorkouts.current.clear();
    if (workoutTimer.current) clearTimeout(workoutTimer.current);
    await workoutQueue.current.catch(() => {});
    await storeRef.current!.deleteAll();
    clearStorage();
    const reset: AppState = { ...DEFAULT_APP_STATE, unit: state.unit, activeTab: "checkin" };
    // Treat the empty defaults as already "synced" so they aren't written
    // straight back into the row that was just deleted.
    lastSynced.current = cloudDoc(reset);
    reminderSynced.current = "off"; // the server deleted them with everything else
    checkinRemindersSynced.current = "off";
    setWeighIns([]);
    setHabitLogs([]);
    setReviews([]);
    setFoodLogs([]);
    setMyFoods([]);
    setMeasurements([]);
    setWorkouts([]);
    setState(reset);
  }, [state.unit]);

  // Whether Whop notifications can be switched on here (fasting and check-in).
  const notifyAvailability: NotificationStatus["availability"] = !ready
    ? "local"
    : session.mode !== "cloud"
      ? "local"
      : !session.notifications
        ? "no-key"
        : experienceIdFromPath(window.location.pathname)
          ? "ok"
          : "no-experience";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="container flex h-16 items-center gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <SettingsMenu
                unit={state.unit}
                onUnitChange={(unit) => setState((prev) => ({ ...prev, unit }))}
                reminders={{
                  prefs: state.tracking.reminders,
                  onChange: updateReminders,
                  status: { availability: notifyAvailability, error: checkinReminderError },
                }}
                data={{
                  session,
                  count:
                    weighIns.length +
                    habitLogs.length +
                    reviews.length +
                    foodLogs.length +
                    myFoods.length +
                    measurements.length +
                    workouts.length,
                  onDeleteAll: deleteAllData,
                }}
              />
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Activity className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold leading-tight sm:text-base">
                  Prep Calculator
                </h1>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">
                  Fat loss timelines and carb cycling for contest prep
                </p>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <CopyButton
                getText={() => buildShareUrl(state)}
                label="Share"
                copiedLabel="Link copied"
                variant="outline"
                className="hidden sm:inline-flex"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleReset}
                aria-label="Reset all inputs to defaults"
                title="Reset to defaults"
              >
                <RotateCcw />
              </Button>
            </div>
          </div>
        </header>

        <main className="container py-6">
          {/* The calculators render client-side only. This is a static
              export, so anything rendered at build time is frozen at the build
              date — and nearly everything here depends on "today". Rendering it
              into the HTML caused a hydration mismatch (React #418) on every
              visit after the build day. */}
          {!ready ? (
            <div aria-busy="true" aria-label="Loading calculator" className="space-y-4">
              <div className="h-11 w-full max-w-md animate-pulse rounded-lg bg-muted/40" />
              <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
                <div className="h-[32rem] animate-pulse rounded-lg bg-muted/30" />
                <div className="h-[32rem] animate-pulse rounded-lg bg-muted/30" />
              </div>
            </div>
          ) : (
            // The roadmap is a sub-section of Carb Cycling; "roadmap" stays a
            // destination of its own so links to it (and saved tabs) still work.
            <Tabs value={state.activeTab === "roadmap" ? "carbs" : state.activeTab} onValueChange={(value) => setTab(value as AppTab)}>
              <div className="flex flex-wrap items-center gap-3">
                <TabsList className="relative scrollbar-thin max-w-full gap-0.5 overflow-x-auto sm:gap-1 [&>button]:px-1.5 [&>button]:text-[13px] sm:[&>button]:px-4 sm:[&>button]:text-sm [&_svg]:hidden sm:[&_svg]:block">
                  <TabsTrigger value="timeline">
                    <TrendingDown />
                    <span className="sm:hidden">Timeline</span>
                    <span className="hidden sm:inline">Fat Loss Timeline</span>
                  </TabsTrigger>
                  <TabsTrigger value="carbs">
                    <Salad />
                    <span className="sm:hidden">Carbs</span>
                    <span className="hidden sm:inline">Carb Cycling</span>
                  </TabsTrigger>
                  <TabsTrigger value="macros">
                    <Utensils />
                    Macros
                  </TabsTrigger>
                  <TabsTrigger value="training">
                    <Dumbbell />
                    Training
                  </TabsTrigger>
                  <TabsTrigger value="checkin">
                    <Scale />
                    Check-in
                  </TabsTrigger>
                  {/* On phones the trophy stands in for the word, so all six tabs fit. */}
                  <TabsTrigger value="leaderboard" className="[&_svg]:!block">
                    <Trophy />
                    <span className="sr-only sm:not-sr-only">Leaderboard</span>
                  </TabsTrigger>
                </TabsList>

                {linkedToTimeline ? (
                  <Badge variant="success">
                    <Link2 />
                    Carb plan linked to timeline
                  </Badge>
                ) : null}
                {syncError ? (
                  <Badge variant="warning" role="status">
                    <CloudOff />
                    Couldn&apos;t sync — changes kept on this device
                  </Badge>
                ) : null}
              </div>

              <TabsContent value="timeline">
                <FatLossCalculator
                  profile={state.profile}
                  inputs={state.fatLoss}
                  onChange={updateFatLoss}
                  unit={state.unit}
                  onSendToCarbCycling={handleSendToCarbCycling}
                  profileSlot={
                    <ProfileCard profile={state.profile} onChange={updateProfile} unit={state.unit} />
                  }
                />
              </TabsContent>

              <TabsContent value="carbs" className="space-y-5">
                <SegmentedControl
                  ariaLabel="Carb cycling section"
                  value={state.activeTab === "roadmap" ? "roadmap" : "carbs"}
                  onValueChange={(v) => setTab(v)}
                  options={[
                    { value: "carbs" as const, label: "Weekly plan" },
                    { value: "roadmap" as const, label: "Roadmap" },
                  ]}
                  className="max-w-xs"
                />
                {state.activeTab === "roadmap" ? (
                  <RoadmapCalendar
                    profile={state.profile}
                    fatLoss={state.fatLoss}
                    carbs={state.carbs}
                    unit={state.unit}
                    weighIns={weighIns}
                    adjustments={state.tracking.adjustments}
                    onCarbsChange={updateCarbs}
                    onNavigate={navigateFor.weighIn}
                  />
                ) : (
                  <CarbCyclingCalculator
                    profile={state.profile}
                    inputs={state.carbs}
                    onChange={updateCarbs}
                    unit={state.unit}
                    linkedToTimeline={linkedToTimeline}
                    onClearLink={() => setLinkedToTimeline(false)}
                    // "About you" is shared with the Timeline and edited there.
                    profileSlot={<ProfileSummary profile={state.profile} unit={state.unit} onEdit={() => setTab("timeline")} />}
                  />
                )}
              </TabsContent>

              <TabsContent value="macros">
                <MacrosTab
                  profile={state.profile}
                  fatLoss={state.fatLoss}
                  carbs={state.carbs}
                  adjustments={state.tracking.adjustments}
                  today={today}
                  session={session}
                  foodLogs={foodLogs}
                  onEnsureLoaded={ensureFoodLoaded}
                  onSaveFoodDay={saveFoodDay}
                  myFoods={myFoods}
                  onSaveMyFood={saveMyFood}
                  onRemoveMyFood={removeMyFood}
                  habits={state.tracking.habits}
                  habitLogs={habitLogs}
                  onSaveHabits={saveHabitDay}
                  fasting={state.tracking.fasting}
                  onFastingChange={updateFasting}
                  notifications={{ availability: notifyAvailability, error: reminderError }}
                  onNavigate={navigateFor.habits}
                />
              </TabsContent>

              <TabsContent value="training">
                <TrainingTab
                  unit={state.unit}
                  today={today}
                  settings={state.tracking.training}
                  onSettingsChange={updateTraining}
                  workouts={workouts}
                  onSaveWorkout={saveWorkout}
                  onDeleteWorkout={removeWorkout}
                  saveError={workoutSaveError}
                  habits={state.tracking.habits}
                  habitLogs={habitLogs}
                  onSaveHabits={saveHabitDay}
                />
              </TabsContent>

              <TabsContent value="leaderboard">
                <LeaderboardTab
                  availability={notifyAvailability}
                  onNavigate={navigateFor.habits}
                  unit={state.unit}
                  bodyweightLb={weighIns[weighIns.length - 1]?.weightLb ?? state.profile.weight}
                  today={today}
                />
              </TabsContent>

              <TabsContent value="checkin">
                <CheckinTab
                  profile={state.profile}
                  fatLoss={state.fatLoss}
                  unit={state.unit}
                  today={today}
                  session={session}
                  weighIns={weighIns}
                  adjustments={state.tracking.adjustments}
                  carbs={state.carbs}
                  habits={state.tracking.habits}
                  habitLogs={habitLogs}
                  onSaveHabits={saveHabitDay}
                  reviews={reviews}
                  onSaveReview={saveReview}
                  onHabitsChange={updateHabitDefs}
                  onSave={saveWeighIn}
                  onDelete={deleteWeighIn}
                  onApplyAdjustment={applyAdjustment}
                  onRemoveAdjustment={removeAdjustment}
                  foodLogs={foodLogs}
                  measurements={measurements}
                  onSaveMeasurement={saveMeasurement}
                  onDeleteMeasurement={deleteMeasurement}
                  onNavigate={setTab}
                  section={checkinSection}
                  onSectionChange={setCheckinSection}
                />
              </TabsContent>
            </Tabs>
          )}
        </main>

        <footer className="border-t border-border py-6">
          <div className="container space-y-2 text-xs leading-relaxed text-muted-foreground">
            <p>
              Projections are models, not promises. Real weight loss is noisy — water,
              glycogen, sodium, and menstrual cycles all move the scale more in a day than
              fat does in a week. Track weekly averages and adjust from actual trend data
              rather than assuming the curve.
            </p>
            <p>
              This tool is for general fitness planning and is not medical or nutritional
              advice. Talk to a physician or registered dietitian before starting an
              aggressive diet, especially if you have a history of disordered eating or any
              medical condition.
            </p>
            <p>
              <a
                href="/privacy/"
                target="_blank"
                rel="noopener"
                className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
              >
                Privacy policy
              </a>
            </p>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
