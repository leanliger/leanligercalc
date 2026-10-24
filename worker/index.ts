/**
 * Cloudflare Worker: static site + check-in API.
 *
 * Everything outside /api/* is the statically exported Next.js app, served
 * straight from the ASSETS binding (and so still gets the frame-ancestors
 * policy from public/_headers). /api/* is handled here.
 *
 *   GET    /api/session            who am I / is cloud storage available
 *   GET    /api/weigh-ins          all of my weigh-ins, oldest first
 *   PUT    /api/weigh-ins/:date    create or replace one day's weigh-in
 *   DELETE /api/weigh-ins/:date    remove one day's weigh-in
 *   GET    /api/plan               my saved calculator setup
 *   PUT    /api/plan               save my calculator setup
 *   GET    /api/habits             all of my daily habit logs
 *   PUT    /api/habits/:date       replace one day's habit log ({} deletes it)
 *   GET    /api/reviews            all of my weekly self-audits
 *   PUT    /api/reviews/:monday    save one week's self-audit (empty deletes it)
 *   GET    /api/food-logs?from&to  my food logs in a date range
 *   PUT    /api/food-logs/:date    replace one day's food log ([] deletes it)
 *   GET    /api/my-foods           foods I typed in myself
 *   PUT    /api/my-foods/:id       save one of my foods
 *   DELETE /api/my-foods/:id       remove one of my foods
 *   PUT    /api/fasting-reminders  turn on / update my fasting notifications
 *   DELETE /api/fasting-reminders  turn them off
 *   PUT    /api/reminders          set my weigh-in / habits / recap reminders
 *   DELETE /api/reminders          turn them all off
 *   GET    /api/coach/overview?company=biz_…  coach dashboard (admins of that whop only)
 *   GET    /api/measurements       my body measurements
 *   PUT    /api/measurements/:date save one day's measurements   DELETE … remove it
 *   GET    /api/physique          my past physique analyses
 *   POST   /api/physique          run one on my saved photos or an uploaded set
 *   POST   /api/physique/compare  compare my newest photos with ones from about a month earlier { before? }
 *   GET/PUT /api/testimonial-consent      may my coach use my comparisons as testimonials { allowed }
 *   POST   /api/food/label              read a nutrition label photo { image, mediaType } (see label-photo.ts)
 *   POST   /api/food/describe           split a described meal into foods { text } (see meal-describe.ts)
 *   GET/PUT /api/measurement-settings    my "Time to measure" reminder switch { reminder } (see measure-day.ts)
 *   GET    /api/coach/member-food?company=…&member=…  coaches: a member's daily food totals, 26 weeks (see member-food.ts)
 *   GET    /api/coach/member-timeline?company=…&member=…&unit=…&days=…  coaches: one feed of what a member did and what you sent (see member-timeline.ts)
 *   GET    /api/coach/nudges?company=…               coaches: automatic nudge rules and what was sent; PUT to save them (see nudges.ts)
 *   GET    /api/coach/program-results?company=…      coaches: how members are doing on each program sent (see program-results.ts)
 *   GET/POST /api/messages?experience=…               members: my chat with my coach (see messages.ts); POST /api/messages/attachment, GET /api/messages/attachment/:id
 *   GET/POST /api/coach/messages?company&member       coaches: a member's chat; GET /api/coach/threads?company=… every chat
 *   POST   /api/coach/messages/bulk, /api/coach/messages/attachment; GET /api/coach/messages/attachment/:id; DELETE /api/coach/messages/:id (scheduled)
 *   GET/POST /api/coach/saved-replies?company=…       coaches: saved replies; DELETE /api/coach/saved-replies/:id (see saved-replies.ts)
 *   POST   /api/coach/tags/bulk                       coaches: add or remove a tag for many members (see coaching.ts)
 *   POST   /api/coach/macros/bulk                     coaches: set or adjust macros for many members (see coaching.ts)
 *   GET/POST /api/coach/announcements?company=…       coaches: announcements; DELETE /api/coach/announcements/:id?company=…
 *   GET    /api/notifications?experience=…           members: my notification bell; POST /api/notifications/seen (see notifications.ts)
 *   GET/PUT /api/coach/digest?company=…              coaches: my daily digest switch (see digest.ts)
 *   GET/PUT/DELETE /api/water-reminders  my hydration reminders (see water-reminders.ts)
 *   POST   /api/coach/checkins/draft    coaches: an AI draft reply to a check-in (see checkin-drafts.ts)
 *   GET    /api/coach/testimonials?company=…  coaches: members who said yes, with their newest comparison
 *   GET/POST /api/photos, GET/DELETE /api/photos/:id, PUT /api/photo-settings
 *                                   progress photos (optional; see photos.ts)
 *   GET    /api/coach/photo?company&member&id  a shared member photo (admins only)
 *   GET    /api/sharing?experience=exp_…      my coach-access choice and any pending request
 *   PUT    /api/sharing                       share with my coach, stop, or "Not now"
 *   POST   /api/coach/sharing/request         coaches: ask a member to share { company, member }
 *   POST   /api/coach/sharing/stop            coaches: stop viewing a member { company, member }
 *   GET    /api/coach/assignments?company=…   coaches: programs / habit sets sent, and saved groups
 *   POST   /api/coach/assignments             coaches: send one to everyone, a group or a member
 *   DELETE /api/coach/assignments/:id?company  coaches: cancel one
 *   POST   /api/coach/groups                  coaches: save a group; PUT/DELETE /api/coach/groups/:id
 *   GET    /api/coach/programs?company=…      coaches: saved programs; POST to save, PUT/DELETE /api/coach/programs/:id
 *   GET    /api/coach/member-training?company=…&member=…  coaches: a member's programs; PUT to save an edit
 *   GET    /api/coach/member-workouts?company=…&member=…  coaches: a member's workouts (newest 500)
 *   GET    /api/coach/member-physique?company=…&member=…  coaches: a member's latest physique analysis (photo sharing only)
 *   PUT    /api/coach/comparison-comment          coaches: a comment on a member's monthly comparison (see physique-focus.ts)
 *   GET/POST /api/coach/reminders?company=…           coaches: on-demand reminders to members (see coach-reminders.ts)
 *   GET    /api/coach/community-stats?company=…&period=…  coaches: totals across sharing members, for marketing (see community-stats.ts)
 *   …      notes, check-ins and coach-set macros: see coaching.ts
 *   GET    /api/program-edits                 members: coach edits waiting for my app; POST /api/program-edits/:id/applied
 *   GET    /api/assignments                   members: assignments waiting for me
 *   PUT    /api/assignments/:id               members: { accept } used it, or Not now
 *   GET    /api/leaderboard?experience=exp_…  community streak leaderboard (members only)
 *   PUT    /api/leaderboard        join it        DELETE /api/leaderboard?experience=…  leave it
 *   GET    /api/lift-board?experience=exp_…  lift leaderboard, my submissions, review queue (admins)
 *   POST   /api/lift-board/submissions        submit a lift with a video link
 *   DELETE /api/lift-board/submissions/:id    withdraw one of mine
 *   PUT    /api/lift-board/submissions/:id/review  admins: approve or reject
 *   GET    /api/form-checks?experience=exp_…  my form checks (+ the queue for admins)
 *   POST   /api/form-checks                   ask for a form check with a video link
 *   DELETE /api/form-checks/:id               withdraw / delete one of mine
 *   PUT    /api/form-checks/:id/feedback      admins: reply
 *   GET    /api/workouts           all of my workouts, oldest first
 *   PUT    /api/workouts/:id       save one workout (also while it's in progress)
 *   DELETE /api/workouts/:id       remove one workout
 *   DELETE /api/me                 delete everything stored about me
 *   GET/POST/DELETE /api/steps-sync/key  my iPhone step sync key (see steps-sync.ts)
 *
 * The user id only ever comes from a verified Whop token (see auth.ts) and is
 * never read from a request body or URL.
 *
 * Two food-database routes are public, since they hold no personal data and
 * food logging must work outside Whop too (see food.ts):
 *
 *   GET    /api/food/barcode/:code product details for a barcode
 *   GET    /api/food/search?q=     search products by name
 *
 * One route is signed with a member's step sync key instead of a Whop token,
 * because it's called by an Apple Shortcut on their phone; the key can only
 * set a day's step count (steps-sync.ts):
 *
 *   POST   /api/steps-sync         { steps, date }
 *
 * A Cron Trigger also runs every minute to send fasting, check-in and
 * "Finished your workout?" notifications through Whop (see reminders.ts).
 */

