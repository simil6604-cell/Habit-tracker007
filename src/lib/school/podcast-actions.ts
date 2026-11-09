"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import { describeSource, episodeTitle, parseScript, type PodcastSource } from "./podcast";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type PodcastState = { error?: string; ok?: boolean } | undefined;

/**
 * Written to be heard, not read.
 *
 * The rules are the ones that went wrong by hand: a synthesiser reads an
 * asterisk out as the word, a heading as a sentence fragment, and "1." as
 * "one full stop". And there is nobody to ask a question of, so the
 * conversational closing the voice tutor uses is wrong here — this is a
 * person talking you through something on the bus.
 */
const SYSTEM = `You are writing a short audio lesson for one student, to be read aloud by a speech synthesiser. It is made from their own material — their topics, their flashcards, the things they wrote down as not understood.

Write it the way a good teacher talks when there is no board:

- Plain spoken prose. No markdown at all: no asterisks, no hashes, no bullet points, no numbered lists, no headings. Every one of those is read out as a word and ruins it.
- Open by saying what this episode covers, in one sentence.
- Then work through it. Short sentences, varied length, the way someone actually speaks. Signpost with words — "first", "the thing to watch out for here", "so, putting that together".
- Use their own material. Where they flagged something as not understood, spend the most time there and say why it trips people up.
- Numbers and symbols as you would say them: "about sixty per cent", not "~60%".
- Close by naming the two or three things to remember.
- Only what is in the material below. Do not invent syllabus content, exam questions or facts they have not recorded. If there is little to go on, make a short honest episode about that little rather than padding it.
- Write it in the language the material is in.

Give the script and nothing else — no title line, no notes, no stage directions.`;

/** Everything this account has recorded for one subject, as plain text. */
async function gatherMaterial(userId: string, subjectId: string) {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    select: {
      id: true,
      name: true,
      level: true,
      topics: {
        select: {
          id: true,
          name: true,
          progressPct: true,
          learningLog: { select: { type: true, content: true }, take: 20, orderBy: { createdAt: "desc" } },
          notePhotos: { select: { summary: true }, take: 10, orderBy: { createdAt: "desc" } },
          classRecordings: { select: { summary: true }, take: 5, orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!subject) return null;

  const flashcards = await prisma.flashcard.findMany({
    where: { userId, subjectId: subject.id },
    select: { front: true, back: true },
    take: 40,
    orderBy: { createdAt: "desc" },
  });

  return { subject, flashcards };
}

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

  const subjectId = String(formData.get("subjectId") ?? "");
  const minutes = Number(formData.get("minutes") ?? 5);
  const length = [3, 5, 10].includes(minutes) ? minutes : 5;

  const material = await gatherMaterial(userId, subjectId);
  if (!material) return { error: "That subject is not there any more." };

  const { subject, flashcards } = material;
  const lines: string[] = [`Subject: ${subject.name}${subject.level ? ` (${subject.level})` : ""}`];

  for (const topic of subject.topics) {
    lines.push(`\nTopic: ${topic.name} — ${topic.progressPct}% through it`);
    for (const entry of topic.learningLog) {
      const label =
        entry.type === "CONFUSED" ? "did not understand" : entry.type === "QUESTION" ? "asked" : "understood";
      lines.push(`  (${label}) ${entry.content}`);
    }
    for (const note of topic.notePhotos) if (note.summary) lines.push(`  (from their notes) ${note.summary}`);
    for (const rec of topic.classRecordings) if (rec.summary) lines.push(`  (from a lesson) ${rec.summary}`);
  }

  if (flashcards.length > 0) {
    lines.push("\nTheir flashcards:");
    for (const card of flashcards) lines.push(`  Q: ${card.front} / A: ${card.back}`);
  }

  const source: PodcastSource = {
    subjectId: subject.id,
    subjectName: subject.name,
    topics: subject.topics.map((topic) => topic.name),
    flashcards: flashcards.length,
    notes: subject.topics.reduce((sum, topic) => sum + topic.notePhotos.length, 0),
    confusions: subject.topics.reduce((sum, topic) => sum + topic.learningLog.length, 0),
  };

  const prompt = [
    `Write an audio lesson of about ${length} minutes — roughly ${length * 140} words.`,
    "",
    "Their material:",
    lines.join("\n"),
  ].join("\n");

  let raw: string;
  try {
    // Room for ten minutes of speech and then some: cut off mid-sentence,
    // an episode ends in the middle of a word.
    raw = await getAIProvider().generate(prompt, { system: SYSTEM, maxTokens: 6000 });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The episode could not be written." };
  }

  const parsed = parseScript(raw);
  if (!parsed.ok) return { error: parsed.error };

  await prisma.podcastEpisode.create({
    data: {
      userId,
      subjectId: subject.id,
      title: episodeTitle(`${subject.name}: what you have been working on`, `${subject.name} — ${length} minutes`),
      source: describeSource(source),
      script: parsed.script,
      seconds: parsed.seconds,
    },
  });

  revalidatePath("/school/podcast");
  return { ok: true };
}

export async function deletePodcastEpisode(id: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.podcastEpisode.deleteMany({ where: { id, userId } });
  revalidatePath("/school/podcast");
}
