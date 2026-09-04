"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { schedule, type ReviewResult } from "./srs";

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

/**
 * Deterministic "AI-generated" cards: turns low-progress topics into simple
 * recall prompts. This is a template-based stand-in for a real LLM call —
 * swap in lib/ai/provider.ts's generateFlashcards once an LLM key is set.
 */
export async function generateFlashcardsFromWeakTopics() {
  const userId = await requireUserId();
  const topics = await prisma.topic.findMany({
    where: { subject: { userId }, progressPct: { lt: 60 } },
    include: { subject: true },
    take: 5,
  });

  for (const topic of topics) {
    await prisma.flashcard.create({
      data: {
        userId,
        subjectId: topic.subjectId,
        topic: topic.name,
        front: `What are the key ideas of "${topic.name}" (${topic.subject.name})?`,
        back: `Review your notes on ${topic.name} — current progress is ${topic.progressPct}%. Focus on the parts you find hardest.`,
      },
    });
  }
  revalidatePath("/school/flashcards");
}