import { authenticate, servePageWithToken, type AuthEnv } from "./auth";
import { receiveSteps, stepSyncKey } from "./steps-sync";
import { coachMemberPhysique, saveComparisonComment } from "./physique-focus";
import { coachTestimonials, getConsent, setConsent } from "./testimonials";
import { sendCompareNudges } from "./compare-nudges";
import { readLabelPhoto } from "./label-photo";
import { describeMeal } from "./meal-describe";
import { measurementSettings, sendMeasureDayReminders } from "./measure-day";
import { coachMemberFood } from "./member-food";
import { coachMemberTimeline } from "./member-timeline";
import { getNudges, saveNudges, sendCoachNudges } from "./nudges";
import { coachProgramResults } from "./program-results";
import { communityStats } from "./community-stats";
import { getReminders, sendReminder } from "./coach-reminders";
import {
  cancelScheduledMessage,
  coachAttachment,
  coachThreads,
  deleteAnnouncement,
  deleteChatAttachments,
  deliverScheduled,
  getAnnouncements,
  getMemberThread,
  getMyMessages,
  memberAttachment,
  postAnnouncement,
  sendAttachment,
  sendBulkMessage,
  sendCoachMessage,
  sendMyMessage,
} from "./messages";
import { deleteSavedReply, getSavedReplies, saveSavedReply } from "./saved-replies";
import { getNotifications, markNotificationsSeen } from "./notifications";
import { getDigest, saveDigest, sendCoachDigests } from "./digest";
import { checkMilestones } from "./milestones";
import { draftCheckinReply } from "./checkin-drafts";
import { sendPhotoDayReminders } from "./photo-day";
import { sendDueWaterReminders, waterReminders } from "./water-reminders";
import { estimateMealPhoto, mealPhotosOn, type MealPhotoEnv } from "./meal-photo";
import { analyzePhysique, comparePhysique, listPhysique, physiqueOn, type PhysiqueEnv } from "./physique";
import { coachVoice, deleteVoiceReplies, memberVoice, uploadVoiceReply } from "./voice-replies";
import {
  coachCheckins,
  coachClearMacros,
  coachReport,
  getMyReport,
  getTags,
  saveTags,
  bulkMacros,
  bulkMemberTags,
  setMemberTags,
  shareReport,
  coachGetMacros,
  coachSetMacros,
  getCoachNote,
  getMyCheckins,
  getMyMacros,
  replyToCheckin,
  saveCoachNote,
  submitCheckin,
} from "./coaching";
import { coachMemberTraining, coachMemberWorkouts, markProgramEditApplied, myProgramEdits, saveMemberProgram } from "./program-edits";
import { PROGRAM_EDIT_ID_PATTERN } from "../src/lib/program-edits";
import {
  MAX_WEIGH_INS,
  PLAN_MAX_BYTES,
  validateWeighIn,
  type WeighIn,
} from "../src/lib/tracking";
import { MAX_HABIT_LOGS, validateHabitEntries, type HabitLog } from "../src/lib/habits";
import { MAX_REVIEWS, isEmptyReview, validateReview, type WeeklyReview } from "../src/lib/reviews";
import {
  MAX_FOOD_LOG_DAYS,
  MAX_FOOD_RANGE_DAYS,
  MAX_MY_FOODS,
  validateFoodLog,
  validateMyFood,
  type FoodEntry,
  type FoodLog,
  type FoodProduct,
} from "../src/lib/food";
import { addDays, isValidISODate } from "../src/lib/dates";
import { lookupBarcode, rateLimited, searchFoods, type FoodEnv, type FoodResult } from "./food";
import {
  deleteReminder,
  deleteReminders,
  saveReminder,
  saveReminders,
  sendDueReminders,
  type ReminderEnv,
} from "./reminders";
import { validateReminderRequest } from "../src/lib/fasting";
import { validateRemindersRequest } from "../src/lib/reminders";
import { coachOverview, coachPhoto, type CoachEnv } from "./coach";
import { getMySharing, requestSharing, setMySharing, stopSharing } from "./sharing";
import {
  ASSIGNMENT_ID_PATTERN,
  answerAssignment,
  cancelAssignment,
  coachChallenge,
  myChallenges,
  createAssignment,
  deleteGroup,
  deleteProgram,
  listPrograms,
  saveProgram,
  listAssignments,
  myAssignments,
  saveGroup,
} from "./assignments";
import { deleteAllPhotos, deletePhoto, listPhotos, setSharing, streamPhoto, uploadPhoto } from "./photos";
import { MAX_MEASUREMENTS, validateMeasurement, type Measurement } from "../src/lib/measurements";
import { MAX_WORKOUTS, WORKOUT_ID_PATTERN, validateWorkout, type Workout } from "../src/lib/training";
import { getLeaderboard, joinLeaderboard, leaveLeaderboard, type LeaderboardEnv } from "./leaderboard";
import { getLiftBoard, reviewLift, submitLift, withdrawLift } from "./lift-board";
import { SUBMISSION_ID_PATTERN } from "../src/lib/lift-board";
import { answerFormCheck, askFormCheck, deleteFormCheck, getFormChecks } from "./form-checks";
import { FORM_CHECK_ID_PATTERN } from "../src/lib/form-checks";
import { secretValue } from "./secrets";

export interface Env extends AuthEnv, FoodEnv, ReminderEnv, CoachEnv, LeaderboardEnv, MealPhotoEnv, PhysiqueEnv {
  DB: D1Database;
  ASSETS: Fetcher;
}

const MAX_BODY_BYTES = PLAN_MAX_BYTES + 1024;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Personal health data: never cache it anywhere.
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

const noContent = () =>
  new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

const error = (status: number, message: string) => json({ error: message }, status);

/**
 * Read a JSON body with a hard size cap. Requiring application/json also means
 * a cross-site HTML form cannot reach these endpoints without a CORS
 * preflight, which this API never grants.
 */
async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: error(415, "Content-Type must be application/json.") };
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, response: error(413, "Request body too large.") };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: error(400, "Body is not valid JSON.") };
  }
}

interface WeighInRow {
  date: string;
  weight_lb: number;
  calories: number | null;
  note: string | null;
}

const toWeighIn = (row: WeighInRow): WeighIn => ({
  date: row.date,
  weightLb: row.weight_lb,
  calories: row.calories,
  note: row.note,
});

