"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { explainApproach, examChecklist, respondToMistake, type TopicContext } from "./learning-assistant";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

async function loadTopicContext(topicId: string, userId: string): Promise<{ ctx: TopicContext; subjectId: string } | null> {
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, subject: { userId } },
    include: { subject: true },
  });
  if (!topic) return null;

  const nearestExam = await prisma.exam.findFirst({
    where: { userId, subjectId: topic.subjectId, date: { gte: new Date() } },
    orderBy: { date: "asc" },
  });

  const daysUntilExam = nearestExam
    ? Math.max(0, Math.round((nearestExam.date.getTime() - Date.now()) / 86400000))
    : null;

  return {
    subjectId: topic.subjectId,
    ctx: {
      topicName: topic.name,
      subjectName: topic.subject.name,
      progressPct: topic.progressPct,
      priority: topic.priority,
      examRelevance: topic.examRelevance,
      weaknessNote: topic.weaknessNote,
      daysUntilExam,
    },
  };
}

export async function askExplainTopic(topicId: string): Promise<string> {
  const userId = await requireUserId();
  const loaded = await loadTopicContext(topicId, userId);
  if (!loaded) return "Topic not found.";
  return explainApproach(loaded.ctx);
}

export async function askExamChecklist(topicId: string): Promise<string> {
  const userId = await requireUserId();
  const loaded = await loadTopicContext(topicId, userId);
  if (!loaded) return "Topic not found.";
  return examChecklist(loaded.ctx);
}

export async function submitMistake(topicId: string, mistakeText: string): Promise<string> {
  const userId = await requireUserId();
  const loaded = await loadTopicContext(topicId, userId);
  if (!loaded) return "Topic not found.";
  if (!mistakeText.trim()) return "Describe what went wrong first.";

  const response = respondToMistake(loaded.ctx, mistakeText.trim());

  await prisma.topic.update({
    where: { id: topicId },
    data: {
      weaknessNote: mistakeText.trim(),
      progressPct: Math.max(0, loaded.ctx.progressPct - 5),
    },
  });

  revalidatePath(`/school/subjects/${loaded.subjectId}`);
  return response;
}

export async function getSubjectWeaknesses(subjectId: string): Promise<string> {
  const userId = await requireUserId();
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    include: { topics: true },
  });
  if (!subject) return "Subject not found.";

  const weak = [...subject.topics].sort((a, b) => a.progressPct - b.progressPct).filter((t) => t.progressPct < 70);
  if (weak.length === 0) {
    return `No topic in ${subject.name} is below 70% right now — solid across the board.`;
  }

  const lines = [`Your weakest topics in ${subject.name}:`, ""];
  for (const t of weak.slice(0, 5)) {
    lines.push(`• ${t.name} — ${t.progressPct}% (${t.examRelevance.toLowerCase()} exam relevance)${t.weaknessNote ? ` — noted: "${t.weaknessNote}"` : ""}`);
  }
  return lines.join("\n");
}
