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

export type TutorMessageEntry = { id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: Date };

// How many past turns to replay as context — enough for a real conversation
// to build on itself without the prompt growing unbounded.
const HISTORY_TURNS = 16;

const TUTOR_STYLE_PROMPT = [
  "You are having a live, back-and-forth conversation with the student — like a private tutor sitting next to them, not a one-shot Q&A bot. Respond directly to what they just said, refer back to earlier parts of the conversation when relevant, and ask a short follow-up question yourself when it would help you gauge what to explain next.",
  "When a simple diagram would genuinely make something clearer — a labeled shape, a graph, a cell/circuit/process diagram, a number line — include exactly one in your reply as a fenced code block starting with ```svg and ending with ```. Keep it simple: a `viewBox=\"0 0 320 220\"`, basic shapes only (rect, circle, ellipse, line, polyline, polygon, path, text), clear <text> labels, no more than ~40 elements, no external references, no scripts. Only include one when it truly helps — most replies won't need one.",
  "This chat has no LaTeX/MathJax renderer — never use $, $$, \\( \\), or other LaTeX math delimiters; they'd show up as literal text. Write formulas and equations in plain text instead, e.g. \"a^2 + b^2 = c^2\" or using real Unicode symbols (², √, ×, ÷, ≤, π) where natural.",
  "Keep replies focused and conversational, not a wall of text — this is a dialogue.",
].join("\n");

const NO_REAL_AI_MESSAGE =
  "A real back-and-forth tutor conversation needs a connected AI — set ANTHROPIC_API_KEY in Settings to turn this on. Until then, the Explain / Exam checklist buttons above still work off your own stored progress data.";

async function loadTopicAndHistory(topicId: string, userId: string) {
  const topic = await prisma.topic.findFirst({ where: { id: topicId, subject: { userId } }, include: { subject: true } });
  if (!topic) return null;
  const messages = await prisma.tutorMessage.findMany({
    where: { topicId, userId },
    orderBy: { createdAt: "asc" },
  });
  return { topic, messages };
}

export async function getTutorMessages(topicId: string): Promise<TutorMessageEntry[]> {
  const userId = await requireUserId();
  const messages = await prisma.tutorMessage.findMany({
    where: { topicId, userId },
    orderBy: { createdAt: "asc" },
  });
  return messages.map((m) => ({ id: m.id, role: m.role as "USER" | "ASSISTANT", content: m.content, createdAt: m.createdAt }));
}

export async function sendTutorMessage(topicId: string, message: string): Promise<TutorMessageEntry[]> {
  const userId = await requireUserId();
  const trimmed = message.trim();
  if (!trimmed) return getTutorMessages(topicId);

  const loaded = await loadTopicAndHistory(topicId, userId);
  if (!loaded) return [];
  const { topic, messages } = loaded;

  await prisma.tutorMessage.create({ data: { userId, topicId, role: "USER", content: trimmed } });

  let reply: string;
  if (!isRealAIConfigured) {
    reply = NO_REAL_AI_MESSAGE;
  } else {
    const school = await prisma.school.findUnique({ where: { userId } });
    const system = `${buildAcademicSystemPrompt(school?.educationSystem)}\n\n${TUTOR_STYLE_PROMPT}`;

    const history = messages
      .slice(-HISTORY_TURNS)
      .map((m) => `${m.role === "USER" ? "Student" : "Tutor"}: ${m.content}`)
      .join("\n\n");

    const prompt = [
      `Subject: ${topic.subject.name}`,
      `Topic: ${topic.name}`,
      `Student's current self-rated progress on this topic: ${topic.progressPct}%`,
      history ? `\nConversation so far:\n${history}` : "",
      `\nStudent: ${trimmed}`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      reply = await getAIProvider().generate(prompt, { system, maxTokens: 1500 });
    } catch (err) {
      reply = `Couldn't reach the AI service right now (${err instanceof Error ? err.message : "unknown error"}) — try again in a moment.`;
    }
  }

  await prisma.tutorMessage.create({ data: { userId, topicId, role: "ASSISTANT", content: reply } });
  revalidatePath(`/school/subjects/${topic.subjectId}`);
  return getTutorMessages(topicId);
}

/** Seeds the chat with a canned opening line, as if the student typed it — used by the quick-start buttons. */
export async function startTutorTopic(topicId: string, kind: "explain" | "exam"): Promise<TutorMessageEntry[]> {
  const opener =
    kind === "explain"
      ? "Can you explain this topic to me, step by step, the way you'd introduce it to someone learning it for the first time?"
      : "What do I specifically need to know about this topic for the exam?";
  return sendTutorMessage(topicId, opener);
}

export async function clearTutorChat(topicId: string): Promise<TutorMessageEntry[]> {
  const userId = await requireUserId();
  await prisma.tutorMessage.deleteMany({ where: { topicId, userId } });
  return [];
}