function foodResponse(result: FoodResult): Response {
  if (result.ok) return json(result.body);
  return json({ error: result.error, upstream: result.upstream ?? false }, result.status);
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method.toUpperCase();

  /* ------------------- food database (public, no identity) ------------------ */

  if (path === "/api/food/search" || path.startsWith("/api/food/barcode/")) {
    if (method !== "GET") return error(405, "Method not allowed.");
    if (await rateLimited(env, request)) {
      return json({ error: "Too many lookups. Wait a minute and try again.", upstream: false }, 429);
    }
    if (path === "/api/food/search") return foodResponse(await searchFoods(env, url.searchParams.get("q") ?? ""));
    return foodResponse(await lookupBarcode(env, path.slice("/api/food/barcode/".length)));
  }

  /* -------------- iPhone step sync (signed with its own key) -------------- */

  if (path === "/api/steps-sync") {
    const r = await receiveSteps(env, request);
    return json(r.body, r.status);
  }

  const user = await authenticate(request, env);

  if (path === "/api/session") {
    if (method !== "GET") return error(405, "Method not allowed.");
    // A 200 even when there's no identity: "which storage mode applies?" has a
    // valid answer either way. Returning 401 here made every visitor outside
    // Whop log a console error on load. The data endpoints below still 401.
    if (!user) {
      return json({
        storage: "local",
        reason: env.WHOP_APP_ID ? "not-signed-in" : "not-configured",
      });
    }
    return json({
      storage: "cloud",
      userId: user.userId,
      notifications: Boolean(secretValue(env.WHOP_API_KEY, "WHOP_API_KEY")),
      mealPhotos: mealPhotosOn(env),
      physique: physiqueOn(env),
    });
  }

  if (!user) return error(401, "Open this app inside Whop to save check-ins to your account.");
  const userId = user.userId;

  /* ------------------------------ weigh-ins ------------------------------ */

  if (path === "/api/weigh-ins") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const { results } = await env.DB.prepare(
      "SELECT date, weight_lb, calories, note FROM weigh_ins WHERE user_id = ? ORDER BY date ASC LIMIT ?",
    )
      .bind(userId, MAX_WEIGH_INS)
      .all<WeighInRow>();
    return json({ weighIns: results.map(toWeighIn) });
  }

  const match = /^\/api\/weigh-ins\/(\d{4}-\d{2}-\d{2})$/.exec(path);
  if (match) {
    const date = match[1]!;

    if (method === "PUT") {
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const result = validateWeighIn(body.value, date);
      if (!result.ok) return error(422, result.error);
      const w = result.value;

      // Cap total rows per user, but always allow replacing an existing day.
      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS n, SUM(CASE WHEN date = ? THEN 1 ELSE 0 END) AS existing FROM weigh_ins WHERE user_id = ?",
      )
        .bind(date, userId)
        .first<{ n: number; existing: number | null }>();
      if (count && count.n >= MAX_WEIGH_INS && !count.existing) {
        return error(409, `Storage limit of ${MAX_WEIGH_INS} weigh-ins reached.`);
      }

      await env.DB.prepare(
        `INSERT INTO weigh_ins (user_id, date, weight_lb, calories, note)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, date) DO UPDATE SET
           weight_lb  = excluded.weight_lb,
           calories   = excluded.calories,
           note       = excluded.note,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
        .bind(userId, w.date, w.weightLb, w.calories, w.note)
        .run();
      return json({ weighIn: w });
    }

    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM weigh_ins WHERE user_id = ? AND date = ?")
        .bind(userId, date)
        .run();
      return noContent();
    }

    return error(405, "Method not allowed.");
  }

  /* ---------------------------- step sync key ---------------------------- */

  if (path === "/api/steps-sync/key") {
    const r = await stepSyncKey(env, userId, method, request.url);
    return json(r.body, r.status);
  }

  /* ------------------------------- habits ------------------------------- */

  if (path === "/api/habits") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const { results } = await env.DB.prepare(
      "SELECT date, entries FROM habit_logs WHERE user_id = ? ORDER BY date ASC LIMIT ?",
    )
      .bind(userId, MAX_HABIT_LOGS)
      .all<{ date: string; entries: string }>();
    const logs: HabitLog[] = [];
    for (const row of results) {
      try {
        logs.push({ date: row.date, entries: JSON.parse(row.entries) });
      } catch {
        /* skip a corrupt row rather than fail the whole list */
      }
    }
    return json({ logs });
  }

  const habitMatch = /^\/api\/habits\/(\d{4}-\d{2}-\d{2})$/.exec(path);
  if (habitMatch) {
    if (method !== "PUT") return error(405, "Method not allowed.");
    const date = habitMatch[1]!;
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const result = validateHabitEntries(body.value, date);
    if (!result.ok) return error(422, result.error);
    const { entries } = result.value;

    // An empty day is the same as no record: delete instead of storing "{}".
    if (Object.keys(entries).length === 0) {
      await env.DB.prepare("DELETE FROM habit_logs WHERE user_id = ? AND date = ?")
        .bind(userId, date)
        .run();
      return json({ log: { date, entries } });
    }

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n, SUM(CASE WHEN date = ? THEN 1 ELSE 0 END) AS existing FROM habit_logs WHERE user_id = ?",
    )
      .bind(date, userId)
      .first<{ n: number; existing: number | null }>();
    if (count && count.n >= MAX_HABIT_LOGS && !count.existing) {
      return error(409, `Storage limit of ${MAX_HABIT_LOGS} habit days reached.`);
    }

    await env.DB.prepare(
      `INSERT INTO habit_logs (user_id, date, entries) VALUES (?, ?, ?)
       ON CONFLICT (user_id, date) DO UPDATE SET
         entries    = excluded.entries,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
      .bind(userId, date, JSON.stringify(entries))
      .run();
    return json({ log: { date, entries } });
  }

  /* --------------------------- weekly reviews --------------------------- */

  if (path === "/api/reviews") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const { results } = await env.DB.prepare(
      "SELECT week_start, wins, friction, rule FROM weekly_reviews WHERE user_id = ? ORDER BY week_start ASC LIMIT ?",
    )
      .bind(userId, MAX_REVIEWS)
      .all<{ week_start: string; wins: string; friction: string; rule: string }>();
    const reviews: WeeklyReview[] = [];
    for (const row of results) {
      try {
        const wins = JSON.parse(row.wins) as string[];
        reviews.push({
          weekStart: row.week_start,
          wins: [wins[0] ?? "", wins[1] ?? "", wins[2] ?? ""],
          friction: row.friction,
          rule: row.rule,
        });
      } catch {
        /* skip a corrupt row */
      }
    }
    return json({ reviews });
  }

  const reviewMatch = /^\/api\/reviews\/(\d{4}-\d{2}-\d{2})$/.exec(path);
  if (reviewMatch) {
    if (method !== "PUT") return error(405, "Method not allowed.");
    const weekStart = reviewMatch[1]!;
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const result = validateReview(body.value, weekStart);
    if (!result.ok) return error(422, result.error);
    const r = result.value;

    if (isEmptyReview(r)) {
      await env.DB.prepare("DELETE FROM weekly_reviews WHERE user_id = ? AND week_start = ?")
        .bind(userId, weekStart)
        .run();
      return json({ review: r });
    }

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n, SUM(CASE WHEN week_start = ? THEN 1 ELSE 0 END) AS existing FROM weekly_reviews WHERE user_id = ?",
    )
      .bind(weekStart, userId)
      .first<{ n: number; existing: number | null }>();
    if (count && count.n >= MAX_REVIEWS && !count.existing) {
      return error(409, `Storage limit of ${MAX_REVIEWS} weekly reviews reached.`);
    }

    await env.DB.prepare(
      `INSERT INTO weekly_reviews (user_id, week_start, wins, friction, rule) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, week_start) DO UPDATE SET
         wins       = excluded.wins,
         friction   = excluded.friction,
         rule       = excluded.rule,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
      .bind(userId, weekStart, JSON.stringify(r.wins), r.friction, r.rule)
      .run();
    return json({ review: r });
  }

  /* ------------------------------ food logs ------------------------------ */

  if (path === "/api/food-logs") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!isValidISODate(from) || !isValidISODate(to) || from > to || addDays(from, MAX_FOOD_RANGE_DAYS) < to) {
      return error(422, `Give a from/to date range of at most ${MAX_FOOD_RANGE_DAYS} days.`);
    }
    const { results } = await env.DB.prepare(
      "SELECT date, entries FROM food_logs WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date ASC",
    )
      .bind(userId, from, to)
      .all<{ date: string; entries: string }>();
    const logs: FoodLog[] = [];
    for (const row of results) {
      try {
        logs.push({ date: row.date, entries: JSON.parse(row.entries) as FoodEntry[] });
      } catch {
        /* skip a corrupt row */
      }
    }
    return json({ logs });
  }

  const foodMatch = /^\/api\/food-logs\/(\d{4}-\d{2}-\d{2})$/.exec(path);
  if (foodMatch) {
    if (method !== "PUT") return error(405, "Method not allowed.");
    const date = foodMatch[1]!;
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const result = validateFoodLog(body.value, date);
    if (!result.ok) return error(422, result.error);
    const { entries } = result.value;

    // An empty day is the same as no record.
    if (entries.length === 0) {
      await env.DB.prepare("DELETE FROM food_logs WHERE user_id = ? AND date = ?").bind(userId, date).run();
      return json({ log: result.value });
    }

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n, SUM(CASE WHEN date = ? THEN 1 ELSE 0 END) AS existing FROM food_logs WHERE user_id = ?",
    )
      .bind(date, userId)
      .first<{ n: number; existing: number | null }>();
    if (count && count.n >= MAX_FOOD_LOG_DAYS && !count.existing) {
      return error(409, `Storage limit of ${MAX_FOOD_LOG_DAYS} food-log days reached.`);
    }

    await env.DB.prepare(
      `INSERT INTO food_logs (user_id, date, entries) VALUES (?, ?, ?)
       ON CONFLICT (user_id, date) DO UPDATE SET
         entries    = excluded.entries,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
      .bind(userId, date, JSON.stringify(entries))
      .run();
    return json({ log: result.value });
  }

  /* ------------------------------- my foods ------------------------------- */

  if (path === "/api/my-foods") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const { results } = await env.DB.prepare(
      "SELECT id, data FROM my_foods WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?",
    )
      .bind(userId, MAX_MY_FOODS)
      .all<{ id: string; data: string }>();
    const foods: FoodProduct[] = [];
    for (const row of results) {
      try {
        const check = validateMyFood(JSON.parse(row.data), row.id);
        if (check.ok) foods.push(check.value);
      } catch {
        /* skip a corrupt row */
      }
    }
    return json({ foods });
  }

  const myFoodMatch = /^\/api\/my-foods\/([A-Za-z0-9_-]{1,64})$/.exec(path);
  if (myFoodMatch) {
    const id = myFoodMatch[1]!;
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM my_foods WHERE user_id = ? AND id = ?").bind(userId, id).run();
      return noContent();
    }
    if (method !== "PUT") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const result = validateMyFood(body.value, id);
    if (!result.ok) return error(422, result.error);
    const food = result.value;

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n, SUM(CASE WHEN id = ? THEN 1 ELSE 0 END) AS existing FROM my_foods WHERE user_id = ?",
    )
      .bind(id, userId)
      .first<{ n: number; existing: number | null }>();
    if (count && count.n >= MAX_MY_FOODS && !count.existing) {
      return error(409, `Storage limit of ${MAX_MY_FOODS} saved foods reached.`);
    }

    await env.DB.prepare(
      `INSERT INTO my_foods (user_id, id, barcode, data) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, id) DO UPDATE SET
         barcode    = excluded.barcode,
         data       = excluded.data,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
      .bind(userId, id, food.barcode, JSON.stringify(food))
      .run();
    return json({ food });
  }

  /* -------------------------- fasting reminders -------------------------- */

  if (path === "/api/fasting-reminders") {
    if (method === "DELETE") {
      await deleteReminder(env, userId);
      return noContent();
    }
    if (method !== "PUT") return error(405, "Method not allowed.");
    if (!secretValue(env.WHOP_API_KEY, "WHOP_API_KEY")) return error(503, "Notifications aren't switched on for this app yet.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const result = validateReminderRequest(body.value);
    if (!result.ok) return error(422, result.error);
    await saveReminder(env, userId, result.value);
    return json({ ok: true });
  }

  /* --------------------------- check-in reminders --------------------------- */

  if (path === "/api/reminders") {
    if (method === "DELETE") {
      await deleteReminders(env, userId);
      return noContent();
    }
    if (method !== "PUT") return error(405, "Method not allowed.");
    if (!secretValue(env.WHOP_API_KEY, "WHOP_API_KEY")) return error(503, "Notifications aren't switched on for this app yet.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const result = validateRemindersRequest(body.value);
    if (!result.ok) return error(422, result.error);
    await saveReminders(env, userId, result.value);
    return json({ ok: true });
  }

  /* ------------------------------ coach access ------------------------------ */

  if (path === "/api/sharing") {
    if (method === "GET") return json(await getMySharing(env, userId, url.searchParams.get("experience")));
    if (method === "PUT") {
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const result = await setMySharing(env, userId, body.value);
      return result.ok ? json(result.body) : error(result.status, result.error);
    }
    return error(405, "Method not allowed.");
  }

  if (path === "/api/coach/sharing/request" || path === "/api/coach/sharing/stop") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const result =
      path.endsWith("/request") ? await requestSharing(env, userId, body.value) : await stopSharing(env, userId, body.value);
    return result.ok ? json(result.body) : error(result.status, result.error);
  }

  /* ------------------------- coach program edits ------------------------- */

  if (path === "/api/coach/member-training") {
    if (method === "GET") {
      const result = await coachMemberTraining(env, userId, url.searchParams.get("company") ?? "", url.searchParams.get("member") ?? "");
      return result.ok ? json(result.body) : error(result.status, result.error);
    }
    if (method === "PUT") {
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const result = await saveMemberProgram(env, userId, body.value);
      return result.ok ? json(result.body) : error(result.status, result.error);
    }
    return error(405, "Method not allowed.");
  }

  if (path === "/api/coach/comparison-comment") {
    if (method !== "PUT") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const result = await saveComparisonComment(env, userId, body.value);
    return result.ok ? json(result.body) : error(result.status, result.error);
  }
  if (path === "/api/coach/member-physique") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const result = await coachMemberPhysique(env, userId, url.searchParams.get("company") ?? "", url.searchParams.get("member") ?? "");
    return result.ok ? json(result.body) : error(result.status, result.error);
  }

  /* ---------------------- notes, check-ins, macros ---------------------- */

  const q = (k: string) => url.searchParams.get(k) ?? "";
  const send = (r: { ok: true; body: unknown } | { ok: false; status: number; error: string }) =>
    r.ok ? json(r.body) : error(r.status, r.error);

  if (path === "/api/coach/notes") {
    if (method === "GET") return send(await getCoachNote(env, userId, q("company"), q("member")));
    if (method !== "PUT") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await saveCoachNote(env, userId, body.value));
  }
  if (path === "/api/coach/checkins") {
    if (method !== "GET") return error(405, "Method not allowed.");
    return send(await coachCheckins(env, userId, q("company"), q("member")));
  }
  if (path === "/api/coach/checkins/voice") {
    if (method === "POST") return send(await uploadVoiceReply(env, userId, url, request));
    if (method !== "GET") return error(405, "Method not allowed.");
    const r = await coachVoice(env, userId, url);
    return r instanceof Response ? r : send(r);
  }
  const voiceMatch = /^\/api\/checkins\/voice\/(\d{4}-\d\d-\d\d)$/.exec(path);
  if (voiceMatch) {
    if (method !== "GET") return error(405, "Method not allowed.");
    return (await memberVoice(env, userId, voiceMatch[1]!)) ?? error(404, "No voice reply.");
  }
  if (path === "/api/coach/checkins/reply") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await replyToCheckin(env, userId, body.value));
  }
  if (path === "/api/coach/macros") {
    if (method === "GET") return send(await coachGetMacros(env, userId, q("company"), q("member")));
    if (method === "DELETE") return send(await coachClearMacros(env, userId, q("company"), q("member")));
    if (method !== "PUT") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await coachSetMacros(env, userId, body.value));
  }
  if (path === "/api/checkins") {
    if (method === "GET") return send(await getMyCheckins(env, userId, url.searchParams.get("date")));
    if (method !== "PUT") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await submitCheckin(env, userId, body.value));
  }
  if (path === "/api/coach/tags") {
    if (method === "GET") return send(await getTags(env, userId, q("company")));
    if (method !== "PUT") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await saveTags(env, userId, body.value));
  }
  if (path === "/api/coach/macros/bulk") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await bulkMacros(env, userId, body.value));
  }
  if (path === "/api/coach/tags/bulk") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await bulkMemberTags(env, userId, body.value));
  }
  if (path === "/api/coach/member-tags") {
    if (method !== "PUT") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await setMemberTags(env, userId, body.value));
  }
  if (path === "/api/water-reminders") {
    let body: unknown = null;
    if (method === "PUT") {
      const b = await readJson(request);
      if (!b.ok) return b.response;
      body = b.value;
    }
    return send(await waterReminders(env, userId, method, body));
  }
  if (path === "/api/food/label") {
    if (method !== "POST") return error(405, "Method not allowed.");
    // Its own size check: a label photo is larger than readJson's shared cap allows.
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return error(415, "Content-Type must be application/json.");
    }
    const text = await request.text();
    if (text.length > 1_000_000) return error(413, "That photo is too large.");
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return error(400, "Body is not valid JSON.");
    }
    return send(await readLabelPhoto(env, userId, parsed));
  }
  if (path === "/api/measurement-settings") {
    let body: unknown = null;
    if (method === "PUT") {
      const b = await readJson(request);
      if (!b.ok) return b.response;
      body = b.value;
    }
    return send(await measurementSettings(env, userId, method, body));
  }
  if (path === "/api/coach/member-food") {
    if (method !== "GET") return error(405, "Method not allowed.");
    return send(await coachMemberFood(env, userId, q("company"), q("member")));
  }
  if (path === "/api/coach/reminders") {
    if (method === "GET") return send(await getReminders(env, userId, q("company")));
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await sendReminder(env, userId, body.value));
  }
  if (path === "/api/coach/community-stats") {
    if (method !== "GET") return error(405, "Method not allowed.");
    return send(await communityStats(env, userId, q("company"), q("period")));
  }
  if (path === "/api/coach/program-results") {
    if (method !== "GET") return error(405, "Method not allowed.");
    return send(await coachProgramResults(env, userId, q("company")));
  }
  /* ------------------- chat, announcements, notifications ------------------- */

  if (path === "/api/messages") {
    if (method === "GET") return send(await getMyMessages(env, userId, url.searchParams.get("experience"), q("open") === "1"));
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await sendMyMessage(env, userId, body.value));
  }
  if (path === "/api/coach/messages") {
    if (method === "GET") return send(await getMemberThread(env, userId, q("company"), q("member")));
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await sendCoachMessage(env, userId, body.value));
  }
  if (path === "/api/messages/attachment") {
    if (method !== "POST") return error(405, "Method not allowed.");
    return send(await sendAttachment(env, { member: userId, experience: url.searchParams.get("experience") }, url, request));
  }
  const myAttachment = /^\/api\/messages\/attachment\/([0-9a-f]{32})$/.exec(path);
  if (myAttachment) {
    if (method !== "GET") return error(405, "Method not allowed.");
    return (await memberAttachment(env, userId, myAttachment[1]!)) ?? error(404, "Not found.");
  }
  if (path === "/api/coach/messages/bulk") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await sendBulkMessage(env, userId, body.value));
  }
  if (path === "/api/coach/messages/attachment") {
    if (method !== "POST") return error(405, "Method not allowed.");
    return send(await sendAttachment(env, { coach: userId, company: q("company"), member: q("member") }, url, request));
  }
  const coachAttachmentMatch = /^\/api\/coach\/messages\/attachment\/([0-9a-f]{32})$/.exec(path);
  if (coachAttachmentMatch) {
    if (method !== "GET") return error(405, "Method not allowed.");
    const r = await coachAttachment(env, userId, q("company"), coachAttachmentMatch[1]!);
    return r instanceof Response ? r : send(r);
  }
  const scheduledMatch = /^\/api\/coach\/messages\/([0-9a-f]{32})$/.exec(path);
  if (scheduledMatch) {
    if (method !== "DELETE") return error(405, "Method not allowed.");
    return send(await cancelScheduledMessage(env, userId, q("company"), scheduledMatch[1]!));
  }
  if (path === "/api/coach/saved-replies") {
    if (method === "GET") return send(await getSavedReplies(env, userId, q("company")));
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await saveSavedReply(env, userId, body.value));
  }
  const savedReplyMatch = /^\/api\/coach\/saved-replies\/([0-9a-f]{32})$/.exec(path);
  if (savedReplyMatch) {
    if (method !== "DELETE") return error(405, "Method not allowed.");
    return send(await deleteSavedReply(env, userId, q("company"), savedReplyMatch[1]!));
  }
  if (path === "/api/coach/threads") {
    if (method !== "GET") return error(405, "Method not allowed.");
    return send(await coachThreads(env, userId, q("company")));
  }
  if (path === "/api/coach/announcements") {
    if (method === "GET") return send(await getAnnouncements(env, userId, q("company")));
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await postAnnouncement(env, userId, body.value));
  }
  const announcementMatch = /^\/api\/coach\/announcements\/([0-9a-f]{32})$/.exec(path);
  if (announcementMatch) {
    if (method !== "DELETE") return error(405, "Method not allowed.");
    return send(await deleteAnnouncement(env, userId, q("company"), announcementMatch[1]!));
  }
  if (path === "/api/notifications") {
    if (method !== "GET") return error(405, "Method not allowed.");
    return json(await getNotifications(env, userId, url.searchParams.get("experience")));
  }
  if (path === "/api/notifications/seen") {
    if (method !== "POST") return error(405, "Method not allowed.");
    await markNotificationsSeen(env, userId);
    return noContent();
  }
  if (path === "/api/coach/digest") {
    if (method === "GET") return send(await getDigest(env, userId, q("company")));
    if (method !== "PUT") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await saveDigest(env, userId, body.value));
  }
  if (path === "/api/coach/nudges") {
    if (method === "GET") return send(await getNudges(env, userId, q("company")));
    if (method !== "PUT") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await saveNudges(env, userId, body.value));
  }
  if (path === "/api/coach/member-timeline") {
    if (method !== "GET") return error(405, "Method not allowed.");
    return send(await coachMemberTimeline(env, userId, q("company"), q("member"), q("unit"), q("days")));
  }
  if (path === "/api/food/describe") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await describeMeal(env, userId, body.value));
  }
  if (path === "/api/coach/checkins/draft") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await draftCheckinReply(env, userId, body.value));
  }
  if (path === "/api/meal-photo") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await estimateMealPhoto(env, userId, body.value));
  }
  if (path === "/api/physique") {
    if (method === "GET") return send(await listPhysique(env, userId));
    // Reads its own body: three photos exceed readJson's shared size cap.
    if (method === "POST") return send(await analyzePhysique(env, userId, request));
    return error(405, "Method not allowed.");
  }
  if (path === "/api/testimonial-consent") {
    if (method === "GET") return send(await getConsent(env, userId));
    if (method === "PUT") {
      const body = await readJson(request);
      if (!body.ok) return body.response;
      return send(await setConsent(env, userId, body.value));
    }
    return error(405, "Method not allowed.");
  }
  if (path === "/api/coach/testimonials") {
    if (method !== "GET") return error(405, "Method not allowed.");
    return send(await coachTestimonials(env, userId, q("company")));
  }
  if (path === "/api/physique/compare") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await comparePhysique(env, userId, body.value));
  }
  if (path === "/api/report") {
    if (method !== "GET") return error(405, "Method not allowed.");
    return send(await getMyReport(env, userId));
  }
  if (path === "/api/coach/report") {
    if (method !== "GET") return error(405, "Method not allowed.");
    return send(await coachReport(env, userId, q("company"), q("member")));
  }
  if (path === "/api/coach/report/share") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    return send(await shareReport(env, userId, body.value));
  }
  if (path === "/api/my-macros") {
    if (method !== "GET") return error(405, "Method not allowed.");
    return send(await getMyMacros(env, userId));
  }

  if (path === "/api/coach/member-workouts") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const result = await coachMemberWorkouts(env, userId, url.searchParams.get("company") ?? "", url.searchParams.get("member") ?? "");
    return result.ok ? json(result.body) : error(result.status, result.error);
  }

  if (path === "/api/program-edits") {
    if (method !== "GET") return error(405, "Method not allowed.");
    return json({ edits: await myProgramEdits(env, userId) });
  }

  const editApplied = /^\/api\/program-edits\/([^/]+)\/applied$/.exec(path);
  if (editApplied) {
    if (!PROGRAM_EDIT_ID_PATTERN.test(editApplied[1]!)) return error(404, "Not found.");
    if (method !== "POST") return error(405, "Method not allowed.");
    await markProgramEditApplied(env, userId, editApplied[1]!);
    return noContent();
  }

  /* ------------------------------ assignments ------------------------------ */

  if (path === "/api/coach/assignments") {
    if (method === "GET") {
      const result = await listAssignments(env, userId, url.searchParams.get("company") ?? "");
      return result.ok ? json(result.body) : error(result.status, result.error);
    }
    if (method === "POST") {
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const result = await createAssignment(env, userId, body.value);
      return result.ok ? json(result.body, 201) : error(result.status, result.error);
    }
    return error(405, "Method not allowed.");
  }

  const assignMatch = /^\/api\/coach\/assignments\/([^/]+)$/.exec(path);
  if (assignMatch) {
    if (!ASSIGNMENT_ID_PATTERN.test(assignMatch[1]!)) return error(404, "Not found.");
    if (method !== "DELETE") return error(405, "Method not allowed.");
    const result = await cancelAssignment(env, userId, assignMatch[1]!, url.searchParams.get("company") ?? "");
    return result.ok ? json(result.body) : error(result.status, result.error);
  }

  const groupMatch = /^\/api\/coach\/groups(?:\/([^/]+))?$/.exec(path);
  if (groupMatch) {
    const groupId = groupMatch[1] ?? null;
    if (groupId !== null && !ASSIGNMENT_ID_PATTERN.test(groupId)) return error(404, "Not found.");
    if (method === "DELETE" && groupId) {
      const result = await deleteGroup(env, userId, groupId, url.searchParams.get("company") ?? "");
      return result.ok ? json(result.body) : error(result.status, result.error);
    }
    if ((method === "POST" && !groupId) || (method === "PUT" && groupId)) {
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const result = await saveGroup(env, userId, body.value, groupId);
      return result.ok ? json(result.body, groupId ? 200 : 201) : error(result.status, result.error);
    }
    return error(405, "Method not allowed.");
  }

  const programMatch = /^\/api\/coach\/programs(?:\/([^/]+))?$/.exec(path);
  if (programMatch) {
    const programId = programMatch[1] ?? null;
    if (programId !== null && !ASSIGNMENT_ID_PATTERN.test(programId)) return error(404, "Not found.");
    if (method === "GET" && !programId) {
      const result = await listPrograms(env, userId, url.searchParams.get("company") ?? "");
      return result.ok ? json(result.body) : error(result.status, result.error);
    }
    if (method === "DELETE" && programId) {
      const result = await deleteProgram(env, userId, programId, url.searchParams.get("company") ?? "");
      return result.ok ? json(result.body) : error(result.status, result.error);
    }
    if ((method === "POST" && !programId) || (method === "PUT" && programId)) {
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const result = await saveProgram(env, userId, body.value, programId);
      return result.ok ? json(result.body, programId ? 200 : 201) : error(result.status, result.error);
    }
    return error(405, "Method not allowed.");
  }

  const challengeMatch = /^\/api\/coach\/challenges\/([0-9a-f]{32})$/.exec(path);
  if (challengeMatch) {
    if (method !== "GET") return error(405, "Method not allowed.");
    const result = await coachChallenge(env, userId, challengeMatch[1]!, url.searchParams.get("company") ?? "");
    return result.ok ? json(result.body) : error(result.status, result.error);
  }
  if (path === "/api/challenges") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const result = await myChallenges(env, userId);
    return result.ok ? json(result.body) : error(result.status, result.error);
  }

  if (path === "/api/assignments") {
    if (method !== "GET") return error(405, "Method not allowed.");
    return json({ assignments: await myAssignments(env, userId) });
  }

  const myAssignMatch = /^\/api\/assignments\/([^/]+)$/.exec(path);
  if (myAssignMatch) {
    if (!ASSIGNMENT_ID_PATTERN.test(myAssignMatch[1]!)) return error(404, "Not found.");
    if (method !== "PUT") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const result = await answerAssignment(env, userId, myAssignMatch[1]!, body.value);
    return result.ok ? json(result.body) : error(result.status, result.error);
  }

  /* ---------------------------- coach dashboard ---------------------------- */

  if (path === "/api/coach/overview") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const result = await coachOverview(env, userId, url.searchParams.get("company") ?? "");
    return result.ok ? json(result.body) : error(result.status, result.error);
  }

  /* ----------------------------- measurements ----------------------------- */

  if (path === "/api/measurements") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const { results } = await env.DB.prepare(
      "SELECT date, waist, hips, chest, arms, thighs FROM measurements WHERE user_id = ? ORDER BY date ASC LIMIT ?",
    )
      .bind(userId, MAX_MEASUREMENTS)
      .all<Measurement>();
    return json({ measurements: results });
  }

  const measureMatch = /^\/api\/measurements\/(\d{4}-\d{2}-\d{2})$/.exec(path);
  if (measureMatch) {
    const date = measureMatch[1]!;
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM measurements WHERE user_id = ? AND date = ?").bind(userId, date).run();
      return noContent();
    }
    if (method !== "PUT") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const result = validateMeasurement(body.value, date);
    if (!result.ok) return error(422, result.error);
    const m = result.value;
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n, SUM(CASE WHEN date = ? THEN 1 ELSE 0 END) AS existing FROM measurements WHERE user_id = ?",
    )
      .bind(date, userId)
      .first<{ n: number; existing: number | null }>();
    if (count && count.n >= MAX_MEASUREMENTS && !count.existing) {
      return error(409, `Storage limit of ${MAX_MEASUREMENTS} measurement days reached.`);
    }
    await env.DB.prepare(
      `INSERT INTO measurements (user_id, date, waist, hips, chest, arms, thighs) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, date) DO UPDATE SET
         waist = excluded.waist, hips = excluded.hips, chest = excluded.chest,
         arms = excluded.arms, thighs = excluded.thighs,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
      .bind(userId, m.date, m.waist, m.hips, m.chest, m.arms, m.thighs)
      .run();
    return json({ measurement: m });
  }

  /* -------------------------------- photos -------------------------------- */

  if (path === "/api/photos") {
    const result =
      method === "GET" ? await listPhotos(env, userId) : method === "POST" ? await uploadPhoto(env, userId, request, url) : null;
    if (!result) return error(405, "Method not allowed.");
    return result.ok ? json(result.body) : error(result.status, result.error);
  }

  const photoMatch = /^\/api\/photos\/([A-Za-z0-9_-]{8,64})$/.exec(path);
  if (photoMatch) {
    const id = photoMatch[1]!;
    if (method === "GET") return (await streamPhoto(env, userId, id)) ?? error(404, "Not found.");
    if (method === "DELETE") {
      await deletePhoto(env, userId, id);
      return noContent();
    }
    return error(405, "Method not allowed.");
  }

  if (path === "/api/photo-settings") {
    if (method !== "PUT") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const result = await setSharing(env, userId, body.value);
    return result.ok ? json(result.body) : error(result.status, result.error);
  }

  if (path === "/api/coach/photo") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const result = await coachPhoto(
      env,
      userId,
      url.searchParams.get("company") ?? "",
      url.searchParams.get("member") ?? "",
      url.searchParams.get("id") ?? "",
    );
    if (result instanceof Response) return result;
    return result.ok ? json(result.body) : error(result.status, result.error);
  }

  /* ------------------------------- workouts ------------------------------- */

  if (path === "/api/workouts") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const { results } = await env.DB.prepare(
      "SELECT id, data FROM workouts WHERE user_id = ? ORDER BY date ASC LIMIT ?",
    )
      .bind(userId, MAX_WORKOUTS)
      .all<{ id: string; data: string }>();
    const workouts: Workout[] = [];
    for (const row of results) {
      try {
        workouts.push({ ...(JSON.parse(row.data) as Workout), id: row.id });
      } catch {
        /* skip a corrupt row */
      }
    }
    return json({ workouts });
  }

  const workoutMatch = /^\/api\/workouts\/([A-Za-z0-9_-]{1,64})$/.exec(path);
  if (workoutMatch) {
    const id = workoutMatch[1]!;
    if (!WORKOUT_ID_PATTERN.test(id)) return error(404, "Not found.");
    if (method === "DELETE") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM workouts WHERE user_id = ? AND id = ?").bind(userId, id),
        env.DB.prepare("DELETE FROM workout_nudges WHERE user_id = ? AND workout_id = ?").bind(userId, id),
      ]);
      return noContent();
    }
    if (method !== "PUT") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const result = validateWorkout(body.value, id);
    if (!result.ok) return error(422, result.error);
    const w = result.value;

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS n, SUM(CASE WHEN id = ? THEN 1 ELSE 0 END) AS existing FROM workouts WHERE user_id = ?",
    )
      .bind(id, userId)
      .first<{ n: number; existing: number | null }>();
    if (count && count.n >= MAX_WORKOUTS && !count.existing) {
      return error(409, `Storage limit of ${MAX_WORKOUTS} workouts reached.`);
    }

    await env.DB.prepare(
      `INSERT INTO workouts (user_id, id, date, data) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, id) DO UPDATE SET
         date       = excluded.date,
         data       = excluded.data,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
      .bind(userId, w.id, w.date, JSON.stringify(w))
      .run();
    return json({ workout: w });
  }

  /* ------------------------------ leaderboard ------------------------------ */

  if (path === "/api/leaderboard") {
    const experienceId = url.searchParams.get("experience") ?? "";
    if (method === "GET") {
      const result = await getLeaderboard(env, userId, experienceId, url.searchParams.get("tz"));
      return result.ok ? json(result.body) : error(result.status, result.error);
    }
    if (method === "PUT") {
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const result = await joinLeaderboard(env, userId, body.value);
      return result.ok ? json(result.body) : error(result.status, result.error);
    }
    if (method === "DELETE") {
      await leaveLeaderboard(env, userId, experienceId);
      return noContent();
    }
    return error(405, "Method not allowed.");
  }

  /* ---------------------------- lift leaderboard ---------------------------- */

  if (path === "/api/lift-board") {
    if (method !== "GET") return error(405, "Method not allowed.");
    const result = await getLiftBoard(env, userId, url.searchParams.get("experience") ?? "");
    return result.ok ? json(result.body) : error(result.status, result.error);
  }

  if (path === "/api/lift-board/submissions") {
    if (method !== "POST") return error(405, "Method not allowed.");
    const body = await readJson(request);
    if (!body.ok) return body.response;
    const result = await submitLift(env, userId, body.value);
    return result.ok ? json(result.body, 201) : error(result.status, result.error);
  }

  const liftMatch = /^\/api\/lift-board\/submissions\/([^/]+)(\/review)?$/.exec(path);
  if (liftMatch) {
    const id = liftMatch[1]!;
    if (!SUBMISSION_ID_PATTERN.test(id)) return error(404, "Not found.");
    if (liftMatch[2]) {
      if (method !== "PUT") return error(405, "Method not allowed.");
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const result = await reviewLift(env, userId, id, body.value);
      return result.ok ? json(result.body) : error(result.status, result.error);
    }
    if (method !== "DELETE") return error(405, "Method not allowed.");
    await withdrawLift(env, userId, id);
    return noContent();
  }

  /* ------------------------------ form checks ------------------------------ */

  if (path === "/api/form-checks") {
    if (method === "GET") {
      const result = await getFormChecks(env, userId, url.searchParams.get("experience") ?? "");
      return result.ok ? json(result.body) : error(result.status, result.error);
    }
    if (method === "POST") {
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const result = await askFormCheck(env, userId, body.value);
      return result.ok ? json(result.body, 201) : error(result.status, result.error);
    }
    return error(405, "Method not allowed.");
  }

  const formMatch = /^\/api\/form-checks\/([^/]+)(\/feedback)?$/.exec(path);
  if (formMatch) {
    const id = formMatch[1]!;
    if (!FORM_CHECK_ID_PATTERN.test(id)) return error(404, "Not found.");
    if (formMatch[2]) {
      if (method !== "PUT") return error(405, "Method not allowed.");
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const result = await answerFormCheck(env, userId, id, body.value);
      return result.ok ? json(result.body) : error(result.status, result.error);
    }
    if (method !== "DELETE") return error(405, "Method not allowed.");
    await deleteFormCheck(env, userId, id);
    return noContent();
  }

  /* -------------------------------- plan -------------------------------- */

  if (path === "/api/plan") {
    if (method === "GET") {
      const row = await env.DB.prepare("SELECT state, updated_at FROM plans WHERE user_id = ?")
        .bind(userId)
        .first<{ state: string; updated_at: string }>();
      if (!row) return json({ state: null, updatedAt: null });
      let state: unknown = null;
      try {
        state = JSON.parse(row.state);
      } catch {
        state = null;
      }
      return json({ state, updatedAt: row.updated_at });
    }

    if (method === "PUT") {
      const body = await readJson(request);
      if (!body.ok) return body.response;
      const state = (body.value as { state?: unknown } | null)?.state;
      if (typeof state !== "object" || state === null || Array.isArray(state)) {
        return error(422, "Expected { state: {...} }.");
      }
      // Stored opaquely and re-sanitised by the client on every load, so a
      // tampered document can only ever produce the client's defaults.
      const serialized = JSON.stringify(state);
      if (serialized.length > PLAN_MAX_BYTES) return error(413, "Plan too large.");
      await env.DB.prepare(
        `INSERT INTO plans (user_id, state) VALUES (?, ?)
         ON CONFLICT (user_id) DO UPDATE SET
           state      = excluded.state,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      )
        .bind(userId, serialized)
        .run();
      return noContent();
    }

    return error(405, "Method not allowed.");
  }

  /* ------------------------------ delete me ------------------------------ */

  if (path === "/api/me") {
    if (method !== "DELETE") return error(405, "Method not allowed.");
    await deleteAllPhotos(env, userId);
    await deleteVoiceReplies(env, userId);
    await deleteChatAttachments(env, userId);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM measurements WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM workouts WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM workout_nudges WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM checkins WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM coach_macros WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM coach_notes WHERE member_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM member_tags WHERE member_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM meal_photo_usage WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM physique_analyses WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM physique_usage WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM step_tokens WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM testimonial_consent WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM compare_nudges WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM photo_day_nudges WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM water_reminders WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM milestones WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM measurement_settings WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM measure_day_nudges WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM ai_usage WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM challenge_entrants WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM weigh_ins WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM plans WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM coach_program_edits WHERE member_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM coach_nudges_sent WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM coach_messages WHERE member_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM coach_reminders WHERE member_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM notification_seen WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM coach_digests WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM habit_logs WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM weekly_reviews WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM food_logs WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM my_foods WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM fasting_reminders WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM reminders WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM leaderboard WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM lift_submissions WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM form_checks WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM coach_sharing WHERE user_id = ?").bind(userId),
      env.DB.prepare("DELETE FROM assignment_targets WHERE user_id = ?").bind(userId),
    ]);
    return noContent();
  }

  return error(404, "Not found.");
}

