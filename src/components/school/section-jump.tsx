"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
 * With JavaScript the click is taken over, because the browser's own anchor
 * jump has a limit this page runs into: it can only scroll as far as the
 * document goes. Homework, Marked work and Notes all sit inside the last
 * screenful, so tapping any of them moved the page by nothing at all and the
 * bar looked broken. Now the page goes as far as it can and the section
 * itself flashes a ring, so a tap always answers.
 */
/**
 * A chip in the bar: a section of this page, or a page of its own.
 *
 * Flashcards and the podcast are pages rather than sections, and they were
 * reachable only from a button most of the way down this one. A thing you
 * have to scroll nine sections to discover is a thing nobody finds — so
 * they get a chip here too, marked as going somewhere.
 */
export type JumpSection = { id: string; label: string; href?: string };

/** How long the ring stays on the section you were sent to. */
const ARRIVE_MS = 1800;

export function SectionJump({ sections, className }: { sections: readonly JumpSection[]; className?: string }) {
  const [active, setActive] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const arriveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (arriveTimer.current) clearTimeout(arriveTimer.current);
  }, []);

  /**
   * Takes you to a section, and says so.
   *
   * Two things the browser's own `#anchor` does not do here. It cannot scroll
   * past the end of the document, so the sections in the final screenful were
   * unreachable and the tap was silent; and it leaves the heading under the
   * sticky bar unless every section remembers its own scroll-margin. This
   * measures the bar and rings the section on arrival, which is the part that
   * matters when there was no room left to move.
   */
  const jumpTo = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    // Let the browser handle a middle-click, a modified click, or anything it
    // would open in a new tab — taking those over is how an anchor stops
    // behaving like a link.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const target = document.getElementById(id);
    if (!target) return; // Nothing to improve on; the anchor can try.
    event.preventDefault();

    const bar = barRef.current?.getBoundingClientRect();
    const offset = (bar?.height ?? 56) + 8;
    const top = window.scrollY + target.getBoundingClientRect().top - offset;
    // Instant, not smooth: a smooth scroll is cancelled by any other scroll
    // that happens while it runs, and this bar moves its own scroller as the
    // highlight follows along.
    window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    history.replaceState(null, "", `#${id}`);

    // Light the chip now rather than waiting for the observer. When the page
    // could not move, nothing crosses the fold line, no callback runs, and
    // the chip you just pressed would stay grey.
    setActive(id);

    target.classList.remove("jump-arrive");
    // Reading layout restarts the animation when the same section is tapped
    // twice; without it the second tap adds a class the element already had
    // and nothing happens.
    void target.offsetWidth;
    target.classList.add("jump-arrive");
    if (arriveTimer.current) clearTimeout(arriveTimer.current);
    arriveTimer.current = setTimeout(() => target.classList.remove("jump-arrive"), ARRIVE_MS);
  };

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    // Sorted by where they sit on the PAGE, not by the order of the chips.
    // The chips are ordered by what you want first; walking that order and
    // keeping "the last one above the fold line" highlighted whichever chip
    // happened to come last in the list, not the section you are looking at.
    const elements = sections
      .filter((section) => !section.href)
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
  //
  // Done by moving the bar's own scrollLeft rather than with scrollIntoView:
  // that call is allowed to scroll every ancestor, the page included, and a
  // bar that scrolls the page while you are reading it is worse than a
  // highlight you cannot see.
  useEffect(() => {
    const bar = barRef.current;
    if (!active || !bar) return;
    const chip = bar.querySelector<HTMLElement>(`[data-jump="${active}"]`);
    if (!chip) return;
    const chipBox = chip.getBoundingClientRect();
    const barBox = bar.getBoundingClientRect();
    if (chipBox.left < barBox.left) bar.scrollLeft -= barBox.left - chipBox.left + 16;
    else if (chipBox.right > barBox.right) bar.scrollLeft += chipBox.right - barBox.right + 16;
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
      {sections.map((section) =>
        section.href ? (
          // Another page: an ordinary link, no scrolling and no ring.
          <Link
            key={section.id}
            href={section.href}
            data-jump={section.id}
            className="shrink-0 rounded-full border border-dashed border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted transition hover:border-accent/50 hover:text-foreground"
          >
            {section.label} →
          </Link>
        ) : (
        <a
          key={section.id}
          href={`#${section.id}`}
          data-jump={section.id}
          onClick={(event) => jumpTo(event, section.id)}
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
        )
      )}
    </div>
  );
}
