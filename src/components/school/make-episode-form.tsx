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
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        >
          {sources.map((source) => (
            <option key={source.subjectId} value={source.subjectId}>
              {source.subjectName}
            </option>
          ))}
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
        Written from the material listed above and nothing else — your topics, your flashcards, and whatever you
        marked as not understood, which is where it will spend the most time.
      </p>

      {state?.error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{state.error}</p>
      )}
    </form>
  );
}
