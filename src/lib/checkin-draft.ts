/**
 * AI check-in reply drafts (coach dashboard → a member → Weekly check-ins →
 * "Draft with AI"; worker/checkin-drafts.ts). The coach edits the draft and
 * sends it the usual way; nothing goes to the member until they do.
 *
 * The model gets this week's answers and numbers, the plan's targets, the
 * coach's previous replies to this member (for voice and continuity), their
 * private notes about the member (context only), and an optional style line
 * the coach wrote. Shared by the browser and the Worker.
 */

import { CHECKIN_REPLY_MAX, CHECKIN_SCALES, type CheckinAnswers, type CheckinStats } from "./checkins";

export const CHECKIN_DRAFT_DAILY_LIMIT = 60;
export const COACH_STYLE_MAX = 400;

export const CHECKIN_DRAFT_PROMPT = `You draft weekly check-in replies for a natural physique coach, written in the coach's own voice, for the coach to edit before sending to their client.

- 90 to 180 words, plain text in short paragraphs. No headings, no markdown, no emojis unless the coach's previous replies or style use them.
- Address the client by first name. Open with one or two specific wins from their answers or numbers.
- Respond to their struggles, and answer their question directly and practically if they asked one.
- Give one to three specific actions for next week, tied to their numbers (for example average protein against the target, steps, weigh-ins logged, habit score).
- Use only the numbers provided. Never invent data. If weight data is thin (few weigh-ins), say the trend needs more weigh-ins rather than drawing conclusions.
- Encouraging but honest. No medical advice: if they mention pain, injury, illness, or anything suggesting disordered eating, recommend they speak to a medical professional and keep advice conservative.
- Match the coach's voice from their previous replies and style notes. Don't add a sign-off name unless their style does.
- The coach's private notes are background only: never quote them or reveal them.`;

export interface DraftInput {
  firstName: string;
  unit: "lb" | "kg";
  answers: CheckinAnswers;
  stats: CheckinStats;
  /** The plan's daily targets on the check-in's last day, when known. */
  targets: { calories: number; protein: number; steps: number | null } | null;
  goalWeightLb: number | null;
  /** The coach's last replies to this member, newest first. */
  previousReplies: string[];
  coachNote: string;
  style: string;
}

const kg = (lb: number) => lb * 0.45359237;

/** Everything the model is told, as one readable block. */
export function draftInputText(d: DraftInput): string {
  const w = (lb: number | null) => (lb === null ? "—" : `${(d.unit === "kg" ? kg(lb) : lb).toFixed(1)} ${d.unit}`);
  const s = d.stats;
  const ratings = CHECKIN_SCALES.map((sc) => `${sc.label} ${d.answers.ratings[sc.key]}/5 (1 = ${sc.low.toLowerCase()}, 5 = ${sc.high.toLowerCase()})`).join("; ");
  const lines = [
    `Client: ${d.firstName || "the client"}.`,
    `Week ${s.from} to ${s.to}.`,
    `Ratings: ${ratings}.`,
    `Wins: ${d.answers.wins || "(none written)"}`,
    `Struggles: ${d.answers.struggles || "(none written)"}`,
    `Question for the coach: ${d.answers.question || "(none)"}`,
    `Their own focus for next week: ${d.answers.focus || "(none)"}`,
    "",
    "Numbers from their logs this week:",
    `- Average weight ${w(s.avgWeightLb)} from ${s.weighIns} weigh-in${s.weighIns === 1 ? "" : "s"}; the week before averaged ${w(s.prevAvgWeightLb)}.`,
    `- Workouts finished: ${s.workouts}.`,
    `- Food logged on ${s.foodDays} of 7 days${s.avgKcal !== null ? `; average ${s.avgKcal} kcal and ${s.avgProtein ?? "—"} g protein on those days` : ""}.`,
    `- Average steps: ${s.avgSteps ?? "not logged"}.`,
    `- Habit scorecard: ${s.habitPercent === null ? "no habits set" : `${s.habitPercent}%`}.`,
    `- Progress photos this week: ${s.photos}.`,
  ];
  if (d.targets) {
    lines.push(`Plan targets: ${d.targets.calories} kcal and ${d.targets.protein} g protein a day${d.targets.steps ? `, ${d.targets.steps.toLocaleString("en-US")} steps` : ""}.`);
  }
  if (d.goalWeightLb !== null) lines.push(`Goal weight: ${w(d.goalWeightLb)}.`);
  if (d.coachNote.trim()) lines.push("", `Coach's private notes (background only, never quote): ${d.coachNote.trim().slice(0, 800)}`);
  if (d.previousReplies.length) {
    lines.push("", "The coach's previous replies to this client (match this voice; follow up on anything they asked for):");
    d.previousReplies.forEach((r, i) => lines.push(`--- ${i === 0 ? "last week" : "earlier"} ---`, r.slice(0, 900)));
  }
  if (d.style.trim()) lines.push("", `The coach's style notes: ${d.style.trim().slice(0, COACH_STYLE_MAX)}`);
  lines.push("", "Write the reply now.");
  return lines.join("\n");
}

/** Tidy the model's reply into a sendable draft. */
export function cleanDraft(text: string): string {
  return text
    .replace(/^\s*(?:#+\s.*|subject:.*)\n/gim, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, CHECKIN_REPLY_MAX);
}
