"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { isRealAIConfigured } from "@/lib/ai/provider";
import { writeEpisode, episodeLength } from "./podcast-episode";
import { type PodcastSource } from "./podcast";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type PodcastState = { error?: string; ok?: boolean } | undefined;

export async function podcastSources(): Promise<PodcastSource[]> {
  const userId = await requireUserId();
  const subjects = await prisma.subject.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      topics: {
        select: {
          name: true,
          _count: { select: { learningLog: true, notePhotos: true } },
        },
      },
      _count: { select: { flashcards: true } },
    },
  });

  return subjects.map((subject) => ({
    subjectId: subject.id,
    subjectName: subject.name,
    topics: subject.topics.map((topic) => topic.name),
    flashcards: subject._count.flashcards,
    notes: subject.topics.reduce((sum, topic) => sum + topic._count.notePhotos, 0),
    confusions: subject.topics.reduce((sum, topic) => sum + topic._count.learningLog, 0),
  }));
}

export async function makePodcastEpisode(_prev: PodcastState, formData: FormData): Promise<PodcastState> {
  const userId = await requireUserId();
  if (!isRealAIConfigured) {
    return {
      error:
        "An episode has to be written, and that needs the AI key. Without it there is nothing to read out — add ANTHROPIC_API_KEY and this works.",
    };
  }

  // The work itself lives in podcast-episode.ts, because the tutor can be
  // asked for an episode in the chat and must do exactly the same thing.
  const about = String(formData.get("about") ?? "").trim().slice(0, 120);
  const result = await writeEpisode(userId, {
    subjectId: String(formData.get("subjectId") ?? ""),
    minutes: episodeLength(formData.get("minutes")),
    focus: about || null,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/school/podcast");
  return { ok: true };
}

export async function deletePodcastEpisode(id: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.podcastEpisode.deleteMany({ where: { id, userId } });
  revalidatePath("/school/podcast");
}
