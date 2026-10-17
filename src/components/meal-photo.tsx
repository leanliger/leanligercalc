"use client";

import * as React from "react";
import { Camera, Loader2, Mic, MicOff, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FoodEntry } from "@/lib/food";
import type { MealEstimate, MealEstimateItem } from "@/lib/meal-photo";
import { MEAL_DESCRIBE_MAX_CHARS } from "@/lib/meal-describe";
import { cn } from "@/lib/utils";

/**
 * Add food → Photo: photograph a plate, get Gemini's estimate of each food
 * (worker/meal-photo.ts), fix anything that's off, then log them all. The
 * photo is shrunk on the phone before it's sent and isn't kept.
 *
 * Add food → Describe: the same, from a typed or dictated description
 * (worker/meal-describe.ts).
 */

const MAX_SIDE = 768;

/** The photo as a small JPEG, base64 without the data: prefix. Also used for label photos (bigger, for small print). */
export async function shrink(file: File, maxSide = MAX_SIDE): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't a photo the browser can read."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72).split(",")[1] ?? "";
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Row = { name: string; grams: string; kcal: string; protein: string; carbs: string; fat: string };
const toRow = (i: MealEstimateItem): Row => ({
  name: i.name,
  grams: String(i.grams),
  kcal: String(i.kcal),
  protein: String(i.protein),
  carbs: String(i.carbs),
  fat: String(i.fat),
});
const n = (v: string) => {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? x : NaN;
};

type AddMany = (entries: Omit<FoodEntry, "id" | "meal">[]) => Promise<void>;

/** Ask the worker for an estimate; throws with a message the member can read. */
async function fetchEstimate(path: string, body: unknown): Promise<{ estimate: MealEstimate; left: number | null }> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const b = (await res.json().catch(() => null)) as { estimate?: MealEstimate; left?: number; error?: string } | null;
  if (!res.ok || !b?.estimate) throw new Error(b?.error ?? "The estimate didn't come back. Try again.");
  return { estimate: b.estimate, left: typeof b.left === "number" ? b.left : null };
}

/**
 * The foods in an estimate, each editable (name, grams, kcal, P, C, F) or
 * removable, with the total and an "Add N foods" button.
 */
