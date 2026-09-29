"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A jump bar for a page that got long.
 *
 * School is about twenty phone screens: everything worth having about school
 * is on it, which is what was asked for, and the cost is that the tutor sits
 * six sections down. This is the cheapest fix that takes nothing away — every
 * section stays exactly where it is, and getting to one is a tap.
 *
 * Plain anchors, so it works before JavaScript loads and with it switched off.
 * The highlight is the only part that needs the observer, and without one the
 * bar still does its job.
 */
export type JumpSection = { id: string; label: string };

export function SectionJump({ sections, className }: { sections: readonly JumpSection[]; className?: string }) {
  const [active, setActive] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    // Sorted by where they sit on the PAGE, not by the order of the chips.
    // The chips are ordered by what you want first; walking that order and
    // keeping "the last one above the fold line" highlighted whichever chip
    // happened to come last in the list, not the section you are looking at.
    const elements = sections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => el !== null)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    if (elements.length === 0) return;

    /**
     * Recomputed from every section's position rather than from the entries
     * the callback hands over: entries hold only what CHANGED, so acting on
     * them directly leaves the highlight on a section that has long scrolled
     * past. The active one is the last whose top is above the fold line.
     */
    const pick = () => {
      const line = 140;
      // Nothing above the line means the page is still on the hero, and
      // highlighting the first chip there would claim you are somewhere you
      // are not. No highlight is the honest state.
      let current: HTMLElement | null = null;
      for (const el of elements) {
        if (el.getBoundingClientRect().top <= line) current = el;
      }
      setActive(current?.id ?? null);
    };

    const observer = new IntersectionObserver(pick, { threshold: [0, 0.25, 0.5, 1] });
    for (const el of elements) observer.observe(el);
    pick();

    return () => observer.disconnect();
  }, [sections]);

  // Keep the active chip in view in the bar's own scroller — on a phone the
  // last chips sit off-screen, and a highlight you cannot see is decoration.
  useEffect(() => {
    if (!active || !barRef.current) return;
    const chip = barRef.current.querySelector<HTMLElement>(`[data-jump="${active}"]`);
    chip?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <div
      ref={barRef}
      data-testid="section-jump"
      className={cn(
        "no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 py-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
        className
      )}
    >
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          data-jump={section.id}
          aria-current={active === section.id ? "true" : undefined}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
            active === section.id
              ? "border-accent/40 bg-accent/15 text-accent"
              : "border-border bg-surface text-muted hover:text-foreground"
          )}
        >
          {section.label}
        </a>
      ))}
    </div>
  );
}
