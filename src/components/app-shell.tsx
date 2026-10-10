"use client";

import * as React from "react";
import {
  Activity,
  CloudOff,
  Dumbbell,
  House,
  RotateCcw,
  Target,
  TrendingUp,
  Trophy,
  Utensils,
  X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { SettingsMenu } from "@/components/settings-menu";
import { CopyButton } from "@/components/copy-button";
import { FatLossCalculator } from "@/components/fat-loss-calculator";
import { CarbCyclingCalculator } from "@/components/carb-cycling-calculator";
import { ProfileCard, ProfileSummary } from "@/components/profile-card";
import { RoadmapCalendar } from "@/components/roadmap-calendar";
import { CheckinTab, type CheckinSection } from "@/components/checkin-tab";
import { MacrosTab, type NutritionSection } from "@/components/macros-tab";
import { TodayTab, type TodayDestination } from "@/components/today-tab";
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
import { endPause, type PausePeriod } from "@/lib/pause";
import type { MySharing } from "@/lib/sharing";
import type { SavedMeal } from "@/lib/saved-meals";
import { loadSharing, saveSharing } from "@/components/coach-access";
import { answerAssignment, loadAssignments, loadProgramEdits, markProgramEditApplied } from "@/components/assignment-cards";
import { applyAssignedProgram, cleanAssignedProgram, type MemberAssignment } from "@/lib/assignments";
import { applyProgramEdit } from "@/lib/program-edits";
import { dayTargetFinder } from "@/lib/day-targets";
import { effectiveCarbInputs, maintenanceSource, timelineCalories } from "@/lib/plan-link";
import { sanitizeHabitDefs } from "@/lib/habits";
import {
  dropEntry,
  isRetryable,
  markDeleted,
  markSynced,
  overlay,
  pendingFor,
  pruneBackup,
  readAccount,
  readBackup,
  reconcile,
  recordChange,
  recordDelete,
  writeAccount,
  writeBackup,
  type BackupEntry,
} from "@/lib/workout-backup";
import {
  dropHabitDay,
  markHabitDaySaved,
  overlayHabitLogs,
  pendingHabitDays,
  pruneHabitBackup,
  readHabitBackup,
  recordHabitDay,
  writeHabitBackup,
  type HabitBackupEntry,
} from "@/lib/habit-backup";
import {
  dropDay,
  markDaySaved,
  overlayFoodLogs,
  overlayWeighIns,
  pendingDays,
  pruneDays,
  readFoodBackup,
  readWeighInBackup,
  recordDay,
  writeFoodBackup,
  writeWeighInBackup,
  type DayBackupEntry,
} from "@/lib/day-backup";
import { createWorkout, type Program, type ProgramDay, type TrainingSettings, type Workout } from "@/lib/training";
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

/**
 * Plan's sections. Each is still a destination of its own ("timeline", "carbs",
 * "roadmap"), so links and saved tabs from before Plan existed still land in
 * the right place; the tab bar shows them as one tab.
 */
const PLAN_SECTIONS = [
  { value: "timeline", label: "Timeline" },
  { value: "carbs", label: "Macros" },
  { value: "roadmap", label: "Roadmap" },
] as const;
type PlanSection = (typeof PLAN_SECTIONS)[number]["value"];
const isPlanTab = (t: AppTab): t is PlanSection => t === "timeline" || t === "carbs" || t === "roadmap";

/** True while a text field has focus, so the phone tab bar can step aside for the keyboard. */
function useTyping(): boolean {
  const [typing, setTyping] = React.useState(false);
  React.useEffect(() => {
    const NOT_TEXT = ["checkbox", "radio", "range", "button", "submit", "reset", "file", "color", "image"];
    const isText = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.isContentEditable || el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !NOT_TEXT.includes(el.type)));
    const onIn = (e: FocusEvent) => setTyping(isText(e.target));
    const onOut = (e: FocusEvent) => setTyping(isText(e.relatedTarget));
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  return typing;
}

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
 *  4. Workouts kept on this phone because the signal dropped (see
 *     src/lib/workout-backup.ts) are laid over the list, so the latest sets
 *     show straight away; they upload once the app is ready.
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
  /** The on-phone workout and habit backups and whose they are; `on` when in use. */
  workoutBackup: {
    entries: BackupEntry[];
    habits: HabitBackupEntry[];
    food: DayBackupEntry<FoodEntry[]>[];
    weighIns: DayBackupEntry<WeighIn>[];
    account: string | null;
    on: boolean;
  };
  /** The plan exactly as loaded from the cloud, if there was one. */
  cloudState: AppState | null;
}> {
  const fromUrl = decodeStateFromQuery(window.location.search);
  const stored = loadFromStorage();
  // A fresh open starts on Today; a reload (the tab is in the URL) stays put.
  let state: AppState = fromUrl ?? (stored ? { ...stored, activeTab: "today" } : DEFAULT_APP_STATE);
  if (fromUrl) state = { ...state, tracking: stored?.tracking ?? state.tracking };

  let session = await detectSession();
  const food = foodWindow(todayISO());

  if (session.mode === "cloud") {
    const cloud = createStore("cloud");
    const local = createStore("local");
    try {
      const plan = await cloud.loadPlan();
      const saved = plan ? sanitizeAppState(plan) : null;
      // Older plans saved the tab too; a fresh open still starts on Today.
      if (saved) state = fromUrl ? { ...state, tracking: saved.tracking } : { ...saved, activeTab: "today" };

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
      // And workouts kept on this phone when the signal dropped.
      const account = session.userId ?? null;
      if (account) writeAccount(account);
      const backup = account ? reconcile(pruneBackup(readBackup(), Date.now()), workouts, account) : [];
      if (account) writeBackup(backup);
      workouts = overlay(workouts, backup, account);
      // And habit ticks made with no signal.
      const habitBackup = account ? pruneHabitBackup(readHabitBackup(), Date.now()) : [];
      habitLogs = overlayHabitLogs(habitLogs, habitBackup, account);
      // And food days and weigh-ins saved with no signal.
      const foodBackup = account ? pruneDays(readFoodBackup(), Date.now()) : [];
      const weighInBackup = account ? pruneDays(readWeighInBackup(), Date.now()) : [];

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
        weighIns: overlayWeighIns(sortByDate(weighIns), weighInBackup, account),
        habitLogs,
        reviews,
        foodLogs: overlayFoodLogs(foodLogs, foodBackup, account),
        foodFrom: food.from,
        myFoods,
        measurements,
        workouts: [...workouts].sort(byWorkoutTime),
        workoutBackup: { entries: backup, habits: habitBackup, food: foodBackup, weighIns: weighInBackup, account, on: account !== null },
        cloudState: saved,
      };
    } catch {
      // Signed in, but the database call failed: keep working locally.
      session = { mode: "local", reason: "offline" };
    }
  }

  const store = createStore("local");
  // Opened with no signal: show the workouts kept on this phone for the
  // account last signed in here, so a workout in progress can carry on.
  const offline = session.mode === "local" && session.reason === "offline";
  const account = offline ? readAccount() : null;
  const backup = account ? pruneBackup(readBackup(), Date.now()) : [];
  const habitBackup = account ? pruneHabitBackup(readHabitBackup(), Date.now()) : [];
  const foodBackup = account ? pruneDays(readFoodBackup(), Date.now()) : [];
  const weighInBackup = account ? pruneDays(readWeighInBackup(), Date.now()) : [];
  return {
    state,
    session,
    store,
    weighIns: overlayWeighIns(await store.list(), weighInBackup, account),
    habitLogs: overlayHabitLogs(await store.listHabits(), habitBackup, account),
    reviews: await store.listReviews(),
    foodLogs: overlayFoodLogs(await store.listFoodLogs(food.from, food.to), foodBackup, account),
    foodFrom: food.from,
    myFoods: await store.listMyFoods(),
    measurements: await store.listMeasurements(),
    workouts: overlay(await store.listWorkouts(), backup, account).sort(byWorkoutTime),
    workoutBackup: { entries: backup, habits: habitBackup, food: foodBackup, weighIns: weighInBackup, account, on: account !== null },
    cloudState: null,
  };
}

