"use client";

import * as React from "react";
import { Dumbbell } from "lucide-react";
import { ART_CREDIT, exerciseArt } from "@/lib/exercise-art";
import { cn } from "@/lib/utils";

const mask = (src: string): React.CSSProperties => ({ WebkitMaskImage: `url(${src})`, maskImage: `url(${src})` });

/**
 * The small drawing beside an exercise name, or a dumbbell for a member's own
 * exercise. Decorative: the name next to it says what it is.
 */
export function ExerciseThumb({ exerciseId, className }: { exerciseId: string; className?: string }) {
  const art = exerciseArt(exerciseId);
  return (
    <span aria-hidden className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40", className)}>
      {art ? (
        <span className="exercise-art h-[88%] w-[88%] bg-foreground/85" style={mask(art.thumb)} />
      ) : (
        <Dumbbell className="h-1/2 w-1/2 text-muted-foreground" />
      )}
    </span>
  );
}

/** Both positions of a built-in exercise, for its own page. Nothing for a member's own exercise. */
export function ExerciseDrawings({ exerciseId, name }: { exerciseId: string; name: string }) {
  const art = exerciseArt(exerciseId);
  if (!art) return null;
  const pair = art.drawings.length > 1;
  return (
    <figure className="space-y-1.5">
      <div className={cn("grid gap-px overflow-hidden rounded-lg border border-border bg-border", pair ? "grid-cols-2" : "grid-cols-1")}>
        {art.drawings.map((src, i) => (
          <div key={src} className="bg-background p-3">
            <div
              role="img"
              aria-label={pair ? `${name}, ${i === 0 ? "first" : "second"} position` : `${name}, drawing`}
              className={cn("exercise-art w-full bg-foreground/85", pair ? "aspect-square" : "aspect-[2/1]")}
              style={mask(src)}
            />
          </div>
        ))}
      </div>
      <figcaption className="text-[10px] leading-snug text-muted-foreground">
        Drawings:{" "}
        <a href={ART_CREDIT.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
          {ART_CREDIT.title}
        </a>{" "}
        by {ART_CREDIT.author}, based on {ART_CREDIT.basedOn} ·{" "}
        <a href={ART_CREDIT.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
          {ART_CREDIT.license}
        </a>
      </figcaption>
    </figure>
  );
}
