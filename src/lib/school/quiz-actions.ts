"use server";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import { buildAcademicSystemPrompt } from "@/lib/ai/academic-prompt";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

const NO_AI_QUIZ_MESSAGE =
  "A real AI connection is needed to generate a genuine quiz — set ANTHROPIC_API_KEY (see Settings). This app never invents fake quiz questions or answers without one.";

async function loadTopicAndLog(topicId: string, userId: string) {
  const topic = await prisma.topic.findFirst({ where: { id: topicId, subject: { userId } }, include: { subject: true } });
  if (!topic) return null;
  const log = await prisma.learningLogEntry.findMany({ where: { topicId, userId } });
  return { topic, log };
}

async function academicSystemPromptFor(userId: string): Promise<string> {
  const school = await prisma.school.findUnique({ where: { userId } });
  return buildAcademicSystemPrompt(school?.educationSystem);
}

function parseQuestionArray(raw: string): string[] {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const arr = JSON.parse(jsonMatch[0]);
      if (Array.isArray(arr)) {
        const questions = arr.filter((q): q is string => typeof q === "string" && q.trim().length > 0);
        if (questions.length) return questions;
      }
    } catch {
      // fall through to the line-based fallback below
    }
  }
  return raw
    .split("\n")
    .map((l) => l.replace(/^[\d.\-*\s]+/, "").trim())
    .filter(Boolean);
}

export async function generateTopicQuiz(topicId: string): Promise<{ questions: string[] } | { error: string }> {
  const userId = await requireUserId();
  const loaded = await loadTopicAndLog(topicId, userId);
  if (!loaded) return { error: "Topic not found." };
  if (!isRealAIConfigured) return { error: NO_AI_QUIZ_MESSAGE };

  const { topic, log } = loaded;
  const understood = log.filter((l) => l.type === "UNDERSTOOD").map((l) => l.content);
  const confused = log.filter((l) => l.type === "CONFUSED").map((l) => l.content);
  const questions = log.filter((l) => l.type === "QUESTION").map((l) => l.content);

  const system = await academicSystemPromptFor(userId);
  const prompt = [
    `Subject: ${topic.subject.name}`,
    `Topic: ${topic.name}`,
    understood.length ? `Student says they understand: ${understood.join("; ")}` : "",
    confused.length ? `Student says they're confused about: ${confused.join("; ")}` : "",
    questions.length ? `Student's open questions: ${questions.join("; ")}` : "",
    "",
    "Write exactly 4 short quiz questions to genuinely check whether the student understands this topic, weighted towards anything they said they're confused about or asked about. Respond with ONLY a JSON array of 4 question strings — no answers, no other text.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await getAIProvider().generate(prompt, { system });
    const parsed = parseQuestionArray(raw).slice(0, 4);
    if (!parsed.length) return { error: "Couldn't parse a quiz from the AI's response — try again." };
    return { questions: parsed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't reach the AI service." };
  }
}

export async function gradeTopicQuiz(topicId: string, answers: { question: string; answer: string }[]): Promise<string> {
  const userId = await requireUserId();
  const loaded = await loadTopicAndLog(topicId, userId);
  if (!loaded) return "Topic not found.";
  if (!isRealAIConfigured) return NO_AI_QUIZ_MESSAGE;

  const { topic } = loaded;
  const system = await academicSystemPromptFor(userId);
  const qa = answers
    .map((a, i) => `Q${i + 1}: ${a.question}\nStudent's answer: ${a.answer.trim() || "(left blank)"}`)
    .join("\n\n");
  const prompt = [
    `Subject: ${topic.subject.name}`,
    `Topic: ${topic.name}`,
    "",
    "Here are the quiz questions and the student's answers:",
    qa,
    "",
    "For each question, say briefly whether the answer is correct, partially correct, or incorrect, with a one-line correction if it's wrong or incomplete. Then give one overall verdict: does the student genuinely understand this topic yet, and what should they do next.",
  ].join("\n");

  try {
    return await getAIProvider().generate(prompt, { system });
  } catch (err) {
    return `Couldn't reach the AI service right now (${err instanceof Error ? err.message : "unknown error"}) — try again in a moment.`;
  }
}
