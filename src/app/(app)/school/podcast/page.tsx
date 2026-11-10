import Link from "next/link";
import { format } from "date-fns";
import { Headphones, Layers, Trash2 } from "lucide-react";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { isRealAIConfigured } from "@/lib/ai/provider";
import { podcastSources } from "@/lib/school/podcast-actions";
import { hasMaterial, formatLength } from "@/lib/school/podcast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PodcastPlayer } from "@/components/school/podcast-player";
import { MakeEpisodeForm } from "@/components/school/make-episode-form";
import { deletePodcastEpisode } from "@/lib/school/podcast-actions";

export const metadata = { title: "Podcast" };

/**
 * Your own material, to listen to.
 *
 * Asked for next to the flashcards: when there is no time to read, hear it
 * instead. Nothing here is a real podcast from the internet — it is written
 * from this account's own topics, flashcards and the things they wrote down
 * as not understood, and read out loud.
 */
export default async function PodcastPage({
  searchParams,
}: {
  searchParams: Promise<{ play?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  // Which episode to point at, when the chat sent them here. The id only
  // ever picks one of this account's own rows out of the list below, so a
  // made-up one simply matches nothing.
  const { play } = await searchParams;

  const [episodes, sources] = await Promise.all([
    prisma.podcastEpisode.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
    podcastSources(),
  ]);

  const usable = sources.filter(hasMaterial);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">School</p>
          <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            <Headphones size={28} /> Podcast
          </h1>
          <p className="mt-1 text-muted">
            Your own notes, read out loud — for the bus, the walk, or when there is no time to read.
          </p>
        </div>
        <Link href="/school/flashcards">
          <Button variant="outline" size="sm"><Layers size={14} /> Flashcards</Button>
        </Link>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Make an episode</CardTitle></CardHeader>
        <CardContent>
          {!isRealAIConfigured ? (
            <p className="text-sm text-muted">
              An episode has to be written before it can be read out, and that needs the AI key. Add
              ANTHROPIC_API_KEY where your app&apos;s environment variables are set, and this page starts working.
            </p>
          ) : usable.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing to make one from yet. Add a subject with a topic or two under School, photograph some
              notes or make a few flashcards — an episode is written from your own material, never from
              nothing.
            </p>
          ) : (
            <MakeEpisodeForm sources={usable} />
          )}
        </CardContent>
      </Card>

      <h2 className="mt-8 text-xl font-semibold tracking-tight">
        {episodes.length === 0 ? "No episodes yet" : `Your episodes (${episodes.length})`}
      </h2>

      {episodes.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Make one above and it stays here — written once, listened to as often as you like.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3" data-testid="podcast-episodes">
          {episodes.map((episode) => (
            <li
              key={episode.id}
              // The anchor the chat's link carries, so the browser scrolls
              // here by itself — no script, and it works on a cold open.
              id={`ep-${episode.id}`}
              className={
                play === episode.id
                  ? "scroll-mt-24 rounded-2xl border-2 border-accent bg-surface p-4"
                  : "scroll-mt-24 rounded-2xl border border-border bg-surface p-4"
              }
              data-testid={play === episode.id ? "podcast-episode-new" : undefined}
            >
              {play === episode.id && (
                <p className="mb-2 text-xs font-medium text-accent">
                  Here it is — press play.
                </p>
              )}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{episode.title}</p>
                  <p className="text-xs text-muted">
                    {episode.source} · {formatLength(episode.seconds)} ·{" "}
                    {format(episode.createdAt, "d MMM yyyy")}
                  </p>
                </div>
                <form action={deletePodcastEpisode.bind(null, episode.id)}>
                  <button
                    type="submit"
                    aria-label={`Delete ${episode.title}`}
                    className="text-muted transition hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </form>
              </div>

              <div className="mt-3">
                <PodcastPlayer script={episode.script} title={episode.title} />
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted">Read it instead</summary>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{episode.script}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
