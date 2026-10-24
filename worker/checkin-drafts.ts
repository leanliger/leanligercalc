/**
 * AI check-in reply drafts: POST /api/coach/checkins/draft
 *   { company, member, weekStart, name, unit, style? }
 *
 * Coaches only (admins of the whop, for one of its members). Returns a draft
 * for the coach to edit; nothing is sent or saved. The member's check-in, the
 * plan's targets, the coach's last replies to them and the coach's private
 * notes go to Gemini for this one request (src/lib/checkin-draft.ts).
 */

import { CHECKIN_DRAFT_DAILY_LIMIT, CHECKIN_DRAFT_PROMPT, COACH_STYLE_MAX, cleanDraft, draftInputText } from "../src/lib/checkin-draft";
import type { CheckinAnswers, CheckinStats } from "../src/lib/checkins";
import { dayTargetFinder } from "../src/lib/day-targets";
import { isValidISODate } from "../src/lib/dates";
import { sanitizeAppState } from "../src/lib/persistence";
import { currentPlanWeek, effectiveCarbInputs } from "../src/lib/plan-link";
import { askGemini, geminiKey, takeAiUse, type GeminiEnv } from "./gemini";
import { coachCheck, type SharingEnv, type SharingResult } from "./sharing";

type Env = SharingEnv & GeminiEnv;

export async function draftCheckinReply(env: Env, viewerId: string, raw: unknown): Promise<SharingResult> {
  if (!geminiKey(env)) return { ok: false, status: 503, error: "AI drafts aren't switched on for this app yet." };
  const c = await coachCheck(env, viewerId, raw);
  if ("error" in c) return c.error;
  const b = (raw ?? {}) as Record<string, unknown>;
  const weekStart = typeof b.weekStart === "string" && isValidISODate(b.weekStart) ? b.weekStart : null;
  if (!weekStart) return { ok: false, status: 422, error: "Bad request." };
  const firstName = typeof b.name === "string" ? b.name.trim().split(/\s+/)[0]!.slice(0, 40) : "";
  const unit = b.unit === "kg" ? "kg" : "lb";
  const style = typeof b.style === "string" ? b.style.slice(0, COACH_STYLE_MAX) : "";

  const row = await env.DB.prepare("SELECT answers, stats FROM checkins WHERE user_id = ? AND week_start = ?")
    .bind(c.memberId, weekStart)
    .first<{ answers: string; stats: string }>();
  if (!row) return { ok: false, status: 404, error: "That check-in isn't there any more." };
  let answers: CheckinAnswers;
  let stats: CheckinStats;
  try {
    answers = JSON.parse(row.answers) as CheckinAnswers;
    stats = JSON.parse(row.stats) as CheckinStats;
  } catch {
    return { ok: false, status: 500, error: "That check-in couldn't be read." };
  }

  const [previous, note, planRow, macros] = await Promise.all([
    env.DB.prepare(
      "SELECT reply FROM checkins WHERE user_id = ? AND week_start < ? AND reply IS NOT NULL AND reply != '' ORDER BY week_start DESC LIMIT 2",
    )
      .bind(c.memberId, weekStart)
      .all<{ reply: string }>(),
    env.DB.prepare("SELECT note FROM coach_notes WHERE company_id = ? AND member_id = ?")
      .bind(b.company, c.memberId)
      .first<{ note: string }>(),
    env.DB.prepare("SELECT state FROM plans WHERE user_id = ?").bind(c.memberId).first<{ state: string }>(),
    env.DB.prepare("SELECT kcal, protein, carbs, fat, note, set_at FROM coach_macros WHERE user_id = ?")
      .bind(c.memberId)
      .first<{ kcal: number; protein: number; carbs: number; fat: number; note: string; set_at: string }>(),
  ]);
  // Macros the coach set win over the plan's, as they do in the member's app.
  const coachMacros = macros
    ? { kcal: macros.kcal, protein: macros.protein, carbs: macros.carbs, fat: macros.fat, note: macros.note, setAt: macros.set_at }
    : null;

  // The plan's targets on the check-in's last day, as the member's Food log shows them.
  let targets: { calories: number; protein: number; steps: number | null } | null = null;
  let goalWeightLb: number | null = null;
  if (planRow) {
    try {
      const plan = sanitizeAppState(JSON.parse(planRow.state));
      const week = currentPlanWeek(plan.profile, plan.fatLoss, plan.tracking.adjustments, stats.to);
      const t = dayTargetFinder(plan.profile, plan.fatLoss, effectiveCarbInputs(plan.carbs, week), plan.tracking.adjustments, coachMacros)(stats.to);
      if (t) targets = { calories: t.calories, protein: t.protein, steps: plan.fatLoss.activitySource === "steps" ? plan.fatLoss.dailySteps : null };
      if (plan.fatLoss.goalType === "weight") goalWeightLb = plan.fatLoss.targetWeight;
    } catch {
      /* draft without targets */
    }
  }

  const use = await takeAiUse(env, viewerId, "checkin-draft", CHECKIN_DRAFT_DAILY_LIMIT);
  if (!use.ok) return { ok: false, status: 429, error: `That's today's ${CHECKIN_DRAFT_DAILY_LIMIT} drafts. Write this one yourself, or try again tomorrow.` };

  const reply = await askGemini(env, viewerId, "checkin-draft", {
    system: CHECKIN_DRAFT_PROMPT,
    parts: [
      {
        text: draftInputText({
          firstName,
          unit,
          answers,
          stats,
          targets,
          goalWeightLb,
          previousReplies: previous.results.map((r) => r.reply),
          coachNote: note?.note ?? "",
          style,
          report: typeof b.report === "string" ? b.report.slice(0, 2500) : "",
        }),
      },
    ],
    maxTokens: 1024,
  });
  if (!reply.ok) return reply;
  const draft = cleanDraft(reply.value);
  if (!draft) return { ok: false, status: 502, error: "The draft came back empty. Try again." };
  return { ok: true, body: { draft, left: use.left } };
}
