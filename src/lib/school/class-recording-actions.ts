"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import { buildAcademicSystemPrompt } from "@/lib/ai/academic-prompt";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type ClassRecordingEntry = { id: string; transcript: string; summary: string | null; createdAt: Date };

const NO_AI_MESSAGE =
  "A real AI connection is needed to summarize or quiz on this — set ANTHROPIC_API_KEY (see Settings). The transcript itself is saved either way.";

async function loadTopic(topicId: string, userId: string) {
  return prisma.topic.findFirst({ where: { id: topicId, subject: { userId } }, include: { subject: true } });
}

async function academicSystemPromptFor(userId: string): Promise<string> {
  const school = await prisma.school.findUnique({ where: { userId } });
  return buildAcademicSystemPrompt(school?.educationSystem);
}

export async function getClassRecordings(topicId: string): Promise<ClassRecordingEntry[]> {
  const userId = await requireUserId();
  const recordings = await prisma.classRecording.findMany({ where: { topicId, userId }, orderBy: { createdAt: "desc" } });
  return recordings.map((r) => ({ id: r.id, transcript: r.transcript, summary: r.summary, createdAt: r.createdAt }));
}

export async function saveClassRecording(topicId: string, transcript: string): Promise<ClassRecordingEntry[] | { error: string }> {
  const userId = await requireUserId();
  const topic = await loadTopic(topicId, userId);
  if (!topic) return { error: "Topic not found." };
  const trimmed = transcript.trim();
  if (!trimmed) return { error: "Nothing was captured yet — record or type something first." };

  let summary: string | null = null;
  if (isRealAIConfigured) {
    const system = await academicSystemPromptFor(userId);
    const prompt = `Subject: ${topic.subject.name}\nTopic: ${topic.name}\n\nHere is a transcript captured live during class (from speech-to-text, so it may contain recognition errors):\n\n${trimmed}\n\nSummarize what the teacher covered into clear, organized key points for revision. Note plainly if any part looks garbled by transcription rather than guessing what was meant.`;
    try {
      summary = await getAIProvider().generate(prompt, { system });
    } catch {
      summary = null;
    }
  }

  await prisma.classRecording.create({ data: { userId, topicId, transcript: trimmed, summary } });
  revalidatePath(`/school/subjects/${topic.subjectId}`);
  return getClassRecordings(topicId);
}

export async function deleteClassRecording(topicId: string, recordingId: string): Promise<ClassRecordingEntry[]> {
  const userId = await requireUserId();
  await prisma.classRecording.deleteMany({ where: { id: recordingId, userId } });
  return getClassRecordings(topicId);
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

export async function generateClassQuiz(topicId: string, transcript: string): Promise<{ questions: string[] } | { error: string }> {
  const userId = await requireUserId();
  const topic = await loadTopic(topicId, userId);
  if (!topic) return { error: "Topic not found." };
  if (!transcript.trim()) return { error: "Nothing was captured yet — record or type something first." };
  if (!isRealAIConfigured) return { error: NO_AI_MESSAGE };

  const system = await academicSystemPromptFor(userId);
  const prompt = `Subject: ${topic.subject.name}\nTopic: ${topic.name}\n\nHere is a transcript captured live during class:\n\n${transcript.trim()}\n\nWrite exactly 4 short quiz questions based ONLY on what's actually covered in this transcript, to check whether the student understood what the teacher explained. Respond with ONLY a JSON array of 4 question strings — no answers, no other text.`;

  try {
    const raw = await getAIProvider().generate(prompt, { system });
    const parsed = parseQuestionArray(raw).slice(0, 4);
    if (!parsed.length) return { error: "Couldn't parse a quiz from the AI's response — try again." };
    return { questions: parsed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't reach the AI service." };
  }
}

export async function gradeClassQuiz(
  topicId: string,
  transcript: string,
  answers: { question: string; answer: string }[]
): Promise<string> {
  const userId = await requireUserId();
  const topic = await loadTopic(topicId, userId);
  if (!topic) return "Topic not found.";
  if (!isRealAIConfigured) return NO_AI_MESSAGE;

  const system = await academicSystemPromptFor(userId);
  const qa = answers
    .map((a, i) => `Q${i + 1}: ${a.question}\nStudent's answer: ${a.answer.trim() || "(left blank)"}`)
    .join("\n\n");
  const prompt = `Subject: ${topic.subject.name}\nTopic: ${topic.name}\n\nClass transcript this quiz was based on:\n\n${transcript.trim()}\n\nStudent's quiz answers:\n\n${qa}\n\nFor each question, say briefly whether the answer is correct, partially correct, or incorrect based on what the transcript actually covered, with a one-line correction if needed. Then give one overall verdict: did the student understand what was explained in class.`;

  try {
    return await getAIProvider().generate(prompt, { system });
  } catch (err) {
    return `Couldn't reach the AI service right now (${err instanceof Error ? err.message : "unknown error"}) — try again in a moment.`;
  }
}
