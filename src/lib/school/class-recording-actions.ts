"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import { buildAcademicSystemPrompt } from "@/lib/ai/academic-prompt";
import { aiFailureMessage } from "@/lib/ai/api-key";
import { buildNotesPrompt, MAX_TRANSCRIPT_CHARS } from "./lesson-notes";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type ClassRecordingEntry = { id: string; transcript: string; summary: string | null; createdAt: Date };

/** A lesson recorded from the school AI, where there is no topic to file it under. */
export type LessonEntry = {
  id: string;
  title: string | null;
  subjectId: string | null;
  subjectName: string | null;
  transcript: string;
  notes: string | null;
  recordedSeconds: number | null;
  createdAt: Date;
};

/** How many past lessons the panel lists. */
const LESSON_LIST_LIMIT = 20;

const NO_AI_MESSAGE =
  "A real AI connection is needed to summarize or quiz on this — set ANTHROPIC_API_KEY (see Settings). The transcript itself is saved either way.";

async function loadTopic(topicId: string, userId: string) {
  return prisma.topic.findFirst({ where: { id: topicId, subject: { userId } }, include: { subject: true } });
}

async function academicSystemPromptFor(
  userId: string,
  subject?: { name: string; level?: string | null } | null
): Promise<string> {
  const school = await prisma.school.findUnique({ where: { userId } });
  return buildAcademicSystemPrompt(school?.educationSystem, subject);
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
    const system = await academicSystemPromptFor(userId, topic.subject);
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

  const system = await academicSystemPromptFor(userId, topic.subject);
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

  const system = await academicSystemPromptFor(userId, topic.subject);
  const qa = answers
    .map((a, i) => `Q${i + 1}: ${a.question}\nStudent's answer: ${a.answer.trim() || "(left blank)"}`)
    .join("\n\n");
  const prompt = `Subject: ${topic.subject.name}\nTopic: ${topic.name}\n\nClass transcript this quiz was based on:\n\n${transcript.trim()}\n\nStudent's quiz answers:\n\n${qa}\n\nFor each question, say briefly whether the answer is correct, partially correct, or incorrect based on what the transcript actually covered, with a one-line correction if needed. Then give one overall verdict: did the student understand what was explained in class.`;

  try {
    return await getAIProvider().generate(prompt, { system });
  } catch (err) {
    return aiFailureMessage(err);
  }
}

/**
 * Every lesson this student has recorded, newest first.
 *
 * Both routes in: recorded from the school AI while a lesson was happening,
 * or from a topic's own panel afterwards. They are the same thing and belong
 * in one list — filing is what the subject and topic fields are for.
 */
export async function getLessons(): Promise<LessonEntry[]> {
  const userId = await requireUserId();
  const rows = await prisma.classRecording.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: LESSON_LIST_LIMIT,
    include: { subject: { select: { id: true, name: true } }, topic: { select: { subject: true } } },
  });
  return rows.map((r) => {
    const subject = r.subject ?? r.topic?.subject ?? null;
    return {
      id: r.id,
      title: r.title,
      subjectId: subject?.id ?? null,
      subjectName: subject?.name ?? null,
      transcript: r.transcript,
      notes: r.summary,
      recordedSeconds: r.recordedSeconds,
      createdAt: r.createdAt,
    };
  });
}

export type SaveLessonResult = { lessons: LessonEntry[]; noted: boolean; problem: string | null };

/**
 * Saves what was heard, then makes notes from it.
 *
 * The transcript is written first and the notes are attached after, rather
 * than both at the end. A lesson is forty minutes of someone's attention, and
 * losing it because the AI call failed — no key, no network, a refusal — would
 * be the worst failure this feature could have. Notes are the useful part;
 * the recording is the irreplaceable part.
 */
export async function saveLesson(input: {
  transcript: string;
  subjectId?: string | null;
  title?: string | null;
  recordedSeconds?: number | null;
}): Promise<SaveLessonResult | { error: string }> {
  const userId = await requireUserId();
  const transcript = input.transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS);
  if (!transcript) return { error: "Nothing was recorded yet." };

  // Scoped to this account, so a subject id from elsewhere cannot be attached.
  const subject = input.subjectId
    ? await prisma.subject.findFirst({ where: { id: input.subjectId, userId }, select: { id: true, name: true } })
    : null;

  const recording = await prisma.classRecording.create({
    data: {
      userId,
      subjectId: subject?.id ?? null,
      title: input.title?.trim() || null,
      transcript,
      recordedSeconds: input.recordedSeconds ?? null,
    },
  });

  let notes: string | null = null;
  let problem: string | null = null;
  if (!isRealAIConfigured) {
    problem = NO_AI_MESSAGE;
  } else {
    try {
      const system = await academicSystemPromptFor(userId, subject ? { name: subject.name } : null);
      notes = await getAIProvider().generate(
        buildNotesPrompt({ transcript, subjectName: subject?.name ?? null, title: input.title ?? null }),
        // A lesson's notes run far past the default: an hour of teaching has a
        // lot in it, and notes cut off halfway are worse than short ones.
        { system, maxTokens: 4000 }
      );
      await prisma.classRecording.update({ where: { id: recording.id }, data: { summary: notes } });
    } catch (err) {
      problem = aiFailureMessage(err);
    }
  }

  revalidatePath("/school");
  return { lessons: await getLessons(), noted: Boolean(notes), problem };
}

/** Makes notes for a lesson that was saved without them. */
export async function makeNotesForLesson(recordingId: string): Promise<SaveLessonResult | { error: string }> {
  const userId = await requireUserId();
  const recording = await prisma.classRecording.findFirst({
    where: { id: recordingId, userId },
    include: { subject: { select: { name: true } }, topic: { select: { subject: { select: { name: true } } } } },
  });
  if (!recording) return { error: "That lesson is not there any more." };
  if (!isRealAIConfigured) return { lessons: await getLessons(), noted: false, problem: NO_AI_MESSAGE };

  const subjectName = recording.subject?.name ?? recording.topic?.subject.name ?? null;
  try {
    const system = await academicSystemPromptFor(userId, subjectName ? { name: subjectName } : null);
    const notes = await getAIProvider().generate(
      buildNotesPrompt({ transcript: recording.transcript, subjectName, title: recording.title }),
      { system, maxTokens: 4000 }
    );
    await prisma.classRecording.update({ where: { id: recording.id }, data: { summary: notes } });
    revalidatePath("/school");
    return { lessons: await getLessons(), noted: true, problem: null };
  } catch (err) {
    return { lessons: await getLessons(), noted: false, problem: aiFailureMessage(err) };
  }
}

export async function deleteLesson(recordingId: string): Promise<LessonEntry[]> {
  const userId = await requireUserId();
  // deleteMany scoped to the account: an id on its own is never enough.
  await prisma.classRecording.deleteMany({ where: { id: recordingId, userId } });
  revalidatePath("/school");
  return getLessons();
}