function EstimateReview({
  estimate,
  thumb,
  mealLabel,
  onAddMany,
  more,
  footnote,
}: {
  estimate: MealEstimate;
  /** A thumbnail of the photo, when there is one. */
  thumb?: string | null;
  mealLabel: string;
  onAddMany: AddMany;
  /** A second button beside Add, e.g. "Another photo". */
  more?: React.ReactNode;
  footnote: string;
}) {
  const [rows, setRows] = React.useState<Row[]>(() => estimate.items.map(toRow));
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const valid = rows.length > 0 && rows.every((r) => r.name.trim() && [r.grams, r.kcal, r.protein, r.carbs, r.fat].every((v) => !Number.isNaN(n(v))));
  const total = rows.reduce((s, r) => s + (n(r.kcal) || 0), 0);

  const add = async () => {
    setAdding(true);
    setError(null);
    try {
      await onAddMany(
        rows.map((r) => ({
          name: r.name.trim(),
          brand: null,
          barcode: null,
          quantity: Math.max(1, Math.round(n(r.grams))),
          unit: "g" as const,
          servingLabel: null,
          kcal: Math.round(n(r.kcal)),
          protein: Math.round(n(r.protein)),
          carbs: Math.round(n(r.carbs)),
          fat: Math.round(n(r.fat)),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add them. Try again.");
      setAdding(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="Your meal" className="h-16 w-16 shrink-0 rounded-md object-cover" />
        ) : null}
        <div className="min-w-0 space-y-0.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {estimate.name || "Your meal"}
          </p>
          <p className="text-[12px] text-muted-foreground">
            {estimate.confidence === "high" ? "Fairly confident" : estimate.confidence === "medium" ? "Rough estimate" : "Low confidence"}
            {estimate.note ? `: ${estimate.note}` : "."}
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="space-y-1.5 rounded-md border border-border p-2">
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor={`mp-name-${i}`}>
                Food name
              </label>
              <Input
                id={`mp-name-${i}`}
                value={r.name}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                className="h-8 min-w-0 flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground"
                aria-label={`Remove ${r.name}`}
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {(
                [
                  ["grams", "g"],
                  ["kcal", "kcal"],
                  ["protein", "P"],
                  ["carbs", "C"],
                  ["fat", "F"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="space-y-0.5">
                  <span className="block text-center text-[11px] text-muted-foreground">{label}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={r[k]}
                    aria-label={`${r.name} ${k}`}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))}
                    className={cn("tabular h-8 px-1.5 text-center text-sm", Number.isNaN(n(r[k])) && "border-destructive")}
                  />
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="tabular text-sm">
        Total <span className="font-semibold">{Math.round(total).toLocaleString()} kcal</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void add()} disabled={!valid || adding}>
          {adding ? "Adding…" : `Add ${rows.length} food${rows.length === 1 ? "" : "s"} to ${mealLabel}`}
        </Button>
        {more}
      </div>
      <p className="text-[12px] text-muted-foreground">{footnote}</p>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function MealPhotoView({ mealLabel, onAddMany, onCancel }: { mealLabel: string; onAddMany: AddMany; onCancel: () => void }) {
  const [stage, setStage] = React.useState<"pick" | "working" | "review">("pick");
  const [preview, setPreview] = React.useState<string | null>(null);
  const [estimate, setEstimate] = React.useState<MealEstimate | null>(null);
  const [left, setLeft] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // A new estimate starts a fresh review list.
  const [round, setRound] = React.useState(0);
  const input = React.useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setStage("working");
    try {
      const image = await shrink(file);
      setPreview(`data:image/jpeg;base64,${image}`);
      const r = await fetchEstimate("/api/meal-photo", { image, mediaType: "image/jpeg" });
      setEstimate(r.estimate);
      setLeft(r.left);
      setRound((x) => x + 1);
      setStage(r.estimate.items.length > 0 ? "review" : "pick");
      if (r.estimate.items.length === 0) setError(r.estimate.note || "No food found in that photo.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't estimate that photo.");
      setStage("pick");
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Take or choose a photo of your meal"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {stage === "pick" ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Take a photo of your plate from above. You&apos;ll get an estimate of each food to check before anything is logged.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => input.current?.click()}>
              <Camera />
              Take or choose a photo
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {stage === "working" ? (
        <div className="flex items-center gap-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your meal" className="h-16 w-16 rounded-md object-cover" />
          ) : null}
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Estimating your meal…
          </p>
        </div>
      ) : null}

      {stage === "review" && estimate ? (
        <EstimateReview
          key={round}
          estimate={estimate}
          thumb={preview}
          mealLabel={mealLabel}
          onAddMany={onAddMany}
          more={
            <Button variant="outline" onClick={() => input.current?.click()}>
              <Camera />
              Another photo
            </Button>
          }
          footnote={`Photo estimates can be off by 20–30%, mostly on portion size and hidden oil. Fix the grams if you know them.${
            left !== null ? ` ${left} photo estimate${left === 1 ? "" : "s"} left today.` : ""
          }`}
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* -------------------------------- describe -------------------------------- */

/** The browser's speech recogniser, where there is one (Chrome, Edge, Safari). */
type Recogniser = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
function speechRecogniser(): (new () => Recogniser) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recogniser; webkitSpeechRecognition?: new () => Recogniser };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const EXAMPLES = ["2 eggs, toast with butter, black coffee", "Chicken breast 200 g, 1 cup rice, broccoli", "Protein shake with a banana and 1 tbsp peanut butter"];

export function DescribeMealView({ mealLabel, onAddMany, onCancel }: { mealLabel: string; onAddMany: AddMany; onCancel: () => void }) {
  const [text, setText] = React.useState("");
  const [working, setWorking] = React.useState(false);
  const [estimate, setEstimate] = React.useState<MealEstimate | null>(null);
  const [left, setLeft] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const [listening, setListening] = React.useState(false);
  const recogniser = React.useRef<Recogniser | null>(null);
  const [canListen] = React.useState(() => speechRecogniser() !== null);
  const id = React.useId();

  React.useEffect(() => () => recogniser.current?.stop(), []);

  const listen = () => {
    if (listening) {
      recogniser.current?.stop();
      return;
    }
    const R = speechRecogniser();
    if (!R) return;
    const r = new R();
    r.lang = navigator.language || "en-US";
    r.interimResults = true;
    r.continuous = false;
    const before = text.trim();
    r.onresult = (e) => {
      const said = Array.from(e.results)
        .map((x) => x[0]?.transcript ?? "")
        .join(" ")
        .trim();
      setText(`${before}${before && said ? ", " : ""}${said}`.slice(0, MEAL_DESCRIBE_MAX_CHARS));
    };
    r.onerror = (e) => {
      setError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "The microphone isn't allowed here. Use the mic on your keyboard instead."
          : e.error === "no-speech"
            ? "Didn't catch that. Try again, a little closer."
            : "Voice input stopped. Type it, or use the mic on your keyboard.",
      );
    };
    r.onend = () => setListening(false);
    recogniser.current = r;
    setError(null);
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Voice input isn't available here. Use the mic on your keyboard instead.");
    }
  };

  const submit = async () => {
    recogniser.current?.stop();
    const t = text.trim();
    if (t.length < 2) return;
    setWorking(true);
    setError(null);
    try {
      const r = await fetchEstimate("/api/food/describe", { text: t });
      setLeft(r.left);
      if (r.estimate.items.length === 0) {
        setEstimate(null);
        setError(r.estimate.note || "Couldn't find any foods in that. Try listing them with amounts.");
      } else {
        setEstimate(r.estimate);
        setRound((x) => x + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that meal. Try again.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-3">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor={id} className="text-sm text-muted-foreground">
          What did you eat? List the foods, with amounts if you know them.
        </label>
        <div className="relative">
          <textarea
            id={id}
            value={text}
            maxLength={MEAL_DESCRIBE_MAX_CHARS}
            rows={3}
            placeholder={EXAMPLES[0]}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            className={cn(
              "w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              canListen && "pr-12",
            )}
          />
          {canListen ? (
            <Button
              type="button"
              variant={listening ? "default" : "ghost"}
              size="icon"
              onClick={listen}
              aria-pressed={listening}
              aria-label={listening ? "Stop listening" : "Say it instead"}
              className="absolute right-1.5 top-1.5 h-9 w-9"
            >
              {listening ? <MicOff /> : <Mic />}
            </Button>
          ) : null}
        </div>
        {listening ? (
          <p role="status" className="text-xs text-primary">
            Listening… say what you ate, then tap the mic to stop.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={working || text.trim().length < 2}>
            {working ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {working ? "Working it out…" : estimate ? "Try again" : "Work it out"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={working}>
            Cancel
          </Button>
        </div>
        {!estimate && !working ? (
          <div className="flex flex-wrap gap-1.5" aria-label="Examples">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setText(ex)}
                className="rounded-full border border-border px-2.5 py-1 text-[12px] text-muted-foreground hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {ex}
              </button>
            ))}
          </div>
        ) : null}
      </form>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {estimate ? (
        <EstimateReview
          key={round}
          estimate={estimate}
          mealLabel={mealLabel}
          onAddMany={onAddMany}
          footnote={`Amounts you didn't give are typical portions; fix the grams if you know them.${
            left !== null ? ` ${left} described meal${left === 1 ? "" : "s"} left today.` : ""
          }`}
        />
      ) : null}
    </div>
  );
}
