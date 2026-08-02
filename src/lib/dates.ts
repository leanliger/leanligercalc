/**
 * Date helpers built on plain ISO `yyyy-mm-dd` strings.
 *
 * Everything here works in UTC on purpose: a prep timeline is a sequence of
 * calendar days, not instants, and parsing "2026-08-01" with `new Date()` in a
 * negative-offset timezone would silently shift it to July 31.
 */

const MS_PER_DAY = 86_400_000;

export function toISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const d = `${date.getUTCDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function isValidISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = parseISODate(iso);
  return !Number.isNaN(date.getTime()) && toISODate(date) === iso;
}

/** Today in the user's local calendar, expressed as an ISO date string. */
export function todayISO(): string {
  const now = new Date();
  return toISODate(
    new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
  );
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  return toISODate(new Date(date.getTime() + Math.round(days) * MS_PER_DAY));
}

export function addWeeks(iso: string, weeks: number): string {
  return addDays(iso, weeks * 7);
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (parseISODate(to).getTime() - parseISODate(from).getTime()) / MS_PER_DAY,
  );
}

export function weeksBetween(from: string, to: string): number {
  return daysBetween(from, to) / 7;
}

const LONG_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const SHORT_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatLong(iso: string): string {
  if (!isValidISODate(iso)) return "—";
  return LONG_FORMAT.format(parseISODate(iso));
}

export function formatShort(iso: string): string {
  if (!isValidISODate(iso)) return "—";
  return SHORT_FORMAT.format(parseISODate(iso));
}

/** "12 weeks (2 months, 3 weeks)" style duration copy. */
export function describeDuration(weeks: number): string {
  if (!Number.isFinite(weeks) || weeks <= 0) return "0 weeks";
  const whole = Math.round(weeks * 10) / 10;
  const months = Math.floor(weeks / 4.345);
  const remainder = Math.round(weeks - months * 4.345);
  const weekLabel = `${whole} ${whole === 1 ? "week" : "weeks"}`;
  if (months < 1) return weekLabel;
  const monthPart = `${months} ${months === 1 ? "month" : "months"}`;
  if (remainder < 1) return `${weekLabel} (~${monthPart})`;
  return `${weekLabel} (~${monthPart}, ${remainder} wk)`;
}