/**
 * Whop loads an app at its configured view path — by default
 * /experiences/[experienceId] for the member-facing view and
 * /dashboard/[companyId] for the creator's dashboard. This is a single-page
 * app, so those paths (including deep links under them) serve the same
 * index.html. Without this they fell through to the static 404 page.
 */
const WHOP_VIEW_PATH = /^\/(experiences|dashboard)\/[A-Za-z0-9_-]+(\/.*)?$/;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (WHOP_VIEW_PATH.test(url.pathname)) {
      return servePageWithToken(request, env, env.ASSETS, new URL("/", url));
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, url);
    } catch (e) {
      // Log server-side; never echo internals (or SQL) to the client.
      console.error("api error", e);
      return error(500, "Something went wrong. Please try again.");
    }
  },

  // Every minute (wrangler.jsonc "triggers"): fasting, check-in and workout notifications.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      sendDueReminders(env, new Date(controller.scheduledTime))
        .then((r) => {
          if (r.fasting.due > 0 || r.checkin.due > 0 || r.workout.due > 0) console.log("reminders", r);
        })
        .catch((e) => console.error("fasting reminders crashed", e)),
    );
    const when = new Date(controller.scheduledTime);
    // Scheduled chat messages and announcements: every minute.
    ctx.waitUntil(
      deliverScheduled(env, when)
        .then((r) => {
          if (r.messages > 0 || r.announcements > 0) console.log("scheduled delivered", r);
        })
        .catch((e) => console.error("scheduled delivery crashed", e)),
    );
    // Hydration reminders: every minute, like the other timed reminders.
    ctx.waitUntil(
      sendDueWaterReminders(env, when)
        .then((r) => {
          if (r.due > 0) console.log("water reminders", r);
        })
        .catch((e) => console.error("water reminders crashed", e)),
    );
    // "Your monthly comparison is ready": every 15 minutes is plenty.
    if (when.getUTCMinutes() % 15 === 0) {
      ctx.waitUntil(
        sendCompareNudges(env, when)
          .then((r) => {
            if (r.due > 0) console.log("compare nudges", r);
          })
          .catch((e) => console.error("compare nudges crashed", e)),
      );
      // "It's photo day": once a month, around 9am the member's time.
      ctx.waitUntil(
        sendPhotoDayReminders(env, when)
          .then((r) => {
            if (r.due > 0) console.log("photo day reminders", r);
          })
          .catch((e) => console.error("photo day reminders crashed", e)),
      );
      // "Time to measure": the same, for tape measurements.
      ctx.waitUntil(
        sendMeasureDayReminders(env, when)
          .then((r) => {
            if (r.due > 0) console.log("measure day reminders", r);
          })
          .catch((e) => console.error("measure day reminders crashed", e)),
      );
      // Milestones (5 lb lost, 1 in off the waist…) for anyone who just logged.
      ctx.waitUntil(
        checkMilestones(env, when)
          .then((r) => {
            if (r.reached > 0) console.log("milestones", r);
          })
          .catch((e) => console.error("milestones crashed", e)),
      );
      // Coaches' daily digest: 8am their time.
      ctx.waitUntil(
        sendCoachDigests(env, when)
          .then((r) => {
            if (r.due > 0) console.log("coach digests", r);
          })
          .catch((e) => console.error("coach digests crashed", e)),
      );
      // Coaches' automatic nudges: once a day per whop, checked 17:00–19:45 UTC.
      const hour = when.getUTCHours();
      if (hour >= 17 && hour <= 19) {
        ctx.waitUntil(
          sendCoachNudges(env, when)
            .then((r) => {
              if (r.sent > 0) console.log("coach nudges", r);
            })
            .catch((e) => console.error("coach nudges crashed", e)),
        );
      }
    }
  },
} satisfies ExportedHandler<Env>;
