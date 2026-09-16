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

/**
 * Turns the questions you marked "I didn't get this" in the tutor chat into
 * flashcards — the same entries the subject quiz reads, so what you struggled
 * with in a conversation becomes something you actually drill.
 *
 * Needs a real AI: the whole point is a correct answer to a question you
 * couldn't answer yourself, and a template card saying "check your notes"
 * would be worse than nothing here. Without one it says so and creates
 * nothing. A question that already has a card is skipped rather than
 * duplicated.
 */
export async function generateFlashcardsFromConfusions(): Promise<{ created: number; message: string }> {
  const userId = await requireUserId();

  const confusions = await prisma.learningLogEntry.findMany({
    where: { userId, type: "CONFUSED" },
    include: { topic: { include: { subject: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (confusions.length === 0) {
    return {
      created: 0,
      message:
        "Nothing marked as not understood yet. In a topic's AI Tutor chat, use \u201cI didn\u2019t get this\u201d on a reply and it lands here.",
    };
  }
  if (!isRealAIConfigured) {
    return {
      created: 0,
      message:
        "Turning a question you couldn\u2019t answer into a flashcard needs a real AI \u2014 set ANTHROPIC_API_KEY (see Settings). No cards were made up in the meantime.",
    };
  }

  const system = buildAcademicSystemPrompt((await prisma.school.findUnique({ where: { userId } }))?.educationSystem);
  let created = 0;
  let failed = 0;

  for (const entry of confusions) {
    const existing = await prisma.flashcard.findFirst({ where: { userId, sourceLogEntryId: entry.id } });
    if (existing) continue;

    const prompt = `Subject: ${entry.topic.subject.name}\nTopic: ${entry.topic.name}\n\nThe student asked this and did not understand the explanation:\n"${entry.content}"\n\nWrite exactly 1 flashcard that drills the thing they were missing — front is a short, answerable question, back is a concise correct answer. Respond with ONLY a JSON array like [{"front":"...","back":"..."}] — no other text.`;

    let cards: { front: string; back: string }[] = [];
    try {
      cards = parseFlashcardArray(await getAIProvider().generate(prompt, { system }));
    } catch {
      cards = [];
    }
    if (cards.length === 0) {
      failed++;
      continue;
    }

    await prisma.flashcard.create({
      data: {
        userId,
        subjectId: entry.topic.subjectId,
        topic: entry.topic.name,
        front: cards[0].front,
        back: cards[0].back,
        sourceLogEntryId: entry.id,
      },
    });
    created++;
  }

  revalidatePath("/school/flashcards");
  if (created === 0) {
    // "Nothing new" and "every generation failed" look identical from the
    // outside, and reporting an outage as success is the worse of the two.
    if (failed > 0) {
      return {
        created: 0,
        message: `Couldn\u2019t generate any cards \u2014 the AI call failed for all ${failed}. Nothing was made up; try again in a moment.`,
      };
    }
    return { created: 0, message: "No new cards \u2014 everything you\u2019ve marked already has one." };
  }
  return {
    created,
    message:
      `Made ${created} card${created === 1 ? "" : "s"} from what you didn\u2019t understand.` +
      (failed > 0 ? ` ${failed} couldn\u2019t be generated and were skipped rather than filled in with a guess.` : ""),
  };
}
