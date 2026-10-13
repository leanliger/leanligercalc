"use client";

import * as React from "react";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_TAGS, TAG_CLASS, TAG_COLORS, TAG_NAME_MAX, tagIdFor, type MemberTag, type TagColor } from "@/lib/member-tags";
import { cn } from "@/lib/utils";

/**
 * Coach dashboard member tags: chips on member rows, the tag picker on a
 * member's page, and the editor for the whop's tag list (src/lib/member-tags.ts).
 */

export interface TagsData {
  tags: MemberTag[];
  /** memberId → tag ids */
  members: Record<string, string[]>;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? "Something went wrong. Try again.");
  return body;
}

export const loadTags = (companyId: string) => call<TagsData>(`/api/coach/tags?company=${encodeURIComponent(companyId)}`);

export function TagChip({ tag, className }: { tag: MemberTag; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0 text-[11px] font-medium", TAG_CLASS[tag.color], className)}>{tag.name}</span>;
}

/** Tags on a member's row. */
export function TagChips({ tags, ids }: { tags: MemberTag[]; ids: string[] | undefined }) {
  const shown = tags.filter((t) => ids?.includes(t.id));
  if (shown.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((t) => (
        <TagChip key={t.id} tag={t} />
      ))}
    </span>
  );
}

/** A member's page: toggle their tags, or edit the whop's list. */
export function MemberTagsCard({
  companyId,
  memberId,
  data,
  onChange,
}: {
  companyId: string;
  memberId: string;
  data: TagsData | null;
  onChange: (next: TagsData) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  if (!data) return null;
  const mine = data.members[memberId] ?? [];

  const toggle = async (id: string) => {
    const next = mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id];
    const before = data;
    onChange({ ...data, members: { ...data.members, [memberId]: next } });
    setError(null);
    try {
      await call("/api/coach/member-tags", { method: "PUT", body: JSON.stringify({ company: companyId, member: memberId, tagIds: next }) });
    } catch (e) {
      onChange(before);
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4 text-primary" />
            Tags
          </CardTitle>
          <CardDescription>Tap to add or remove. Filter the member list and send assignments by tag.</CardDescription>
        </div>
        <Button variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          <Pencil />
          {editing ? "Done" : "Edit tags"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <TagEditor companyId={companyId} data={data} onSaved={(next) => onChange(next)} />
        ) : (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="This member's tags">
            {data.tags.map((t) => {
              const on = mine.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => void toggle(t.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? TAG_CLASS[t.color] : "border-dashed border-border text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {on ? "✓ " : "+ "}
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

const COLOR_LABEL: Record<TagColor, string> = { gold: "Gold", blue: "Blue", green: "Green", red: "Red", purple: "Purple", gray: "Gray" };

/** Rename, recolour, add and delete the whop's tags. */
function TagEditor({ companyId, data, onSaved }: { companyId: string; data: TagsData; onSaved: (next: TagsData) => void }) {
  const [tags, setTags] = React.useState<MemberTag[]>(data.tags);
  const [newName, setNewName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const dirty = JSON.stringify(tags) !== JSON.stringify(data.tags);

  const add = () => {
    const name = newName.trim().slice(0, TAG_NAME_MAX);
    if (!name || tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
    setTags([...tags, { id: tagIdFor(name, tags), name, color: TAG_COLORS[tags.length % TAG_COLORS.length]! }]);
    setNewName("");
  };
  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await call<TagsData>("/api/coach/tags", { method: "PUT", body: JSON.stringify({ company: companyId, tags }) });
      onSaved(next);
      setTags(next.tags);
      setMessage({ ok: true, text: "Saved." });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Couldn't save. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {tags.map((t, i) => (
          <li key={t.id} className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`tag-${t.id}`}>
              Tag name
            </label>
            <Input
              id={`tag-${t.id}`}
              value={t.name}
              maxLength={TAG_NAME_MAX}
              onChange={(e) => setTags(tags.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              className="h-8 min-w-0 flex-1"
            />
            <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={`Colour for ${t.name}`}>
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={t.color === c}
                  aria-label={COLOR_LABEL[c]}
                  onClick={() => setTags(tags.map((x, j) => (j === i ? { ...x, color: c } : x)))}
                  className={cn("h-5 w-5 rounded-full border", TAG_CLASS[c], t.color === c && "ring-2 ring-ring ring-offset-1 ring-offset-background")}
                />
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              aria-label={`Delete the ${t.name} tag`}
              onClick={() => setTags(tags.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      {tags.length < MAX_TAGS ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label className="sr-only" htmlFor="new-tag">
            New tag name
          </label>
          <Input id="new-tag" value={newName} maxLength={TAG_NAME_MAX} placeholder="New tag, e.g. Offseason" onChange={(e) => setNewName(e.target.value)} className="h-8" />
          <Button type="submit" size="sm" variant="outline" className="h-8 shrink-0" disabled={!newName.trim()}>
            <Plus />
            Add
          </Button>
        </form>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={!dirty || busy || tags.some((t) => !t.name.trim())}>
          {busy ? "Saving…" : "Save tags"}
        </Button>
        {message ? <span className={cn("text-[12px]", message.ok ? "text-muted-foreground" : "text-destructive")}>{message.text}</span> : null}
      </div>
      <p className="text-[12px] text-muted-foreground">Deleting a tag removes it from every member. Renaming keeps it on them.</p>
    </div>
  );
}
