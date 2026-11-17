"use client";

import { useActionState, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { makePodcastEpisode, type PodcastState } from "@/lib/school/podcast-actions";
import { describeSource, NEW_EPISODE_STYLE, type EpisodeStyle, type PodcastSource } from "@/lib/school/podcast";

/**
 * What each kind of episode is for, said in the words someone would use
 * when deciding which one they want right now.
 */
const BLURB: Record<EpisodeStyle, string> = {
  READING:
    "Your own notes, read out to you by one voice — topic by topic, nothing left out, so listening to it replaces reading them. Anything you marked as not understood gets answered rather than read back at you, and your flashcards come as a question, a beat, then the answer. Type something in the box above and it reads you that instead: what you still want to know, or want to learn.",
  CONVERSATION:
    "Two voices, one explaining and one asking what you would ask — for when the material has not gone in yet. It picks the two or three things that matter most and digs, rather than touching everything. Name a topic and it stays on that one thing, and teaches it properly where your notes have nothing on it yet.",
};

export function MakeEpisodeForm({ sources }: { sources: PodcastSource[] }) {
  const [state, action, pending] = useActionState<PodcastState, FormData>(makePodcastEpisode, undefined);
  // Which kind is selected, so the text under the form describes the thing
  // that is actually about to be made rather than both at once.
  const [style, setStyle] = useState<EpisodeStyle>(NEW_EPISODE_STYLE);

  return (
    <form action={action} className="flex flex-col gap-3" data-testid="make-episode">
      <div className="flex flex-wrap gap-2">
        <select
          name="subjectId"
          aria-label="Subject"
          className="min-w-[7.5rem] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        >
          {sources.map((source) => (
            <option key={source.subjectId} value={source.subjectId}>
              {source.subjectName}
            </option>
          ))}
        </select>
        <input
          name="about"
          maxLength={120}
          placeholder="What do you want to hear? (optional — a topic, or what you still want to know)"
          aria-label="What the episode is about"
          // Its own line on a phone: three controls and a button in one row
          // squeezes the subject down to "Ec…".
          className="min-w-0 basis-full rounded-lg border border-border bg-surface px-3 py-2 text-sm sm:basis-auto sm:flex-1"
        />
        <select
          name="style"
          value={style}
          onChange={(event) => setStyle(event.target.value as EpisodeStyle)}
          aria-label="What kind of episode"
          data-testid="episode-style"
          className="rounded-lg border border-border bg-surface px-2 py-2 text-sm"
        >
          <option value="READING">Read to me</option>
          <option value="CONVERSATION">Two voices</option>
        </select>
        <select
          name="minutes"
          defaultValue="5"
          aria-label="How long"
          className="rounded-lg border border-border bg-surface px-2 py-2 text-sm"
        >
          <option value="3">3 min</option>
          <option value="5">5 min</option>
          <option value="10">10 min</option>
          <option value="15">15 min</option>
          <option value="20">20 min</option>
        </select>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          <Sparkles size={14} /> {pending ? "Writing…" : "Make episode"}
        </Button>
      </div>

      <ul className="flex flex-col gap-0.5 text-xs text-muted">
        {sources.map((source) => (
          <li key={source.subjectId}>{describeSource(source)}</li>
        ))}
      </ul>
      <p className="text-xs text-muted" data-testid="episode-style-blurb">
        {BLURB[style]} Built from the material listed above.
      </p>

      {state?.error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{state.error}</p>
      )}
    </form>
  );
}
