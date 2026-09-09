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
  "A real AI connection is needed to generate a genuine exam quiz — set ANTHROPIC_API_KEY (see Settings). This app never invents fake quiz questions or answers without one.";

async function loadSubjectForQuiz(subjectId: string, userId: string) {
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, userId },
    include: { topics: true },
  });
  if (!subject) return null;

  const log = await prisma.learningLogEntry.findMany({
    where: { userId, topic: { subjectId } },
    include: { topic: true },
  });

  return { subject, log };
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

export async function generateSubjectQuiz(subjectId: string): Promise<{ questions: string[] } | { error: string }> {
  const userId = await requireUserId();
  const loaded = await loadSubjectForQuiz(subjectId, userId);
  if (!loaded) return { error: "Subject not found." };
  if (!isRealAIConfigured) return { error: NO_AI_QUIZ_MESSAGE };

  const { subject, log } = loaded;
  if (subject.topics.length === 0) return { error: "Add some topics to this subject first, so the quiz has something to cover." };

  const weakTopics = [...subject.topics].sort((a, b) => a.progressPct - b.progressPct).slice(0, 5);
  const confused = log.filter((l) => l.type === "CONFUSED").map((l) => `${l.topic.name}: ${l.content}`);
  const questions = log.filter((l) => l.type === "QUESTION").map((l) => `${l.topic.name}: ${l.content}`);

  const system = await academicSystemPromptFor(userId);
  const prompt = [
    `Subject: ${subject.name}`,
    `Topics covered: ${subject.topics.map((t) => `${t.name} (${t.progressPct}% progress)`).join(", ")}`,
    weakTopics.length ? `Weakest topics right now: ${weakTopics.map((t) => t.name).join(", ")}` : "",
    confused.length ? `Student says they're confused about: ${confused.join("; ")}` : "",
    questions.length ? `Student's open questions: ${questions.join("; ")}` : "",
    "",
    "Write exactly 6 exam-style quiz questions spanning multiple topics in this subject, weighted towards the weakest topics and anything the student said they're confused about or asked about. Respond with ONLY a JSON array of 6 question strings — no answers, no other text.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await getAIProvider().generate(prompt, { system });
    const parsed = parseQuestionArray(raw).slice(0, 6);
    if (!parsed.length) return { error: "Couldn't parse a quiz from the AI's response — try again." };
    return { questions: parsed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't reach the AI service." };
  }
}

export async function gradeSubjectQuiz(subjectId: string, answers: { question: string; answer: string }[]): Promise<string> {
  const userId = await requireUserId();
  const loaded = await loadSubjectForQuiz(subjectId, userId);
  if (!loaded) return "Subject not found.";
  if (!isRealAIConfigured) return NO_AI_QUIZ_MESSAGE;

  const { subject } = loaded;
  const system = await academicSystemPromptFor(userId);
  const qa = answers
    .map((a, i) => `Q${i + 1}: ${a.question}\nStudent's answer: ${a.answer.trim() || "(left blank)"}`)
    .join("\n\n");
  const prompt = [
    `Subject: ${subject.name}`,
    "",
    "Here are the exam quiz questions and the student's answers:",
    qa,
    "",
    "For each question, say briefly whether the answer is correct, partially correct, or incorrect, with a one-line correction if it's wrong or incomplete. Then give one overall verdict: is the student exam-ready on this subject yet, and which topics need the most work before the exam.",
  ].join("\n");

  try {
    return await getAIProvider().generate(prompt, { system });
  } catch (err) {
    return `Couldn't reach the AI service right now (${err instanceof Error ? err.message : "unknown error"}) — try again in a moment.`;
  }
}
