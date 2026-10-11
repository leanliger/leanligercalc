/**
 * Coach assignments (see src/lib/assignments.ts).
 *
 *   GET    /api/coach/assignments?company=biz_…   sent assignments with counts, and saved groups
 *   POST   /api/coach/assignments                 send { company, kind, program | habits, title, note, target }
 *   DELETE /api/coach/assignments/:id?company=…   cancel (members who haven't answered stop seeing it)
 *   POST   /api/coach/groups                      save a group { company, name, memberIds }
 *   PUT    /api/coach/groups/:id                  update it
 *   DELETE /api/coach/groups/:id?company=…        delete it
 *   GET    /api/coach/programs?company=biz_…      the coach's saved programs
 *   POST   /api/coach/programs                    save one { company, program, weekdays, weeks }
 *   PUT    /api/coach/programs/:id                update it
 *   DELETE /api/coach/programs/:id?company=…      delete it
 *   GET    /api/coach/challenges/:id?company=…    a challenge's leaderboard
 *   GET    /api/assignments                       members: what's waiting for me
 *   GET    /api/challenges                        members: leaderboards of challenges I joined
 *   PUT    /api/assignments/:id  { accept }       members: used it, or Not now
 *
 * Coach calls check with Whop that the viewer is an admin of the company, and
 * only send to people Whop lists as its current members.
 */

import {
  ASSIGNMENT_ID_PATTERN,
  MAX_GROUPS,
  MAX_SAVED_PROGRAMS,
  cleanSavedProgram,
  validateSavedProgram,
  type SavedProgram,
  assignmentMessage,
  validateAssignment,
  validateGroup,
  type AssignmentKind,
  type CoachAssignment,
  type CoachGroup,
  type MemberAssignment,
} from "../src/lib/assignments";
import { COMPANY_ID_PATTERN } from "../src/lib/coach-api";
import { companyMembers, type Profile } from "./coach";
import { experiencesOf } from "./experiences";
import { memberTagsOf, tagsOf } from "./coaching";
import { sendWhop } from "./reminders";
import { accessLevel, hasWhopKey, whopGet, type WhopEnv } from "./whop";
import {
  challengeMessage,
  challengeWindow,
  plannedWorkouts,
  rankEntries,
  type ChallengeStandings,
} from "../src/lib/challenges";
import { sanitizeSchedule } from "../src/lib/program-schedule";
import { assignedProgramId } from "../src/lib/assignments";

export interface AssignmentEnv extends WhopEnv {
  DB: D1Database;
}

export type AssignmentResult = { ok: true; body: unknown } | { ok: false; status: number; error: string };

const ID_CHUNK = 45;
/** Whop notifications per request: one per community, in chunks of this many members. */
const NOTIFY_CHUNK = 100;

const newId = () => crypto.randomUUID().replace(/-/g, "");
const memberName = (p: Profile | undefined) => p?.name?.trim() || (p?.username ? `@${p.username}` : "a member");

async function adminCheck(env: AssignmentEnv, viewerId: string, companyId: string): Promise<AssignmentResult | null> {
  if (!COMPANY_ID_PATTERN.test(companyId)) return { ok: false, status: 422, error: "Open the dashboard from your Whop." };
  if (!hasWhopKey(env)) return { ok: false, status: 503, error: "The app's Whop API key isn't set up yet." };
  const level = await accessLevel(env, viewerId, companyId);
  if (level === null) return { ok: false, status: 502, error: "Couldn't confirm your access with Whop. Try again in a moment." };
  if (level !== "admin") return { ok: false, status: 403, error: "Only the owner and admins of this whop can do that." };
  return null;
}

interface AssignmentRow {
  id: string;
  company_id: string;
  kind: AssignmentKind;
  title: string;
  payload: string;
  note: string;
  audience: string;
  created_at: string;
  cancelled_at: string | null;
  challenge: number;
}

async function groupsOf(env: AssignmentEnv, companyId: string): Promise<CoachGroup[]> {
  const { results } = await env.DB.prepare("SELECT id, name, member_ids FROM coach_groups WHERE company_id = ? ORDER BY name COLLATE NOCASE")
    .bind(companyId)
    .all<{ id: string; name: string; member_ids: string }>();
  return results.map((r) => {
    let memberIds: string[] = [];
    try {
      const parsed = JSON.parse(r.member_ids) as unknown;
      if (Array.isArray(parsed)) memberIds = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      /* corrupt row: empty group */
    }
    return { id: r.id, name: r.name, memberIds };
  });
}

