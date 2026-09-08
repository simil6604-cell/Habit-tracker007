"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { schedule, type ReviewResult } from "./srs";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import { buildAcademicSystemPrompt } from "@/lib/ai/academic-prompt";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function createFlashcard(formData: FormData) {
  const userId = await requireUserId();
  const front = String(formData.get("front") ?? "").trim();
  const back = String(formData.get("back") ?? "").trim();
  if (!front || !back) return;

  await prisma.flashcard.create({
    data: {
      userId,
      subjectId: String(formData.get("subjectId") ?? "") || null,
      topic: String(formData.get("topic") ?? "") || null,
      front,
      back,
    },
  });
  revalidatePath("/school/flashcards");
}

export async function reviewFlashcard(cardId: string, result: ReviewResult) {
  const userId = await requireUserId();
  const card = await prisma.flashcard.findFirst({ where: { id: cardId, userId } });
  if (!card) return;

  const next = schedule(card, result);
  await prisma.flashcard.update({
    where: { id: cardId },
    data: { ...next, lastResult: result },
  });
  revalidatePath("/school/flashcards");
}

export async function deleteFlashcard(cardId: string) {
  const userId = await requireUserId();
  await prisma.flashcard.deleteMany({ where: { id: cardId, userId } });
  revalidatePath("/school/flashcards");
}

function parseFlashcardArray(raw: string): { front: string; back: string }[] {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const arr = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((c): c is { front: unknown; back: unknown } => typeof c === "object" && c !== null)
      .map((c) => ({ front: String(c.front ?? "").trim(), back: String(c.back ?? "").trim() }))
      .filter((c) => c.front && c.back);
  } catch {
    return [];
  }
}

/**
 * Turns your lowest-progress topics into flashcards. With a real AI
 * connected, each card is a genuine question/answer pair generated for
 * that topic at your Cambridge level; without one, it falls back to a
 * template card pointing you back to your own notes — never invented
 * subject content passed off as real.
 */
export async function generateFlashcardsFromWeakTopics() {
  const userId = await requireUserId();
  const topics = await prisma.topic.findMany({
    where: { subject: { userId }, progressPct: { lt: 60 } },
    include: { subject: true },
    take: 5,
  });

  const system = isRealAIConfigured
    ? buildAcademicSystemPrompt((await prisma.school.findUnique({ where: { userId } }))?.educationSystem)
    : null;

  for (const topic of topics) {
    let cards: { front: string; back: string }[] = [];

    if (system) {
      const prompt = `Subject: ${topic.subject.name}\nTopic: ${topic.name}\n\nWrite exactly 2 flashcards to help revise this topic — front is a short question, back is a concise correct answer. Respond with ONLY a JSON array like [{"front":"...","back":"..."}] — no other text.`;
      try {
        const raw = await getAIProvider().generate(prompt, { system });
        cards = parseFlashcardArray(raw);
      } catch {
        cards = [];
      }
    }

    if (cards.length === 0) {
      cards = [
        {
          front: `What are the key ideas of "${topic.name}" (${topic.subject.name})?`,
          back: `Review your notes on ${topic.name} — current progress is ${topic.progressPct}%. Focus on the parts you find hardest.`,
        },
      ];
    }

    for (const c of cards) {
      await prisma.flashcard.create({
        data: { userId, subjectId: topic.subjectId, topic: topic.name, front: c.front, back: c.back },
      });
    }
  }
  revalidatePath("/school/flashcards");
}
