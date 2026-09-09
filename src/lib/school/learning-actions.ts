"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { explainApproach, examChecklist, respondToMistake, type TopicContext } from "./learning-assistant";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import { buildAcademicSystemPrompt } from "@/lib/ai/academic-prompt";

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

async function academicSystemPromptFor(userId: string): Promise<string> {
  const school = await prisma.school.findUnique({ where: { userId } });
  return buildAcademicSystemPrompt(school?.educationSystem);
}

const NO_REAL_AI_MESSAGE =
  "I can't give a genuine subject-matter answer without a connected AI — set ANTHROPIC_API_KEY (see Settings) to get real IGCSE/A-Level-level tutoring here. Until then, try the buttons above, which reason honestly over your own progress data instead.";

export async function askExplainTopic(topicId: string): Promise<string> {
  const userId = await requireUserId();
  const loaded = await loadTopicContext(topicId, userId);
  if (!loaded) return "Topic not found.";

  if (!isRealAIConfigured) return explainApproach(loaded.ctx);

  const system = await academicSystemPromptFor(userId);
  const prompt = `Subject: ${loaded.ctx.subjectName}\nTopic: ${loaded.ctx.topicName}\nStudent's current self-rated progress: ${loaded.ctx.progressPct}%\n\nExplain this topic's core approach the way a good teacher would introduce it, then give one worked-style example.`;
  try {
    return await getAIProvider().generate(prompt, { system });
  } catch (err) {
    return `${explainApproach(loaded.ctx)}\n\n(Real AI call failed: ${err instanceof Error ? err.message : "unknown error"} — showing the rule-based response instead.)`;
  }
}

export async function askExamChecklist(topicId: string): Promise<string> {
  const userId = await requireUserId();
  const loaded = await loadTopicContext(topicId, userId);
  if (!loaded) return "Topic not found.";
  return examChecklist(loaded.ctx);
}

export async function askTopicQuestion(topicId: string, question: string): Promise<string> {
  const userId = await requireUserId();
  const loaded = await loadTopicContext(topicId, userId);
  if (!loaded) return "Topic not found.";
  if (!question.trim()) return "Type a question first.";

  if (!isRealAIConfigured) return NO_REAL_AI_MESSAGE;

  const system = await academicSystemPromptFor(userId);
  const prompt = `Subject: ${loaded.ctx.subjectName}\nTopic: ${loaded.ctx.topicName}\nStudent's current self-rated progress on this topic: ${loaded.ctx.progressPct}%\n\nStudent's question:\n${question.trim()}`;
  try {
    return await getAIProvider().generate(prompt, { system });
  } catch (err) {
    return `Couldn't reach the AI service right now (${err instanceof Error ? err.message : "unknown error"}) — try again in a moment.`;
  }
}

export async function submitMistake(topicId: string, mistakeText: string): Promise<string> {
  const userId = await requireUserId();
  const loaded = await loadTopicContext(topicId, userId);
  if (!loaded) return "Topic not found.";
  if (!mistakeText.trim()) return "Describe what went wrong first.";

  let response: string;
  if (isRealAIConfigured) {
    const system = await academicSystemPromptFor(userId);
    const prompt = `Subject: ${loaded.ctx.subjectName}\nTopic: ${loaded.ctx.topicName}\n\nThe student describes what went wrong like this: "${mistakeText.trim()}"\n\nDiagnose the likely underlying mistake and explain, at the right level, exactly what to do differently next time.`;
    try {
      response = await getAIProvider().generate(prompt, { system });
    } catch (err) {
      response = `${respondToMistake(loaded.ctx, mistakeText.trim())}\n\n(Real AI call failed: ${err instanceof Error ? err.message : "unknown error"} — showing the rule-based response instead.)`;
    }
  } else {
    response = respondToMistake(loaded.ctx, mistakeText.trim());
  }

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