/* ---------------------------------- coach ---------------------------------- */

export async function listAssignments(env: AssignmentEnv, viewerId: string, companyId: string): Promise<AssignmentResult> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const { results: rows } = await env.DB.prepare(
    "SELECT id, company_id, kind, title, payload, note, audience, created_at, cancelled_at, challenge FROM assignments WHERE company_id = ? ORDER BY created_at DESC LIMIT 50",
  )
    .bind(companyId)
    .all<AssignmentRow>();
  const counts = new Map<string, CoachAssignment["counts"]>();
  for (let i = 0; i < rows.length; i += ID_CHUNK) {
    const chunk = rows.slice(i, i + ID_CHUNK).map((r) => r.id);
    const { results } = await env.DB.prepare(
      `SELECT assignment_id, status, COUNT(*) AS n FROM assignment_targets WHERE assignment_id IN (${chunk.map(() => "?").join(",")}) GROUP BY assignment_id, status`,
    )
      .bind(...chunk)
      .all<{ assignment_id: string; status: string; n: number }>();
    for (const r of results) {
      const c = counts.get(r.assignment_id) ?? { sent: 0, accepted: 0, declined: 0, pending: 0 };
      c.sent += r.n;
      if (r.status === "accepted") c.accepted += r.n;
      else if (r.status === "declined") c.declined += r.n;
      else c.pending += r.n;
      counts.set(r.assignment_id, c);
    }
  }
  const assignments: CoachAssignment[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    note: r.note,
    audience: r.audience,
    createdAt: r.created_at,
    cancelled: r.cancelled_at !== null,
    challenge: r.challenge === 1,
    counts: counts.get(r.id) ?? { sent: 0, accepted: 0, declined: 0, pending: 0 },
  }));
  return { ok: true, body: { assignments, groups: await groupsOf(env, companyId) } };
}

export async function createAssignment(env: AssignmentEnv, viewerId: string, raw: unknown): Promise<AssignmentResult> {
  const v = validateAssignment(raw);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const a = v.value;
  const denied = await adminCheck(env, viewerId, a.company);
  if (denied) return denied;

  // Only ever send to people Whop lists as members right now.
  const listed = await companyMembers(env, a.company);
  if (!listed.ok) return listed;
  const members = listed.profiles;
  let ids: string[];
  let audience: string;
  if (a.target.type === "all") {
    ids = [...members.keys()];
    audience = "Everyone";
  } else if (a.target.type === "tag") {
    const tagId = a.target.tagId;
    const tag = (await tagsOf(env, a.company)).find((t) => t.id === tagId);
    if (!tag) return { ok: false, status: 404, error: "That tag no longer exists." };
    const tagged = await memberTagsOf(env, a.company, [tag]);
    ids = Object.keys(tagged).filter((id) => members.has(id));
    audience = `Tag: ${tag.name}`;
  } else if (a.target.type === "group") {
    const groupId = a.target.groupId;
    const group = (await groupsOf(env, a.company)).find((g) => g.id === groupId);
    if (!group) return { ok: false, status: 404, error: "That group no longer exists." };
    ids = group.memberIds.filter((id) => members.has(id));
    audience = group.name;
  } else {
    ids = a.target.memberIds.filter((id) => members.has(id));
    audience = ids.length === 1 ? memberName(members.get(ids[0]!)) : `${ids.length} members`;
  }
  if (ids.length === 0) return { ok: false, status: 422, error: "None of those people are members of your whop right now." };

  const id = newId();
  const payload = JSON.stringify(a.kind === "program" ? a.program : a.habits);
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      "INSERT INTO assignments (id, company_id, created_by, kind, title, payload, note, audience, challenge) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, a.company, viewerId, a.kind, a.title, payload, a.note, audience, a.challenge ? 1 : 0),
  ];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    statements.push(
      env.DB.prepare(`INSERT INTO assignment_targets (assignment_id, user_id) VALUES ${chunk.map(() => "(?, ?)").join(", ")}`).bind(
        ...chunk.flatMap((u) => [id, u]),
      ),
    );
  }
  await env.DB.batch(statements);

  // One notification per community, many members at a time.
  const where = await experiencesOf(env, ids);
  const byExperience = new Map<string, string[]>();
  for (const [user, exp] of where) byExperience.set(exp, [...(byExperience.get(exp) ?? []), user]);
  let notified = 0;
  const msg =
    a.challenge && a.program?.schedule
      ? challengeMessage(a.title, a.program.schedule.startDate, a.program.schedule.weeks)
      : assignmentMessage(a.kind, a.title);
  for (const [exp, users] of byExperience) {
    for (let i = 0; i < users.length; i += NOTIFY_CHUNK) {
      const chunk = users.slice(i, i + NOTIFY_CHUNK);
      const sent = await sendWhop(env, exp, chunk, msg);
      if (sent.ok) notified += chunk.length;
      else console.error("assignment notification failed", { status: sent.status, reason: sent.reason });
    }
  }
  return { ok: true, body: { id, sent: ids.length, notified, audience } };
}

