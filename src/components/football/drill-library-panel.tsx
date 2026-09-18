"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { DRILL_CUES, DRILL_VIDEOS, FOOTBALL_SKILLS } from "@/lib/data/football";
import { VideoReference } from "@/components/shared/video-reference";

export function DrillLibraryPanel({ focusSkills }: { focusSkills: string[] }) {
  const [selected, setSelected] = useState(focusSkills[0] ?? FOOTBALL_SKILLS[0]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {FOOTBALL_SKILLS.map((s) => {
          const isFocus = focusSkills.includes(s);
          const isSelected = selected === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setSelected(s)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition",
                isSelected
                  ? "bg-accent text-accent-foreground"
                  : isFocus
                    ? "bg-accent/10 text-accent ring-1 ring-accent/30 hover:bg-accent/15"
                    : "bg-surface-muted text-muted hover:text-foreground"
              )}
            >
              {s}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-surface p-3">
        <p className="text-sm">💡 {DRILL_CUES[selected]}</p>
        {DRILL_VIDEOS[selected] ? (
          <div className="mt-2">
            <VideoReference url={DRILL_VIDEOS[selected]} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">No example video for this one yet.</p>
        )}
      </div>

      <p className="text-xs text-muted">
        Highlighted skills are your position&apos;s focus areas or your own selected weaknesses. One real
        example video per skill — a starting point to watch before you train, never a replacement for a coach.
      </p>
    </div>
  );
}
