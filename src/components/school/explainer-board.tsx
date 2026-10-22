"use client";

import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Youtube } from "lucide-react";
import { SafeSvg } from "@/components/shared/safe-svg";
import {
  pictureIndexAt,
  youtubeSearchUrl,
  type ExplainerStep,
} from "@/lib/ai/explainer-board";

/**
 * The board the tutor draws on while it talks.
 *
 * Asked for as "explain it like those YouTube videos where they show it in
 * images": the point is that the picture changes as the voice moves through
 * the explanation, so what you hear and what you see are the same step. The
 * panel passes in which piece is being spoken; this shows that piece's
 * drawing, large, with its caption under it.
 *
 * It stays usable with the sound off: the arrows and the dots step through it
 * by hand, so the same drawings are a thing you can read back afterwards
 * rather than something that only exists while it is talking.
 */
export function ExplainerBoard({
  steps,
  spokenIndex,
  onPick,
  speaking,
}: {
  steps: ExplainerStep[];
  /** Which piece of the reply is being spoken right now. */
  spokenIndex: number;
  /** Stepping through by hand, which also takes over from the speech. */
  onPick: (index: number) => void;
  speaking: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  /*
   * Bring it into view when a new explanation starts.
   *
   * Found by looking at it on a phone: the board appears below the hero, the
   * banner and the buttons, so the picture was half off the bottom and the
   * caption, the dots and the link were off it entirely. A board you have to
   * go looking for is not a board you watch while it talks.
   *
   * Keyed on the steps array, which the panel replaces once per reply, so
   * this runs when the answer changes and not on every step within it.
   */
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [steps]);

  const shown = pictureIndexAt(steps, spokenIndex);
  if (shown === null) return null;

  // The dots and arrows count drawings, not spoken pieces — a closing line
  // with no picture is not a step of the explanation.
  const pictures = steps.map((step, index) => ({ step, index })).filter((s) => s.step.svg !== null);
  const position = pictures.findIndex((p) => p.index === shown);
  const step = steps[shown];
  const search = youtubeSearchUrl(step.caption ?? "");

  return (
    <section
      ref={ref}
      // The jump bar above this page is sticky, so scrolling the board to the
      // very top puts its own heading and arrows underneath it.
      className="mb-2 scroll-mt-20 rounded-2xl border border-border bg-surface-muted p-3"
      data-testid="explainer-board"
      aria-live="polite"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          {speaking ? "Explaining" : "On the board"}
          {pictures.length > 1 && (
            <span className="ml-1.5 font-normal normal-case tracking-normal text-muted" data-testid="board-position">
              {position + 1} of {pictures.length}
            </span>
          )}
        </p>
        {pictures.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous picture"
              data-testid="board-prev"
              disabled={position <= 0}
              onClick={() => onPick(pictures[position - 1].index)}
              className="rounded-lg border border-border p-1 text-muted disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next picture"
              data-testid="board-next"
              disabled={position >= pictures.length - 1}
              onClick={() => onPick(pictures[position + 1].index)}
              className="rounded-lg border border-border p-1 text-muted disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/*
        Keyed by which drawing is up, so React builds a new element per step:
        that is what makes the fade run on every change instead of only the
        first, and it reruns the sanitiser for the new markup.
      */}
      <SafeSvg
        key={shown}
        code={step.svg ?? ""}
        className="animate-fade-in-up rounded-xl bg-white p-2 [&>svg]:mx-auto [&>svg]:block [&>svg]:max-h-[24vh] [&>svg]:w-full"
      />

      {step.caption && (
        <p className="mt-2 text-center text-sm font-medium" data-testid="board-caption">
          {step.caption}
        </p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        {pictures.length > 1 ? (
          <div className="flex gap-1.5">
            {pictures.map((p, i) => (
              <button
                key={p.index}
                type="button"
                aria-label={`Picture ${i + 1}${p.step.caption ? `: ${p.step.caption}` : ""}`}
                onClick={() => onPick(p.index)}
                className={`h-1.5 w-6 rounded-full ${i === position ? "bg-accent" : "bg-border"}`}
              />
            ))}
          </div>
        ) : (
          <span />
        )}
        {search && (
          // A search rather than a video: a model asked for a link invents an
          // id that looks real and goes nowhere.
          <a
            href={search}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted underline"
            data-testid="board-youtube"
          >
            <Youtube className="h-3.5 w-3.5" />
            Watch someone explain this
          </a>
        )}
      </div>
    </section>
  );
}