export async function cancelAssignment(env: AssignmentEnv, viewerId: string, id: string, companyId: string): Promise<AssignmentResult> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const r = await env.DB.prepare(
    "UPDATE assignments SET cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND company_id = ? AND cancelled_at IS NULL",
  )
    .bind(id, companyId)
    .run();
  if (!r.meta.changes) return { ok: false, status: 404, error: "That assignment isn't there any more." };
  return { ok: true, body: { cancelled: true } };
}

export async function saveGroup(env: AssignmentEnv, viewerId: string, raw: unknown, groupId: string | null): Promise<AssignmentResult> {
  const v = validateGroup(raw);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const g = v.value;
  const denied = await adminCheck(env, viewerId, g.company);
  if (denied) return denied;
  if (groupId) {
    const r = await env.DB.prepare(
      "UPDATE coach_groups SET name = ?, member_ids = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND company_id = ?",
    )
      .bind(g.name, JSON.stringify(g.memberIds), groupId, g.company)
      .run();
    if (!r.meta.changes) return { ok: false, status: 404, error: "That group no longer exists." };
    return { ok: true, body: { group: { id: groupId, name: g.name, memberIds: g.memberIds } } };
  }
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM coach_groups WHERE company_id = ?").bind(g.company).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_GROUPS) return { ok: false, status: 409, error: `Up to ${MAX_GROUPS} groups. Delete one first.` };
  const id = newId();
  await env.DB.prepare("INSERT INTO coach_groups (id, company_id, name, member_ids) VALUES (?, ?, ?, ?)")
    .bind(id, g.company, g.name, JSON.stringify(g.memberIds))
    .run();
  return { ok: true, body: { group: { id, name: g.name, memberIds: g.memberIds } } };
}

export async function deleteGroup(env: AssignmentEnv, viewerId: string, groupId: string, companyId: string): Promise<AssignmentResult> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  await env.DB.prepare("DELETE FROM coach_groups WHERE id = ? AND company_id = ?").bind(groupId, companyId).run();
  return { ok: true, body: { deleted: true } };
}

/* ------------------------------ program library ------------------------------ */

interface ProgramRow {
  id: string;
  name: string;
  program: string;
  weekdays: string | null;
  weeks: number | null;
  updated_at: string;
}

function toSaved(r: ProgramRow): SavedProgram | null {
  try {
    const program = cleanSavedProgram(JSON.parse(r.program));
    if (!program) return null;
    let weekdays: number[] | null = null;
    if (r.weekdays) {
      const parsed = JSON.parse(r.weekdays) as unknown;
      if (Array.isArray(parsed)) weekdays = parsed.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6);
    }
    return { id: r.id, name: r.name, program, weekdays: weekdays && weekdays.length > 0 ? weekdays : null, weeks: r.weeks, updatedAt: r.updated_at };
  } catch {
    return null;
  }
}

export async function listPrograms(env: AssignmentEnv, viewerId: string, companyId: string): Promise<AssignmentResult> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const { results } = await env.DB.prepare(
    "SELECT id, name, program, weekdays, weeks, updated_at FROM coach_programs WHERE company_id = ? ORDER BY updated_at DESC LIMIT ?",
  )
    .bind(companyId, MAX_SAVED_PROGRAMS)
    .all<ProgramRow>();
  return { ok: true, body: { programs: results.map(toSaved).filter((p): p is SavedProgram => p !== null) } };
}

