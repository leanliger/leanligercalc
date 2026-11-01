/**
 * Coach dashboard → System health: are the app's scheduled jobs running, are
 * Whop notifications getting through, did the daily digest go out, and is
 * Whop sending what the dashboard needs. The Worker records runs and sends
 * (worker/health.ts, migration 0041); this file names the jobs and judges them.
 */

export type JobId =
  | "reminders"
  | "scheduled"
  | "water"
  | "compare"
  | "photo-day"
  | "measure-day"
  | "milestones"
  | "focus"
  | "accountability"
  | "digest"
  | "nudges";

/**
 * Every scheduled job, in the order they're listed. `lateAfterMin` is how long
 * after its last run it counts as late: a little over its longest normal gap
 * (jobs that only run part of the day wait overnight).
 */
export const JOBS: { id: JobId; label: string; what: string; when: string; lateAfterMin: number }[] = [
  { id: "reminders", label: "Timed reminders", what: "Fasting, weigh-in, check-in and workout reminders", when: "Every minute", lateAfterMin: 10 },
  { id: "scheduled", label: "Scheduled messages", what: "Your scheduled chat messages and announcements", when: "Every minute", lateAfterMin: 10 },
  { id: "water", label: "Water reminders", what: "Members' hydration reminders", when: "Every minute", lateAfterMin: 10 },
  { id: "milestones", label: "Milestones", what: "5 lb lost, 1 in off the waist and the like", when: "Every 15 minutes", lateAfterMin: 45 },
  { id: "compare", label: "Monthly comparison", what: "“Your monthly comparison is ready”", when: "Every 15 minutes", lateAfterMin: 45 },
  { id: "photo-day", label: "Photo day", what: "“It’s photo day”, monthly", when: "Every 15 minutes", lateAfterMin: 45 },
  { id: "measure-day", label: "Measure day", what: "“Time to measure”, monthly", when: "Every 15 minutes", lateAfterMin: 45 },
  { id: "digest", label: "Daily digest", what: "Coaches’ 8am digest", when: "Every 15 minutes", lateAfterMin: 45 },
  { id: "accountability", label: "Accountability checks", what: "Finds members slipping and sends or queues checks", when: "Hourly", lateAfterMin: 150 },
  { id: "focus", label: "Focus follow-ups", what: "Mid-week checks on check-in focus items", when: "Every 15 minutes, 15:00–23:45 UTC", lateAfterMin: 17 * 60 },
  { id: "nudges", label: "Automatic nudges", what: "Your automations, once a day per whop", when: "Every 15 minutes, 17:00–19:45 UTC", lateAfterMin: 23 * 60 },
];

export interface JobRun {
  id: string;
  lastRunAt: string;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  /** What the last run did, as counts. */
  lastResult: Record<string, unknown> | null;
}

export type JobStatus = "ok" | "failed" | "late" | "never";

export function jobStatus(job: (typeof JOBS)[number], run: JobRun | undefined, now: number): JobStatus {
  if (!run) return "never";
  // Its latest run failed (a later clean run clears it).
  if (run.lastErrorAt && (!run.lastOkAt || run.lastErrorAt > run.lastOkAt)) return "failed";
  if (now - Date.parse(run.lastRunAt) > job.lateAfterMin * 60_000) return "late";
  return "ok";
}

/** "due 3 · sent 3" from a run's counts; a group of counts shows what it sent. */
export function resultText(result: Record<string, unknown> | null): string {
  if (!result) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(result)) {
    if (typeof v === "number") parts.push(`${k} ${v}`);
    else if (v && typeof v === "object") {
      // A group (e.g. reminders' fasting / checkin / workout): what it sent.
      const sent = (v as Record<string, unknown>).sent;
      if (typeof sent === "number") parts.push(`${k} sent ${sent}`);
    } else if (typeof v === "boolean") parts.push(`${k} ${v ? "yes" : "no"}`);
  }
  return parts.join(" · ");
}

export interface SystemHealth {
  generatedAt: string;
  jobs: JobRun[];
  notifications: {
    /** UTC days, oldest first, the last NOTIFY_DAYS. */
    days: { date: string; sent: number; failed: number }[];
    /** Refusals grouped by Whop's status and reason, latest first. */
    failures: { status: number; reason: string | null; count: number; lastAt: string }[];
  };
  /** This whop's daily digests, newest first. */
  digests: { date: string; mine: boolean; status: string }[];
}

export const NOTIFY_DAYS = 7;
export const NOTIFY_KEEP_DAYS = 14;

/** Refusals and failed digests count as a problem for this long (the page still lists the whole week). */
export const RECENT_HOURS = 24;

/**
 * What needs a look now, in words: a job failed or late, Whop refusing
 * notifications in the last day, or a digest failing today or yesterday.
 * Drives the red dot on the menu and the banner on the page.
 */
export function healthIssues(h: SystemHealth, now: number): string[] {
  const issues: string[] = [];
  const runs = new Map(h.jobs.map((j) => [j.id, j]));
  for (const job of JOBS) {
    const s = jobStatus(job, runs.get(job.id), now);
    if (s === "failed") issues.push(`${job.label} failed`);
    else if (s === "late") issues.push(`${job.label} is late`);
  }
  const refused = h.notifications.failures.some((f) => now - Date.parse(f.lastAt) < RECENT_HOURS * 3_600_000);
  if (refused) issues.push("Whop refused notifications in the last day");
  const yesterday = new Date(now - 86_400_000).toISOString().slice(0, 10);
  if (h.digests.some((d) => d.status.startsWith("failed") && d.date >= yesterday)) issues.push("A daily digest failed");
  return issues;
}
