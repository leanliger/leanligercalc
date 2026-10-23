/**
 * Physique analysis (worker/physique.ts): what the model is asked, and how its
 * reply is broken into sections before the member sees it.
 *
 * The member's front, side and back photos go to the model for one request and
 * are never stored anywhere but this app's own R2 bucket. Only the text that
 * comes back is saved (physique_analyses), so an earlier breakdown can be
 * re-read without spending another analysis.
 *
 * Shared by the browser and the Worker.
 */

/**
 * Analyses a member can run in one UTC day. Deliberately lower than meal
 * photos: three images per call, and a physique does not change hour to hour.
 */
export const PHYSIQUE_DAILY_LIMIT = 3;

/** Longest reply we keep, in characters. */
export const PHYSIQUE_MAX_CHARS = 8000;

export interface PhysiqueSection {
  /** Heading as the model wrote it, emoji included, without the trailing colon. */
  heading: string;
  /** Paragraphs and bullet lines under that heading, blank lines removed. */
  lines: string[];
}

export interface PhysiqueAnalysis {
  sections: PhysiqueSection[];
  /** The reply verbatim, so nothing is lost if the headings ever change. */
  raw: string;
}

export const PHYSIQUE_PROMPT = `You are an elite fitness and accountability coach specializing in natural bodybuilding and physique transformation. Your goal is to analyze the user's front, side, and back physique photos and provide highly objective, constructive, and actionable feedback.

You must calibrate your analysis to natural, drug-free standards—do not compare the user to enhanced open-bodybuilding competitors.

Analyze the provided images and execute the following tasks:
1. Estimate the user's body fat percentage as a range (e.g., 15-18%, 20-24%). Do not give a single exact number.
2. Identify the top 2-3 most developed muscle groups (Strengths).
3. Identify 2-3 lagging muscle groups or areas lacking symmetry (Areas for Growth).
4. Provide actionable, accountability-focused coaching steps for their next mesocycle based on their apparent goals (e.g., continuing to cut, maintaining, or lean bulking).

GUARDRAILS & TONE:
- Tone: Professional, encouraging, highly analytical, and direct. Do not sound like an AI; sound like an experienced human coach.
- Do not make medical diagnoses.
- If the lighting is poor or clothing obscures a major muscle group, explicitly state that your assessment of that specific area is limited.
- Do not body-shame. Frame all weaknesses as "opportunities for growth" or "target areas."

OUTPUT FORMAT:
Structure your response exactly with the following headers:
- 📊 Estimated Body Fat Range:
- 🏆 Physique Strengths:
- 🎯 Target Areas for Growth:
- 📋 Coach's Action Plan:`;

export const PHYSIQUE_USER_PROMPT =
  "Please analyze my physique from these front, side, and back photos.";

/**
 * A heading line: optional bullet or whitespace, then an emoji, then words, then
 * a colon. Anything after the colon on the same line starts that section's body.
 */
const HEADING = /^[-*\s]*((?:\p{Extended_Pictographic}|\p{Emoji_Presentation})[^:]*):\s*(.*)$/u;

/**
 * Split the reply into sections. The prompt asks for four known headings, but
 * the model is not held to them — anything before the first heading, or a reply
 * with no headings at all, becomes one untitled section so nothing is dropped.
 */
export function parsePhysique(text: string): PhysiqueAnalysis {
  const raw = text.trim().slice(0, PHYSIQUE_MAX_CHARS);
  const sections: PhysiqueSection[] = [];
  let current: PhysiqueSection | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(HEADING);
    if (match) {
      const heading = (match[1] ?? "").trim();
      const rest = (match[2] ?? "").trim();
      current = { heading, lines: rest ? [rest] : [] };
      sections.push(current);
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!current) {
      current = { heading: "", lines: [] };
      sections.push(current);
    }
    current.lines.push(trimmed);
  }

  return { sections, raw };
}

/** True when the reply has at least one section with something under it. */
export function usablePhysique(analysis: PhysiqueAnalysis): boolean {
  return analysis.sections.some((s) => s.lines.length > 0);
}

/* ---------------------------- monthly comparison ---------------------------- */

/**
 * The comparison runs on two saved sets: the newest front, side and back, and
 * the photos from about a month earlier. Sets closer together than this are
 * refused: a week of change is mostly water and lighting.
 */
export const COMPARE_MIN_DAYS = 14;
/** What "about a month" means when picking the earlier set by default. */
export const COMPARE_TARGET_DAYS = 28;
/** A coach's comment under a member's comparison. */
export const COMPARISON_COMMENT_MAX = 600;

export const COMPARE_PROMPT = `You are an elite fitness and accountability coach specializing in natural bodybuilding and physique transformation. You are comparing the same person's progress photos from two dates: the BEFORE set and the AFTER set, each labelled by pose.

Calibrate everything to natural, drug-free standards. Compare like with like: front with front, side with side, back with back.

Describe what has actually changed between the two sets. Be specific about where (e.g. "more separation between the delts and arms", "the waist looks narrower from the side") and honest about how much. If differences in lighting, pump, posture, distance or clothing make a change hard to judge, say so rather than guessing. If very little has changed, say that plainly and kindly.

GUARDRAILS & TONE:
- Professional, encouraging, analytical and direct; sound like an experienced human coach, not an AI.
- No medical diagnoses. No body-shaming: frame anything still to improve as a target area.
- Never exaggerate. The summary for sharing must only claim changes you can actually see.

OUTPUT FORMAT, exactly these headers:
- 📅 What Changed:
- 📉 Body Fat Then vs Now:
- 💪 Visible Improvements:
- 🎯 Still to Work On:
- 💬 Shareable Summary:

Under "Body Fat Then vs Now" give an estimated range for each date (e.g. "Then 18-21%, now 15-18%"). Under "Shareable Summary" write 2-3 upbeat sentences in the third person, with no name, suitable for a coach to post as a client result; it must not claim anything the photos don't show.`;

export function compareUserPrompt(beforeDate: string, afterDate: string, days: number, weights: { before: number | null; after: number | null }): string {
  const w =
    weights.before !== null && weights.after !== null
      ? ` Scale weight: ${weights.before.toFixed(1)} lb then, ${weights.after.toFixed(1)} lb now.`
      : "";
  return `Compare my BEFORE photos (${beforeDate}) with my AFTER photos (${afterDate}), ${days} days apart.${w}`;
}

/** The "Shareable Summary" text, for the Copy button. */
export function shareableSummary(analysis: PhysiqueAnalysis): string | null {
  const s = analysis.sections.find((x) => /shar|testimonial/i.test(x.heading));
  return s && s.lines.length > 0 ? s.lines.join(" ").replace(/\*\*/g, "") : null;
}

/** Which saved photos a comparison used, by side and pose. */
export interface CompareIds {
  before: Partial<Record<"front" | "side" | "back", string>>;
  after: Partial<Record<"front" | "side" | "back", string>>;
}