export async function saveProgram(env: AssignmentEnv, viewerId: string, raw: unknown, programId: string | null): Promise<AssignmentResult> {
  const v = validateSavedProgram(raw);
  if (!v.ok) return { ok: false, status: 422, error: v.error };
  const p = v.value;
  const denied = await adminCheck(env, viewerId, p.company);
  if (denied) return denied;
  const json = JSON.stringify(p.program);
  const weekdays = p.weekdays ? JSON.stringify(p.weekdays) : null;
  if (programId) {
    const r = await env.DB.prepare(
      `UPDATE coach_programs SET name = ?, program = ?, weekdays = ?, weeks = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND company_id = ?`,
    )
      .bind(p.program.name, json, weekdays, p.weeks, programId, p.company)
      .run();
    if (!r.meta.changes) return { ok: false, status: 404, error: "That saved program no longer exists." };
  } else {
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM coach_programs WHERE company_id = ?").bind(p.company).first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_SAVED_PROGRAMS) {
      return { ok: false, status: 409, error: `You have ${MAX_SAVED_PROGRAMS} saved programs. Delete one first.` };
    }
    programId = newId();
    await env.DB.prepare(
      "INSERT INTO coach_programs (id, company_id, name, program, weekdays, weeks, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(programId, p.company, p.program.name, json, weekdays, p.weeks, viewerId)
      .run();
  }
  const row = await env.DB.prepare("SELECT id, name, program, weekdays, weeks, updated_at FROM coach_programs WHERE id = ?")
    .bind(programId)
    .first<ProgramRow>();
  return { ok: true, body: { program: row ? toSaved(row) : null } };
}

export async function deleteProgram(env: AssignmentEnv, viewerId: string, programId: string, companyId: string): Promise<AssignmentResult> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  await env.DB.prepare("DELETE FROM coach_programs WHERE id = ? AND company_id = ?").bind(programId, companyId).run();
  return { ok: true, body: { deleted: true } };
}

/* --------------------------------- member --------------------------------- */

