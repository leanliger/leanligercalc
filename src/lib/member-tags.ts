/**
 * Member tags on the coach dashboard: labels like "Competitor" or "Injured"
 * to filter members by and to send assignments to. Each whop has its own list,
 * which coaches can rename, recolour, add to and delete from.
 */

export type TagColor = "gold" | "blue" | "green" | "red" | "purple" | "gray";

export interface MemberTag {
  id: string;
  name: string;
  color: TagColor;
}

export const TAG_COLORS: TagColor[] = ["gold", "blue", "green", "red", "purple", "gray"];

/** Badge classes per colour; readable in light and dark mode. */
export const TAG_CLASS: Record<TagColor, string> = {
  gold: "border-primary/40 bg-primary/15 text-primary",
  blue: "border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  green: "border-success/40 bg-success/15 text-success",
  red: "border-destructive/40 bg-destructive/15 text-destructive",
  purple: "border-violet-500/40 bg-violet-500/15 text-violet-700 dark:text-violet-300",
  gray: "border-border bg-muted text-muted-foreground",
};

export const DEFAULT_TAGS: MemberTag[] = [
  { id: "competitor", name: "Competitor", color: "gold" },
  { id: "lifestyle", name: "Lifestyle", color: "blue" },
  { id: "injured", name: "Injured", color: "red" },
  { id: "vip", name: "VIP", color: "purple" },
  { id: "inactive", name: "Inactive", color: "gray" },
];

export const MAX_TAGS = 20;
export const TAG_NAME_MAX = 24;
const TAG_ID = /^[a-z0-9_-]{1,32}$/;

/** A whop's tag list, cleaned: known colours, unique ids and names, at most MAX_TAGS. */
export function sanitizeTags(raw: unknown): MemberTag[] | null {
  if (!Array.isArray(raw)) return null;
  const out: MemberTag[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const t of raw) {
    if (typeof t !== "object" || t === null) continue;
    const r = t as Record<string, unknown>;
    const id = typeof r.id === "string" && TAG_ID.test(r.id) ? r.id : null;
    const name = typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim().slice(0, TAG_NAME_MAX) : "";
    const color = TAG_COLORS.includes(r.color as TagColor) ? (r.color as TagColor) : "gray";
    if (!id || !name || ids.has(id) || names.has(name.toLowerCase())) continue;
    ids.add(id);
    names.add(name.toLowerCase());
    out.push({ id, name, color });
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** A new tag id from its name, unique among `existing`. */
export function tagIdFor(name: string, existing: readonly MemberTag[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "tag";
  let id = base;
  for (let i = 2; existing.some((t) => t.id === id); i++) id = `${base}-${i}`;
  return id;
}
