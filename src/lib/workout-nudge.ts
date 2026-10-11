/**
 * "Finished your workout?" reminders (sent by worker/workout-nudges.ts).
 *
 * A workout in progress that hasn't changed for 10 minutes (no set ticked,
 * nothing typed) gets a Whop notification asking whether it's finished, then
 * another every 5 minutes while it still doesn't change. Any change starts the
 * 10 minutes again; finishing or discarding it stops them. They stop after
 * NUDGE_MAX reminders in a row (an hour), so a workout left open overnight
 * doesn't send one every 5 minutes until morning.
 *
 * Members can turn them off on the Training tab (TrainingSettings.finishReminders).
 */

import type { Message } from "./reminders";

/** Minutes without a change before the first reminder. */
export const NUDGE_IDLE_MIN = 10;
/** Minutes between reminders after that. */
export const NUDGE_REPEAT_MIN = 5;
/** Reminders in a row without a change before they stop (10, 15, … 65 minutes). */
export const NUDGE_MAX = 12;

const MINUTE = 60_000;

/** How far back the scheduler needs to look: the last reminder's time plus a margin. */
export const NUDGE_LOOKBACK_MIN = NUDGE_IDLE_MIN + NUDGE_REPEAT_MIN * (NUDGE_MAX - 1) + 10;

/**
 * Which reminder is due now, or null. `lastChange` is when the workout was
 * last saved; `sent` is the last reminder for it, if any.
 */
export function nudgeDue(
  lastChange: number,
  sent: { at: number; count: number } | null,
  now: number,
): number | null {
  // Reminders sent before the latest change belong to an earlier pause: start over.
  if (sent && sent.at > lastChange) {
    if (sent.count >= NUDGE_MAX) return null;
    return now - sent.at >= NUDGE_REPEAT_MIN * MINUTE ? sent.count + 1 : null;
  }
  return now - lastChange >= NUDGE_IDLE_MIN * MINUTE ? 1 : null;
}

/** The notification for the nth reminder about a workout. */
export function nudgeMessage(workoutName: string, n: number, minutesIdle: number): Message {
  const name = workoutName.trim().slice(0, 60) || "Your workout";
  if (n === 1) {
    return {
      title: "Finished your workout?",
      content: `Nothing logged in ${name} for ${NUDGE_IDLE_MIN} minutes. If you're done, open the app and tap Finish.`,
    };
  }
  return {
    title: "Still training?",
    content: `${name} is still open, with nothing logged for ${Math.round(minutesIdle)} minutes. Tap Finish when you're done so it counts.`,
  };
}
