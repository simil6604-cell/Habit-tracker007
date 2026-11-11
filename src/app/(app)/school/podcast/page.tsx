import Link from "next/link";
import { Headphones, Layers } from "lucide-react";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { isRealAIConfigured } from "@/lib/ai/provider";
import { podcastSources } from "@/lib/school/podcast-actions";
import { hasMaterial } from "@/lib/school/podcast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PodcastEpisodes } from "@/components/school/podcast-episodes";
import { MakeEpisodeForm } from "@/components/school/make-episode-form";

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
            Two voices talking through your own material — for the bus, the walk, the gym, or anywhere reading
            isn&apos;t an option. Press <strong>Play all</strong> and it keeps going on its own.
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
        <PodcastEpisodes episodes={episodes} playId={play} />
      )}
    </div>
  );
}