export function AppShell() {
  const [state, setState] = React.useState<AppState>(DEFAULT_APP_STATE);
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
  // The on-phone workout backup (bad gym signal), whose it is, and the server
  // to upload it to (null while offline). Off in plain local mode.
  const backup = React.useRef<BackupEntry[]>([]);
  const habitBackup = React.useRef<HabitBackupEntry[]>([]);
  const foodBackup = React.useRef<DayBackupEntry<FoodEntry[]>[]>([]);
  const weighInBackup = React.useRef<DayBackupEntry<WeighIn>[]>([]);
  // Anything kept on the phone waiting for signal (workouts, habits, food, weigh-ins).
  const [offlineWaiting, setOfflineWaiting] = React.useState(0);
  // An upload just failed for lack of signal (or the app opened offline). Until
  // then, changes waiting a moment for their normal save aren't worth a notice.
  const [uploadStalled, setUploadStalled] = React.useState(false);
  const backupAccount = React.useRef<string | null>(null);
  const backupOn = React.useRef(false);
  const cloudTarget = React.useRef<CheckinStore | null>(null);
  const [unsyncedWorkouts, setUnsyncedWorkouts] = React.useState(0);
  // Whether this member shares their progress with their coach (cloud mode only).
  const [coachSharing, setCoachSharing] = React.useState<MySharing | null>(null);
  const [coachSharingError, setCoachSharingError] = React.useState<string | null>(null);
  // Programs and habit sets a coach has sent, waiting for an answer.
  const [assignments, setAssignments] = React.useState<MemberAssignment[]>([]);
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
        workoutBackup: {
          entries: [] as BackupEntry[],
          habits: [] as HabitBackupEntry[],
          food: [] as DayBackupEntry<FoodEntry[]>[],
          weighIns: [] as DayBackupEntry<WeighIn>[],
          account: null,
          on: false,
        },
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
      backup.current = result.workoutBackup.entries;
      habitBackup.current = result.workoutBackup.habits;
      foodBackup.current = result.workoutBackup.food;
      weighInBackup.current = result.workoutBackup.weighIns;
      backupAccount.current = result.workoutBackup.account;
      backupOn.current = result.workoutBackup.on;
      cloudTarget.current = result.store.mode === "cloud" ? result.store : null;
      setUploadStalled(result.workoutBackup.on && result.store.mode === "local");
      setUnsyncedWorkouts(pendingFor(backup.current, backupAccount.current).length);
      setOfflineWaiting(
        pendingFor(backup.current, backupAccount.current).length +
          pendingHabitDays(habitBackup.current, backupAccount.current).length +
          pendingDays(foodBackup.current, backupAccount.current).length +
          pendingDays(weighInBackup.current, backupAccount.current).length,
      );
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
    const scheduledAt = Date.now();
    const timer = setTimeout(() => {
      storeRef.current
        ?.savePlan(state)
        .then(() => {
          lastSynced.current = doc;
          setSyncError(false);
          confirmProgramEdits(scheduledAt);
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

  // Coming back to Plan opens the section you were last on.
  const lastPlanSection = React.useRef<PlanSection>("timeline");
  React.useEffect(() => {
    if (isPlanTab(state.activeTab)) lastPlanSection.current = state.activeTab;
  }, [state.activeTab]);
  const typing = useTyping();

  // Which Check-in sub-section is open. Links into Check-in from other tabs
  // open the section they're about (habits from Nutrition and the leaderboard,
  // weigh-ins from the roadmap).
  const [checkinSection, setCheckinSection] = React.useState<CheckinSection>("weigh-in");
  const navigateFor = React.useMemo(() => {
    const to = (section: CheckinSection) => (tab: AppTab) => {
      if (tab === "checkin") setCheckinSection(section);
      setTab(tab);
    };
    return { weighIn: to("weigh-in"), habits: to("habits") };
  }, [setTab]);

  // Nutrition's sub-section, so Today can open the fasting timer directly.
  const [nutritionSection, setNutritionSection] = React.useState<NutritionSection>("food");

  const openFromToday = React.useCallback(
    (dest: TodayDestination) => {
      if (dest === "weigh-in") navigateFor.weighIn("checkin");
      else if (dest === "habits") navigateFor.habits("checkin");
      else if (dest === "food" || dest === "fasting") {
        setNutritionSection(dest);
        setTab("macros");
      } else setTab(dest);
      window.scrollTo({ top: 0 });
    },
    [navigateFor, setTab],
  );

  // The carb plan as every screen uses it: Carb cycle's maintenance and daily
  // target follow the Timeline unless the member set their own (src/lib/plan-link.ts).
  const timelineHasPlan = React.useMemo(() => timelineCalories(state.profile, state.fatLoss) !== null, [state.profile, state.fatLoss]);
  const carbPlan = React.useMemo(
    () => effectiveCarbInputs(state.profile, state.fatLoss, state.carbs),
    [state.profile, state.fatLoss, state.carbs],
  );

  // What the Food log aims at today, shown on Carb cycle so its different number makes sense.
  const foodLogToday = React.useMemo(
    () => (today ? dayTargetFinder(state.profile, state.fatLoss, carbPlan, state.tracking.adjustments)(today) : null),
    [today, state.profile, state.fatLoss, carbPlan, state.tracking.adjustments],
  );

  const updateProfile = React.useCallback((patch: Partial<BiometricProfile>) => {
    setState((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));
  }, []);

  const updateFatLoss = React.useCallback((patch: Partial<FatLossInputs>) => {
    setState((prev) => ({ ...prev, fatLoss: { ...prev.fatLoss, ...patch } }));
  }, []);

  const updateCarbs = React.useCallback((patch: Partial<CarbCyclingInputs>) => {
    setState((prev) => ({ ...prev, carbs: { ...prev.carbs, ...patch } }));
  }, []);

  // Resets the calculator inputs. Applied adjustments are progress history, not
  // inputs, so they survive; only "delete all my data" removes them.
  const handleReset = React.useCallback(() => {
    clearStorage();
    setState((prev) => ({ ...DEFAULT_APP_STATE, activeTab: prev.activeTab, tracking: prev.tracking }));
  }, []);

  /* ------------------------------ check-ins ------------------------------ */

  const recountOffline = React.useCallback(() => {
    const a = backupAccount.current;
    setOfflineWaiting(
      pendingFor(backup.current, a).length +
        pendingHabitDays(habitBackup.current, a).length +
        pendingDays(foodBackup.current, a).length +
        pendingDays(weighInBackup.current, a).length,
    );
  }, []);

  const commitHabitBackup = React.useCallback(
    (next: HabitBackupEntry[]) => {
      habitBackup.current = next;
      writeHabitBackup(next);
      recountOffline();
    },
    [recountOffline],
  );

  const commitFoodBackup = React.useCallback(
    (next: DayBackupEntry<FoodEntry[]>[]) => {
      foodBackup.current = next;
      writeFoodBackup(next);
      recountOffline();
    },
    [recountOffline],
  );

  const commitWeighInBackup = React.useCallback(
    (next: DayBackupEntry<WeighIn>[]) => {
      weighInBackup.current = next;
      writeWeighInBackup(next);
      recountOffline();
    },
    [recountOffline],
  );

  const saveWeighIn = React.useCallback(
    async (w: WeighIn) => {
      const store = storeRef.current!;
      const account = backupOn.current ? backupAccount.current : null;
      const show = (x: WeighIn) => setWeighIns((prev) => sortByDate([...prev.filter((y) => y.date !== x.date), x]));
      try {
        const saved = await store.save(w);
        // Opened with no signal: saved here, and kept to upload. Otherwise it's newer than anything waiting.
        if (account) {
          commitWeighInBackup(
            store.mode === "local"
              ? recordDay(weighInBackup.current, saved.date, saved, account, Date.now())
              : dropDay(weighInBackup.current, saved.date, account),
          );
        }
        show(saved);
      } catch (e) {
        if (!account || store.mode === "local" || !isRetryable(e)) throw e;
        setUploadStalled(true);
        // No signal: keep it on the phone; it uploads with the workouts.
        commitWeighInBackup(recordDay(weighInBackup.current, w.date, w, account, Date.now()));
        show(w);
      }
    },
    [commitWeighInBackup],
  );

  const saveMeasurement = React.useCallback(async (m: Measurement) => {
    const saved = await storeRef.current!.saveMeasurement(m);
    setMeasurements((prev) => sortByDate([...prev.filter((x) => x.date !== saved.date), saved]));
  }, []);

  const deleteMeasurement = React.useCallback(async (date: string) => {
    await storeRef.current!.removeMeasurement(date);
    setMeasurements((prev) => prev.filter((x) => x.date !== date));
  }, []);

  const deleteWeighIn = React.useCallback(
    async (date: string) => {
      const store = storeRef.current!;
      const account = backupOn.current ? backupAccount.current : null;
      try {
        await store.remove(date);
        if (account) {
          commitWeighInBackup(
            store.mode === "local"
              ? recordDay(weighInBackup.current, date, null, account, Date.now())
              : dropDay(weighInBackup.current, date, account),
          );
        }
      } catch (e) {
        if (!account || store.mode === "local" || !isRetryable(e)) throw e;
        setUploadStalled(true);
        commitWeighInBackup(recordDay(weighInBackup.current, date, null, account, Date.now()));
      }
      setWeighIns((prev) => prev.filter((x) => x.date !== date));
    },
    [commitWeighInBackup],
  );

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


  const saveHabitDay = React.useCallback(
    async (log: HabitLog) => {
      const store = storeRef.current!;
      const account = backupOn.current ? backupAccount.current : null;
      const show = (saved: HabitLog) =>
        setHabitLogs((prev) => {
          const rest = prev.filter((l) => l.date !== saved.date);
          const next = Object.keys(saved.entries).length > 0 ? [...rest, saved] : rest;
          return next.sort((a, b) => (a.date < b.date ? -1 : 1));
        });
      if (account && store.mode === "local") {
        // Opened with no signal: saved here, and kept to upload once there's a connection.
        const saved = await store.saveHabits(log);
        commitHabitBackup(recordHabitDay(habitBackup.current, saved, account, Date.now()));
        show(saved);
        return;
      }
      try {
        const saved = await store.saveHabits(log);
        // Newer than anything waiting on the phone for that day.
        if (account) commitHabitBackup(dropHabitDay(habitBackup.current, saved.date, account));
        show(saved);
      } catch (e) {
        if (!account || !isRetryable(e)) throw e;
        setUploadStalled(true);
        // No signal: keep the day on the phone; it uploads with the workouts.
        commitHabitBackup(recordHabitDay(habitBackup.current, log, account, Date.now()));
        show(log);
      }
    },
    [commitHabitBackup],
  );

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
    const store = storeRef.current!;
    const account = backupOn.current ? backupAccount.current : null;
    const run = foodQueue.current
      .catch(() => {})
      .then(() => store.saveFoodLog({ date, entries }));
    foodQueue.current = run;
    return run.then(
      () => {
        // Opened with no signal: kept to upload. Otherwise newer than anything waiting.
        if (account) {
          commitFoodBackup(
            store.mode === "local"
              ? recordDay(foodBackup.current, date, entries, account, Date.now())
              : dropDay(foodBackup.current, date, account),
          );
        }
      },
      async (e: unknown) => {
        if (account && store.mode !== "local" && isRetryable(e)) {
          setUploadStalled(true);
          // No signal: the day stays on screen and on the phone, and uploads later.
          commitFoodBackup(recordDay(foodBackup.current, date, entries, account, Date.now()));
          return;
        }
        try {
          const [stored] = await storeRef.current!.listFoodLogs(date, date);
          setFoodLogs((prev) => withFoodDay(prev, date, stored?.entries ?? []));
        } catch {
          /* leave the screen as it is */
        }
        throw e instanceof Error ? e : new Error("Couldn't save. Try again.");
      },
    );
  }, [commitFoodBackup]);

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

  const commitBackup = React.useCallback((next: BackupEntry[]) => {
    backup.current = next;
    writeBackup(next);
    setUnsyncedWorkouts(pendingFor(next, backupAccount.current).length);
    recountOffline();
  }, [recountOffline]);

  /**
   * Save workout changes: to this browser's store in local mode (and while
   * offline), and — when there's a server — everything in the on-phone backup
   * it doesn't have yet. Losing signal isn't an error: the changes are safe on
   * the phone and go up on the next try.
   */
  const flushWorkouts = React.useCallback((): Promise<void> => {
    if (workoutTimer.current) clearTimeout(workoutTimer.current);
    workoutTimer.current = null;
    const store = storeRef.current;
    if (!store) return Promise.resolve();
    const batch = [...pendingWorkouts.current.values()];
    pendingWorkouts.current.clear();
    let refused: string | null = null;
    const run = workoutQueue.current
      .catch(() => {})
      .then(async () => {
        for (const w of batch) await store.saveWorkout(w);
        const target = cloudTarget.current;
        if (!target || !backupOn.current) return;
        for (const e of pendingFor(backup.current, backupAccount.current)) {
          try {
            if (e.workout) {
              await target.saveWorkout(e.workout);
              commitBackup(markSynced(backup.current, e.workout));
            } else {
              await target.removeWorkout(e.id);
              commitBackup(markDeleted(backup.current, e.id));
            }
          } catch (err) {
            if (isRetryable(err)) throw err; // no signal: stop here, try again later
            // The server refused it (it isn't valid): retrying won't help.
            commitBackup(dropEntry(backup.current, e.id));
            refused = err instanceof Error ? err.message : "The server refused a workout.";
          }
        }
        // Habit ticks made with no signal (e.g. "Completed workout" on finishing).
        const account = backupAccount.current!;
        for (const h of pendingHabitDays(habitBackup.current, account)) {
          const log = { date: h.date, entries: h.entries };
          try {
            await target.saveHabits(log);
            commitHabitBackup(markHabitDaySaved(habitBackup.current, log, account));
          } catch (err) {
            if (isRetryable(err)) throw err;
            commitHabitBackup(dropHabitDay(habitBackup.current, h.date, account));
          }
        }
        // Food days and weigh-ins saved with no signal.
        for (const d of pendingDays(foodBackup.current, account)) {
          try {
            await target.saveFoodLog({ date: d.date, entries: d.value ?? [] });
            commitFoodBackup(markDaySaved(foodBackup.current, d.date, d.value, account));
          } catch (err) {
            if (isRetryable(err)) throw err;
            commitFoodBackup(dropDay(foodBackup.current, d.date, account));
          }
        }
        for (const d of pendingDays(weighInBackup.current, account)) {
          try {
            if (d.value) await target.save(d.value);
            else await target.remove(d.date);
            commitWeighInBackup(markDaySaved(weighInBackup.current, d.date, d.value, account));
          } catch (err) {
            if (isRetryable(err)) throw err;
            commitWeighInBackup(dropDay(weighInBackup.current, d.date, account));
          }
        }
      });
    workoutQueue.current = run;
    return run.then(
      () => {
        setWorkoutSaveError(refused ? `Couldn't save a workout: ${refused}` : null);
        // Got through to the server: nothing is stuck any more.
        if (cloudTarget.current) setUploadStalled(false);
      },
      (e: unknown) => {
        // Kept on the phone: shown as waiting to upload, not as an error.
        if (backupOn.current && isRetryable(e)) {
          setUploadStalled(true);
          setWorkoutSaveError(null);
          return;
        }
        // Keep them pending so the next change (or leaving the page) tries again.
        for (const w of batch) if (!pendingWorkouts.current.has(w.id)) pendingWorkouts.current.set(w.id, w);
        setWorkoutSaveError(e instanceof Error ? e.message : "Couldn't save your workout. Try again.");
        throw e instanceof Error ? e : new Error("Couldn't save your workout.");
      },
    );
  }, [commitBackup, commitHabitBackup, commitFoodBackup, commitWeighInBackup]);

  /** Show a workout change straight away; save it shortly after (or now). */
  const saveWorkout = React.useCallback(
    (w: Workout, now = false): Promise<void> => {
      setWorkouts((prev) => [...prev.filter((x) => x.id !== w.id), w].sort(byWorkoutTime));
      // On the phone first, so a dropped signal can't lose it.
      if (backupOn.current) commitBackup(recordChange(backup.current, w, backupAccount.current, Date.now()));
      // The backup carries it to the server; the browser's own store needs it directly.
      if (!backupOn.current || storeRef.current?.mode === "local") pendingWorkouts.current.set(w.id, w);
      if (now) return flushWorkouts();
      if (workoutTimer.current) clearTimeout(workoutTimer.current);
      workoutTimer.current = setTimeout(() => {
        flushWorkouts().catch(() => {});
      }, WORKOUT_SAVE_DEBOUNCE_MS);
      return Promise.resolve();
    },
    [flushWorkouts, commitBackup],
  );

  /** Start a program day from Today, then show it on the Training tab. */
  const startWorkout = React.useCallback(
    (program: Program, day: ProgramDay) => {
      const w = createWorkout({
        id: newId(),
        date: today,
        program,
        day,
        custom: state.tracking.training.customExercises,
        workouts,
      });
      saveWorkout(w, true).catch(() => {});
      setTab("training");
      window.scrollTo({ top: 0 });
    },
    [today, state.tracking.training.customExercises, workouts, saveWorkout, setTab],
  );

  const removeWorkout = React.useCallback(
    async (id: string) => {
      pendingWorkouts.current.delete(id);
      const store = storeRef.current!;
      if (backupOn.current) {
        // Gone from the screen now; the server deletes it when there's signal.
        commitBackup(recordDelete(backup.current, id, backupAccount.current, Date.now()));
        if (store.mode === "local") {
          await workoutQueue.current.catch(() => {});
          await store.removeWorkout(id);
        }
        setWorkouts((prev) => prev.filter((x) => x.id !== id));
        await flushWorkouts();
        return;
      }
      await workoutQueue.current.catch(() => {});
      await store.removeWorkout(id);
      setWorkouts((prev) => prev.filter((x) => x.id !== id));
    },
    [commitBackup, flushWorkouts],
  );

  // Leaving the page (or switching apps on a phone) saves anything unsaved.
  React.useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushWorkouts().catch(() => {});
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flushWorkouts]);

  // Upload what's waiting on the phone: once ready, when the signal comes
  // back, and every 30 s while anything is waiting. Opened offline, the first
  // reconnect also checks it's the same Whop account before uploading.
  React.useEffect(() => {
    if (!ready || !backupOn.current) return;
    let checking = false;
    const retry = async () => {
      if (!cloudTarget.current) {
        if (checking || (typeof navigator !== "undefined" && navigator.onLine === false)) return;
        checking = true;
        try {
          const s = await detectSession();
          if (s.mode === "cloud" && s.userId && s.userId === backupAccount.current) cloudTarget.current = createStore("cloud");
        } finally {
          checking = false;
        }
        if (!cloudTarget.current) return;
      }
      flushWorkouts().catch(() => {});
    };
    const waiting = () =>
      pendingFor(backup.current, backupAccount.current).length > 0 ||
      pendingHabitDays(habitBackup.current, backupAccount.current).length > 0 ||
      pendingDays(foodBackup.current, backupAccount.current).length > 0 ||
      pendingDays(weighInBackup.current, backupAccount.current).length > 0;
    if (waiting()) void retry();
    const onOnline = () => void retry();
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(() => {
      if (waiting()) void retry();
    }, 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
    };
  }, [ready, flushWorkouts]);

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

  // Coach access: load the member's choice (and any request) once ready.
  React.useEffect(() => {
    if (!ready || session.mode !== "cloud") return;
    let cancelled = false;
    loadSharing(experienceIdFromPath(window.location.pathname))
      .then((s) => {
        if (!cancelled) setCoachSharing(s);
      })
      .catch(() => {
        if (!cancelled) setCoachSharingError("Couldn't load your coach access setting. Try reopening the app.");
      });
    return () => {
      cancelled = true;
    };
  }, [ready, session.mode]);

  React.useEffect(() => {
    if (!ready || session.mode !== "cloud") return;
    let cancelled = false;
    loadAssignments()
      .then((list) => {
        if (!cancelled) setAssignments(list);
      })
      .catch(() => {
        /* nothing to show; tried again next open */
      });
    return () => {
      cancelled = true;
    };
  }, [ready, session.mode]);

  // Coach edits to my programs (coach dashboard → Training program). Applied
  // here, by this app, so nothing the coach changed can be overwritten by this
  // app's next save. Each edit is confirmed to the server only after a plan
  // save that includes it, so closing the app straight away can't lose it: an
  // unconfirmed edit is simply applied again next open.
  const [coachUpdated, setCoachUpdated] = React.useState<string[]>([]);
  const trainingRef = React.useRef(state.tracking.training);
  trainingRef.current = state.tracking.training;
  const editsToConfirm = React.useRef<{ ids: string[]; since: number } | null>(null);
  const confirmProgramEdits = React.useCallback((savedFrom: number) => {
    const pending = editsToConfirm.current;
    if (!pending || savedFrom < pending.since) return;
    editsToConfirm.current = null;
    for (const id of pending.ids) void markProgramEditApplied(id).catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!ready || session.mode !== "cloud") return;
    let cancelled = false;
    loadProgramEdits()
      .then((edits) => {
        if (cancelled || edits.length === 0) return;
        const before = trainingRef.current;
        let training = before;
        const names: string[] = [];
        for (const e of edits) {
          const next = applyProgramEdit(training, e);
          if (next) {
            training = next;
            names.push(e.program.name);
          }
        }
        const ids = edits.map((e) => e.id);
        if (JSON.stringify(training) === JSON.stringify(before)) {
          // Nothing changes here (the program is gone, or already matches): nothing to save first.
          for (const id of ids) void markProgramEditApplied(id).catch(() => {});
          return;
        }
        editsToConfirm.current = { ids, since: Date.now() };
        setState((prev) => ({ ...prev, tracking: { ...prev.tracking, training } }));
        setCoachUpdated([...new Set(names)]);
      })
      .catch(() => {
        /* nothing applied; tried again next open */
      });
    return () => {
      cancelled = true;
    };
  }, [ready, session.mode]);

  /** Use a coach's assignment: add the program (made active) or switch to the habits. */
  const useAssignment = React.useCallback(
    async (a: MemberAssignment): Promise<string | null> => {
      if (a.kind === "program") {
        const program = cleanAssignedProgram(a.program);
        if (!program) return "This program can't be used. Ask your coach to send it again.";
        const applied = applyAssignedProgram(state.tracking.training, a.id, program);
        if (!applied.ok) return applied.error;
        setState((prev) => ({ ...prev, tracking: { ...prev.tracking, training: applied.settings } }));
      } else {
        const habits = sanitizeHabitDefs(a.habits ?? []);
        if (habits.length === 0) return "These habits can't be used. Ask your coach to send them again.";
        setState((prev) => ({ ...prev, tracking: { ...prev.tracking, habits } }));
      }
      await answerAssignment(a.id, true).catch(() => {});
      setAssignments((prev) => prev.filter((x) => x.id !== a.id));
      return null;
    },
    [state.tracking.training],
  );

  const declineAssignment = React.useCallback(async (a: MemberAssignment) => {
    await answerAssignment(a.id, false);
    setAssignments((prev) => prev.filter((x) => x.id !== a.id));
  }, []);

  const changeCoachSharing = React.useCallback(async (shared: boolean) => {
    try {
      setCoachSharing(await saveSharing(shared));
      setCoachSharingError(null);
    } catch (e) {
      setCoachSharingError(e instanceof Error ? e.message : "Couldn't save that. Try again.");
      throw e;
    }
  }, []);

  const updateSavedMeals = React.useCallback((savedMeals: SavedMeal[]) => {
    setState((prev) => ({ ...prev, tracking: { ...prev.tracking, savedMeals } }));
  }, []);

  const updatePauses = React.useCallback((pauses: PausePeriod[]) => {
    setState((prev) => ({ ...prev, tracking: { ...prev.tracking, pauses } }));
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
    // This account's workouts kept on the phone go too.
    if (backupOn.current) {
      commitBackup(backup.current.filter((e) => e.account !== backupAccount.current));
      commitHabitBackup(habitBackup.current.filter((e) => e.account !== backupAccount.current));
      commitFoodBackup(foodBackup.current.filter((e) => e.account !== backupAccount.current));
      commitWeighInBackup(weighInBackup.current.filter((e) => e.account !== backupAccount.current));
    }
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
    setCoachSharing((prev) => (prev ? { shared: false, sharedAt: null, requestedAt: null } : prev));
    setAssignments([]);
    setState(reset);
  }, [state.unit, commitBackup, commitHabitBackup, commitFoodBackup, commitWeighInBackup]);

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
      <div
        className={cn(
          "min-h-screen bg-background",
          // Height of the phone tab bar, so the rest timer sits above it. Zero while it's hidden for typing.
          !typing && "max-sm:[--bottom-nav:calc(4rem_+_env(safe-area-inset-bottom))]",
        )}
      >
        <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="container flex h-16 items-center gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <SettingsMenu
                unit={state.unit}
                onUnitChange={(unit) => setState((prev) => ({ ...prev, unit }))}
                pause={ready ? { pauses: state.tracking.pauses, today, onChange: updatePauses } : undefined}
                coach={
                  ready
                    ? {
                        available: session.mode === "cloud",
                        sharing: coachSharing,
                        error: coachSharingError,
                        onChange: async (shared) => {
                          await changeCoachSharing(shared).catch(() => {});
                        },
                      }
                    : undefined
                }
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

        <main className="container py-6 max-sm:pb-[calc(5.5rem_+_env(safe-area-inset-bottom))]">
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
            <Tabs
              // On phones the tab bar is at the bottom, so pages start closer to the header.
              className="max-sm:[&>[role=tabpanel]]:mt-2"
              value={isPlanTab(state.activeTab) ? "plan" : state.activeTab}
              onValueChange={(value) => setTab(value === "plan" ? lastPlanSection.current : (value as AppTab))}
            >
              <div className="flex flex-wrap items-center gap-3">
                {/* Phones: a bar fixed to the bottom of the screen, icon over label, hidden while
                    typing so it doesn't ride up on the keyboard. Wider screens: a row at the top. */}
                <TabsList
                  className={cn(
                    "scrollbar-thin sm:relative sm:max-w-full sm:gap-1 sm:overflow-x-auto sm:[&>button]:px-3 md:[&>button]:px-4",
                    "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-40 max-sm:grid max-sm:grid-cols-6 max-sm:gap-0 max-sm:rounded-none max-sm:border-x-0 max-sm:border-b-0 max-sm:bg-background/95 max-sm:px-1 max-sm:pb-[max(0.25rem,env(safe-area-inset-bottom))] max-sm:pt-1 max-sm:backdrop-blur",
                    "max-sm:[&>button]:h-14 max-sm:[&>button]:flex-col max-sm:[&>button]:gap-1 max-sm:[&>button]:px-0 max-sm:[&>button]:text-[11px] max-sm:[&_svg]:size-5",
                    "max-sm:[&>button[data-state=active]]:bg-primary/10 max-sm:[&>button[data-state=active]]:text-primary max-sm:[&>button[data-state=active]]:shadow-none",
                    typing && "max-sm:hidden",
                  )}
                >
                  <TabsTrigger value="today">
                    <House />
                    Today
                  </TabsTrigger>
                  <TabsTrigger value="plan">
                    <Target />
                    Plan
                  </TabsTrigger>
                  <TabsTrigger value="checkin">
                    <TrendingUp />
                    Progress
                  </TabsTrigger>
                  <TabsTrigger value="macros">
                    <Utensils />
                    Food
                  </TabsTrigger>
                  <TabsTrigger value="training">
                    <Dumbbell />
                    Training
                  </TabsTrigger>
                  <TabsTrigger value="leaderboard">
                    <Trophy />
                    Ranks
                  </TabsTrigger>
                </TabsList>

                {offlineWaiting > 0 && uploadStalled ? (
                  <Badge variant="secondary" role="status" title="Saved on this phone; uploads as soon as you're back online, even if you close the app.">
                    <CloudOff />
                    {offlineWaiting === 1 ? "1 change" : `${offlineWaiting} changes`} saved on this phone
                  </Badge>
                ) : null}
                {syncError ? (
                  <Badge variant="warning" role="status">
                    <CloudOff />
                    Couldn&apos;t sync — changes kept on this device
                  </Badge>
                ) : null}
              </div>

              {coachUpdated.length > 0 ? (
                <div role="status" className="mt-4 flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
                  <Dumbbell className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="min-w-0 flex-1">
                    Your coach updated your {coachUpdated.length === 1 ? "program" : "programs"}{" "}
                    {coachUpdated.map((n) => `“${n}”`).join(" and ")}.{" "}
                    <button
                      type="button"
                      className="font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
                      onClick={() => {
                        setTab("training");
                        setCoachUpdated([]);
                      }}
                    >
                      See it in Training
                    </button>
                  </p>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Dismiss" onClick={() => setCoachUpdated([])}>
                    <X />
                  </Button>
                </div>
              ) : null}

              <TabsContent value="today">
                <TodayTab
                  today={today}
                  unit={state.unit}
                  profile={state.profile}
                  fatLoss={state.fatLoss}
                  carbs={carbPlan}
                  adjustments={state.tracking.adjustments}
                  habits={state.tracking.habits}
                  habitLogs={habitLogs}
                  onSaveHabits={saveHabitDay}
                  weighIns={weighIns}
                  onSaveWeighIn={saveWeighIn}
                  foodLogs={foodLogs}
                  workouts={workouts}
                  training={state.tracking.training}
                  onStartWorkout={startWorkout}
                  fasting={state.tracking.fasting}
                  measurements={measurements}
                  pauses={state.tracking.pauses}
                  onResume={() => updatePauses(endPause(state.tracking.pauses, today))}
                  coachSharing={coachSharing}
                  onCoachSharing={changeCoachSharing}
                  assignments={assignments}
                  onUseAssignment={useAssignment}
                  onDeclineAssignment={declineAssignment}
                  onOpen={openFromToday}
                />
              </TabsContent>

              <TabsContent value="plan" className="space-y-5">
                <SegmentedControl
                  ariaLabel="Plan section"
                  value={isPlanTab(state.activeTab) ? state.activeTab : "timeline"}
                  onValueChange={(v) => setTab(v)}
                  options={PLAN_SECTIONS}
                  className="max-w-sm"
                />
                {state.activeTab === "roadmap" ? (
                  <RoadmapCalendar
                    profile={state.profile}
                    fatLoss={state.fatLoss}
                    carbs={carbPlan}
                    unit={state.unit}
                    weighIns={weighIns}
                    adjustments={state.tracking.adjustments}
                    onCarbsChange={updateCarbs}
                    onNavigate={navigateFor.weighIn}
                  />
                ) : state.activeTab === "carbs" ? (
                  <CarbCyclingCalculator
                    profile={state.profile}
                    inputs={carbPlan}
                    onChange={updateCarbs}
                    unit={state.unit}
                    following={state.carbs.followTimeline && timelineHasPlan}
                    maintenanceNote={maintenanceSource(state.profile, state.fatLoss)}
                    canFollow={timelineHasPlan}
                    // "About you" is shared with the Timeline and edited there.
                    profileSlot={<ProfileSummary profile={state.profile} unit={state.unit} onEdit={() => setTab("timeline")} />}
                    foodLogToday={foodLogToday}
                    onOpenRoadmap={() => setTab("roadmap")}
                  />
                ) : (
                  <FatLossCalculator
                    profile={state.profile}
                    inputs={state.fatLoss}
                    onChange={updateFatLoss}
                    unit={state.unit}
                    profileSlot={
                      <ProfileCard profile={state.profile} onChange={updateProfile} unit={state.unit} />
                    }
                    weighIns={weighIns}
                  />
                )}
              </TabsContent>

              <TabsContent value="macros">
                <MacrosTab
                  profile={state.profile}
                  fatLoss={state.fatLoss}
                  carbs={carbPlan}
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
                  section={nutritionSection}
                  onSectionChange={setNutritionSection}
                  unit={state.unit}
                  savedMeals={state.tracking.savedMeals}
                  onSavedMealsChange={updateSavedMeals}
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
                  formCheckAvailability={notifyAvailability}
                  unsyncedWorkouts={uploadStalled ? unsyncedWorkouts : 0}
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
                  carbs={carbPlan}
                  habits={state.tracking.habits}
                  habitLogs={habitLogs}
                  pauses={state.tracking.pauses}
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
