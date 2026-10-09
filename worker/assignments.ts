/**
 * Coach assignments (see src/lib/assignments.ts).
 *
 *   GET    /api/coach/assignments?company=biz_…   sent assignments with counts, and saved groups
 *   POST   /api/coach/assignments                 send { company, kind, program | habits, title, note, target }
 *   DELETE /api/coach/assignments/:id?company=…   cancel (members who haven't answered stop seeing it)
 *   POST   /api/coach/groups                      save a group { company, name, memberIds }
 *   PUT    /api/coach/groups/:id                  update it
 *   DELETE /api/coach/groups/:id?company=…        delete it
 *   GET    /api/assignments                       members: what's waiting for me
 *   PUT    /api/assignments/:id  { accept }       members: used it, or Not now
 *
 * Coach calls check with Whop that the viewer is an admin of the company, and
 * only send to people Whop lists as its current members.
 */

import {
  ASSIGNMENT_ID_PATTERN,
  MAX_GROUPS,
  assignmentMessage,
  validateAssignment,
  validateGroup,
  type AssignmentKind,
  type CoachAssignment,
  type CoachGroup,
  type MemberAssignment,
} from "../src/lib/assignments";
import { COMPANY_ID_PATTERN } from "../src/lib/coach-api";
import { EXPERIENCE_ID_PATTERN } from "../src/lib/fasting";
import { companyMembers, type Profile } from "./coach";
import { sendWhop } from "./reminders";
import { accessLevel, hasWhopKey, type WhopEnv } from "./whop";

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
}

/** Where each member last opened the app, so the notification reaches them there. */
async function experiencesOf(env: AssignmentEnv, ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const marks = chunk.map(() => "?").join(",");
    const results = await env.DB.batch<{ user_id: string; experience_id: string | null }>(
      ["coach_sharing", "reminders", "fasting_reminders", "leaderboard"].map((table) =>
        env.DB.prepare(`SELECT user_id, experience_id FROM ${table} WHERE user_id IN (${marks})`).bind(...chunk),
      ),
    );
    // Earlier tables win: coach_sharing records where they last opened the app.
    for (const r of results) {
      for (const row of r.results ?? []) {
        if (!out.has(row.user_id) && row.experience_id && EXPERIENCE_ID_PATTERN.test(row.experience_id)) out.set(row.user_id, row.experience_id);
      }
    }
  }
  return out;
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
    "SELECT id, company_id, kind, title, payload, note, audience, created_at, cancelled_at FROM assignments WHERE company_id = ? ORDER BY created_at DESC LIMIT 50",
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
      "INSERT INTO assignments (id, company_id, created_by, kind, title, payload, note, audience) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, a.company, viewerId, a.kind, a.title, payload, a.note, audience),
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
  const msg = assignmentMessage(a.kind, a.title);
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

/* --------------------------------- member --------------------------------- */

export async function myAssignments(env: AssignmentEnv, userId: string): Promise<MemberAssignment[]> {
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.kind, a.title, a.payload, a.note, a.created_at
     FROM assignments a JOIN assignment_targets t ON t.assignment_id = a.id
     WHERE t.user_id = ? AND t.status = 'pending' AND a.cancelled_at IS NULL
     ORDER BY a.created_at ASC LIMIT 20`,
  )
    .bind(userId)
    .all<Pick<AssignmentRow, "id" | "kind" | "title" | "payload" | "note" | "created_at">>();
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
  return { ok: true, body: { status: accept ? "accepted" : "declined" } };
}

export { ASSIGNMENT_ID_PATTERN };