export async function myAssignments(env: AssignmentEnv, userId: string): Promise<MemberAssignment[]> {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.kind, a.title, a.payload, a.note, a.created_at, a.challenge
     FROM assignments a JOIN assignment_targets t ON t.assignment_id = a.id
     WHERE t.user_id = ? AND t.status = 'pending' AND a.cancelled_at IS NULL
     ORDER BY a.created_at ASC LIMIT 20`,
  )
    .bind(userId)
    .all<Pick<AssignmentRow, "id" | "kind" | "title" | "payload" | "note" | "created_at" | "challenge">>();
  return results.flatMap((r) => {
    try {
      const payload = JSON.parse(r.payload) as unknown;
      return [
        {
          id: r.id,
          kind: r.kind,
          title: r.title,
          note: r.note,
          createdAt: r.created_at,
          program: r.kind === "program" ? (payload as MemberAssignment["program"]) : null,
          habits: r.kind === "habits" ? (payload as MemberAssignment["habits"]) : null,
          challenge: r.challenge === 1,
        },
      ];
    } catch {
      return [];
    }
  });
}

export async function answerAssignment(env: AssignmentEnv, userId: string, id: string, raw: unknown): Promise<AssignmentResult> {
  const accept = (raw as { accept?: unknown } | null)?.accept;
  if (typeof accept !== "boolean") return { ok: false, status: 422, error: "Expected { accept: true | false }." };
  const r = await env.DB.prepare(
    "UPDATE assignment_targets SET status = ?, responded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE assignment_id = ? AND user_id = ?",
  )
    .bind(accept ? "accepted" : "declined", id, userId)
    .run();
  if (!r.meta.changes) return { ok: false, status: 404, error: "That's no longer waiting for you." };
  if (accept) await enterChallenge(env, userId, id);
  return { ok: true, body: { status: accept ? "accepted" : "declined" } };
}

/* -------------------------------- challenges -------------------------------- */

const ENTRANT_NAME_MAX = 60;
const STANDINGS_MAX = 100;

/** Joining a challenge puts the member on its leaderboard under their Whop name and photo. */
async function enterChallenge(env: AssignmentEnv, userId: string, assignmentId: string): Promise<void> {
  const a = await env.DB.prepare("SELECT challenge FROM assignments WHERE id = ?").bind(assignmentId).first<{ challenge: number }>();
  if (a?.challenge !== 1) return;
  const profile = await whopGet(env, `/api/v1/users/${encodeURIComponent(userId)}`);
  const p = (profile.status === 200 ? profile.body : null) as { name?: string | null; username?: string | null; profile_picture?: { url?: string } | null } | null;
  const name = (p?.name?.trim() || (p?.username ? `@${p.username}` : "") || "Member").slice(0, ENTRANT_NAME_MAX);
  const avatar = typeof p?.profile_picture?.url === "string" && /^https:\/\//.test(p.profile_picture.url) ? p.profile_picture.url : null;
  await env.DB.prepare(
    `INSERT INTO challenge_entrants (assignment_id, user_id, name, avatar_url) VALUES (?, ?, ?, ?)
     ON CONFLICT (assignment_id, user_id) DO UPDATE SET name = excluded.name, avatar_url = excluded.avatar_url`,
  )
    .bind(assignmentId, userId, name, avatar)
    .run();
}

/** A challenge's leaderboard: each entrant's finished workouts from its program, within its dates. */
async function standings(env: AssignmentEnv, row: Pick<AssignmentRow, "id" | "title" | "payload" | "note">, viewerId: string | null): Promise<ChallengeStandings | null> {
  let schedule;
  try {
    schedule = sanitizeSchedule((JSON.parse(row.payload) as { schedule?: unknown } | null)?.schedule);
  } catch {
    schedule = undefined;
  }
  if (!schedule) return null;
  const { start, end } = challengeWindow(schedule);
  const { results: entrants } = await env.DB.prepare(
    "SELECT user_id, name, avatar_url FROM challenge_entrants WHERE assignment_id = ? ORDER BY joined_at LIMIT 1000",
  )
    .bind(row.id)
    .all<{ user_id: string; name: string; avatar_url: string | null }>();
  const done = new Map<string, number>();
  for (let i = 0; i < entrants.length; i += ID_CHUNK) {
    const chunk = entrants.slice(i, i + ID_CHUNK).map((e) => e.user_id);
    const { results } = await env.DB.prepare(
      `SELECT user_id, COUNT(*) AS n FROM workouts
       WHERE user_id IN (${chunk.map(() => "?").join(",")}) AND date >= ? AND date <= ?
         AND json_extract(data, '$.programId') = ? AND json_extract(data, '$.finishedAt') IS NOT NULL
       GROUP BY user_id`,
    )
      .bind(...chunk, start, end, assignedProgramId(row.id))
      .all<{ user_id: string; n: number }>();
    for (const r of results) done.set(r.user_id, r.n);
  }
  const ranked = rankEntries(
    entrants.map((e) => ({ userId: e.user_id, name: e.name, avatarUrl: e.avatar_url, done: done.get(e.user_id) ?? 0, isYou: e.user_id === viewerId })),
  );
  const you = ranked.find((e) => e.isYou);
  const top = ranked.slice(0, STANDINGS_MAX);
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    startDate: start,
    endDate: end,
    weeks: schedule.weeks,
    planned: plannedWorkouts(schedule),
    entrants: ranked.length,
    entries: you && !top.includes(you) ? [...top, you] : top,
  };
}

/** Members: the leaderboards of challenges they joined (newest first). */
export async function myChallenges(env: AssignmentEnv, userId: string): Promise<AssignmentResult> {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.title, a.payload, a.note FROM assignments a
     JOIN challenge_entrants e ON e.assignment_id = a.id
     WHERE e.user_id = ? AND a.challenge = 1 AND a.cancelled_at IS NULL
     ORDER BY a.created_at DESC LIMIT 5`,
  )
    .bind(userId)
    .all<Pick<AssignmentRow, "id" | "title" | "payload" | "note">>();
  const challenges: ChallengeStandings[] = [];
  for (const r of results) {
    const s = await standings(env, r, userId);
    if (s) challenges.push(s);
  }
  return { ok: true, body: { challenges } };
}

/** Coaches: one challenge's leaderboard. */
export async function coachChallenge(env: AssignmentEnv, viewerId: string, id: string, companyId: string): Promise<AssignmentResult> {
  const denied = await adminCheck(env, viewerId, companyId);
  if (denied) return denied;
  const row = await env.DB.prepare("SELECT id, title, payload, note FROM assignments WHERE id = ? AND company_id = ? AND challenge = 1")
    .bind(id, companyId)
    .first<Pick<AssignmentRow, "id" | "title" | "payload" | "note">>();
  if (!row) return { ok: false, status: 404, error: "That challenge isn't there any more." };
  const s = await standings(env, row, null);
  return s ? { ok: true, body: { challenge: s } } : { ok: false, status: 404, error: "That challenge has no schedule." };
}

export { ASSIGNMENT_ID_PATTERN };
