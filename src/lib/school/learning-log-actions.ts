"use server";

import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type LogEntryType = "UNDERSTOOD" | "CONFUSED" | "QUESTION";
export type LogEntry = { id: string; type: LogEntryType; content: string; createdAt: Date };

export async function getLearningLog(topicId: string): Promise<LogEntry[]> {
  const userId = await requireUserId();
  const entries = await prisma.learningLogEntry.findMany({
    where: { topicId, userId },
    orderBy: { createdAt: "asc" },
  });
  return entries.map((e) => ({ id: e.id, type: e.type as LogEntryType, content: e.content, createdAt: e.createdAt }));
}

export async function addLearningLogEntry(topicId: string, type: LogEntryType, content: string): Promise<LogEntry[]> {
  const userId = await requireUserId();
  const trimmed = content.trim();
  if (trimmed) {
    const topic = await prisma.topic.findFirst({ where: { id: topicId, subject: { userId } } });
    if (topic) {
      await prisma.learningLogEntry.create({ data: { userId, topicId, type, content: trimmed } });
    }
  }
  return getLearningLog(topicId);
}

export async function deleteLearningLogEntry(topicId: string, entryId: string): Promise<LogEntry[]> {
  const userId = await requireUserId();
  await prisma.learningLogEntry.deleteMany({ where: { id: entryId, userId } });
  return getLearningLog(topicId);
}
