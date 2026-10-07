/**
 * The coach overview as it travels from the Worker to the browser. Kept free of
 * browser-only imports so the Worker can use it too; the dashboard maths is in
 * coach.ts.
 */

import type { HabitEntries } from "./habits";
import type { WeighIn } from "./tracking";

export const COMPANY_ID_PATTERN = /^biz_[A-Za-z0-9]{1,40}$/;
/** Members who haven't logged anything for this many days are flagged. */
export const INACTIVE_DAYS = 3;
/** How much history the overview carries per member. */
export const OVERVIEW_DAYS = { weighIns: 120, habits: 91, food: 14 } as const;

/** The company id in a Whop dashboard URL like /dashboard/biz_abc123/… */
export function companyIdFromPath(path: string): string | null {
  const m = /^\/dashboard\/(biz_[A-Za-z0-9]{1,40})(?:\/|$)/.exec(path);
  return m ? m[1]! : null;
}

/* ------------------------------ wire format ------------------------------ */

export interface FoodDay {
  date: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface CoachMemberData {
  userId: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  /** When they last opened anything in your whop (from Whop). */
  lastAccessedAt: string | null;
  joinedAt: string | null;
  /** Their saved plan document, as stored (re-sanitised by the browser). */
  plan: unknown | null;
  weighIns: WeighIn[];
  habitLogs: { date: string; entries: HabitEntries }[];
  foodDays: FoodDay[];
}

export interface CoachOverview {
  companyId: string;
  generatedAt: string;
  members: CoachMemberData[];
}
