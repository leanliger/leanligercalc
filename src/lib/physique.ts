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
