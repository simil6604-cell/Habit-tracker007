"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DRILL_CUES,
  FOOTBALL_SKILLS,
  MAX_DRILL_VIDEOS_PER_SKILL,
  drillSearchUrl,
  suggestedDrillVideos,
} from "@/lib/data/football";
import { VideoReference } from "@/components/shared/video-reference";
import {
  saveDrillVideo,
  deleteSavedDrillVideo,
  type SavedDrillVideo,
} from "@/lib/football/drill-video-actions";

export function DrillLibraryPanel({
  focusSkills,
  savedVideos,
}: {
  focusSkills: string[];
  savedVideos: SavedDrillVideo[];
}) {
  const [selected, setSelected] = useState(focusSkills[0] ?? FOOTBALL_SKILLS[0]);
  const [videos, setVideos] = useState<SavedDrillVideo[]>(savedVideos);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const suggested = suggestedDrillVideos(selected);
  const mine = videos.filter((v) => v.skill === selected);

  function pick(skill: string) {
    setSelected(skill);
    setError(null);
    setUrl("");
    setLabel("");
  }

  return (
    <div className="flex flex-col gap-3" data-testid="drill-library">
      <div className="flex flex-wrap gap-1.5">
        {FOOTBALL_SKILLS.map((s) => {
          const isFocus = focusSkills.includes(s);
          const isSelected = selected === s;
          return (
            <button
              key={s}
              type="button"
              onClick={() => pick(s)}
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

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3">
        <p className="text-sm">💡 {DRILL_CUES[selected]}</p>

        {suggested.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted">
              Suggested {suggested.length === 1 ? "example" : `examples (${suggested.length})`}
            </p>
            <div className="flex flex-wrap gap-2" data-testid="drill-suggested">
              {suggested.map((v) => (
                <VideoReference key={v} url={v} />
              ))}
            </div>
          </div>
        )}

        {mine.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted">Yours ({mine.length})</p>
            <div className="flex flex-wrap gap-2" data-testid="drill-saved">
              {mine.map((v) => (
                <div key={v.id} className="flex flex-col gap-1">
                  <VideoReference url={v.url} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-muted">{v.label ?? "Saved by you"}</span>
                    <button
                      type="button"
                      title="Remove this video"
                      disabled={pending}
                      onClick={() => startTransition(async () => setVideos(await deleteSavedDrillVideo(v.id)))}
                      className="text-muted hover:text-danger"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {suggested.length === 0 && mine.length === 0 && (
          <p className="text-xs text-muted">
            No example video suggested for {selected} yet — this app never guesses a video link, so search for one and
            save the one you rate.
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!url.trim() || pending) return;
            const skill = selected;
            const pastedUrl = url;
            const pastedLabel = label;
            startTransition(async () => {
              const result = await saveDrillVideo(skill, pastedUrl, pastedLabel);
              setVideos(result.videos);
              setError(result.error ?? null);
              if (!result.error) {
                setUrl("");
                setLabel("");
              }
            });
          }}
          className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row"
        >
          <input
            name="drillVideoUrl"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={`Paste a ${selected} video link…`}
            className="flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-accent"
          />
          <input
            name="drillVideoLabel"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Note (optional)"
            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-accent sm:w-36"
          />
          <button
            type="submit"
            disabled={pending || !url.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
          >
            Save
          </button>
        </form>

        {error && <p className="text-xs text-danger">{error}</p>}

        <a
          href={drillSearchUrl(selected)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-accent underline"
        >
          Find more {selected} drills on YouTube <ExternalLink size={11} />
        </a>
      </div>

      <p className="text-xs text-muted">
        Highlighted skills are your position&apos;s focus areas or your own selected weaknesses. Up to{" "}
        {MAX_DRILL_VIDEOS_PER_SKILL} suggested examples per skill plus {MAX_DRILL_VIDEOS_PER_SKILL} of your own — a
        starting point to watch before you train, never a replacement for a coach.
      </p>
    </div>
  );
}
