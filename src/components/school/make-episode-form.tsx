"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { makePodcastEpisode, type PodcastState } from "@/lib/school/podcast-actions";
import { describeSource, type PodcastSource } from "@/lib/school/podcast";

export function MakeEpisodeForm({ sources }: { sources: PodcastSource[] }) {
  const [state, action, pending] = useActionState<PodcastState, FormData>(makePodcastEpisode, undefined);

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
          placeholder="About what? (optional — e.g. elasticity)"
          aria-label="What the episode is about"
          // Its own line on a phone: three controls and a button in one row
          // squeezes the subject down to "Ec…".
          className="min-w-0 basis-full rounded-lg border border-border bg-surface px-3 py-2 text-sm sm:basis-auto sm:flex-1"
        />
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
      <p className="text-xs text-muted">
        Two voices, one explaining and one asking what you would ask — made to be listened to on the way somewhere,
        not read. Built from the material listed above: your topics, your flashcards, and whatever you marked as not
        understood, which is where it spends the most time. Name a topic and it stays on that one thing, and teaches
        it properly where your notes have nothing on it yet.
      </p>

      {state?.error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{state.error}</p>
      )}
    </form>
  );
}
