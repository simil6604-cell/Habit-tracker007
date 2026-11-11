"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { ListMusic, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PodcastPlayer } from "./podcast-player";
import { formatLength } from "@/lib/school/podcast";
import { deletePodcastEpisode } from "@/lib/school/podcast-actions";

export type Episode = {
  id: string;
  title: string;
  source: string;
  script: string;
  seconds: number;
  createdAt: Date;
};

/**
 * The episodes, as something you can put on and leave on.
 *
 * A list of players with a play button each is fine at a desk and useless
 * on the way to training: it stops after every episode and wants the phone
 * back out. "Play all" starts at the top and keeps going, which is what
 * someone means by a podcast.
 *
 * A client component because the queue is state and the player is a client
 * component anyway. Deleting still goes through the same server action.
 */
export function PodcastEpisodes({ episodes, playId }: { episodes: Episode[]; playId?: string }) {
  /** Which episode the queue is on, or null when nothing is queued. */
  const [queueAt, setQueueAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const total = episodes.reduce((sum, episode) => sum + episode.seconds, 0);

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={queueAt === null ? "secondary" : "outline"}
          onClick={() => setQueueAt(queueAt === null ? 0 : null)}
          data-testid="podcast-play-all"
        >
          <ListMusic size={14} />
          {queueAt === null ? "Play all" : "Stop the queue"}
        </Button>
        <span className="text-xs text-muted">
          {episodes.length} episode{episodes.length === 1 ? "" : "s"} · {formatLength(total)} in all
          {queueAt !== null && ` · on ${queueAt + 1} of ${episodes.length}`}
        </span>
      </div>

      <ul className="mt-3 flex flex-col gap-3" data-testid="podcast-episodes">
        {episodes.map((episode, index) => (
          <li
            key={episode.id}
            // The anchor the chat's link carries, so the browser scrolls
            // here by itself — no script, and it works on a cold open.
            id={`ep-${episode.id}`}
            className={
              playId === episode.id || queueAt === index
                ? "scroll-mt-24 rounded-2xl border-2 border-accent bg-surface p-4"
                : "scroll-mt-24 rounded-2xl border border-border bg-surface p-4"
            }
            data-testid={playId === episode.id ? "podcast-episode-new" : undefined}
          >
            {playId === episode.id && queueAt === null && (
              <p className="mb-2 text-xs font-medium text-accent">Here it is — press play.</p>
            )}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{episode.title}</p>
                <p className="text-xs text-muted">
                  {episode.source} · {formatLength(episode.seconds)} · {format(episode.createdAt, "d MMM yyyy")}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Delete ${episode.title}`}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await deletePodcastEpisode(episode.id);
                    setQueueAt(null);
                  })
                }
                className="text-muted transition hover:text-danger disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <div className="mt-3">
              <PodcastPlayer
                script={episode.script}
                title={episode.title}
                subtitle={episode.source}
                autoPlay={queueAt === index}
                onFinished={() => {
                  // The end of the list is the end of the queue, not a loop
                  // back to the top: it is revision, not a radio station.
                  if (queueAt !== index) return;
                  setQueueAt(index + 1 < episodes.length ? index + 1 : null);
                }}
              />
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted">Read it instead</summary>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{episode.script}</p>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}
