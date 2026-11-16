"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { generateCoachReply } from "./chat-engine";
import { MAX_EDIT_CHARS } from "./chat-limits";
import { runWeeklyBalanceCheck, acceptRecommendation, declineRecommendation } from "./balance-engine";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type CoachMessage = { id: string; role: "USER" | "ASSISTANT"; content: string; createdAt: Date };

export async function getCoachMessages(): Promise<CoachMessage[]> {
  const userId = await requireUserId();
  // Newest first, then reversed. `orderBy: asc` with a `take` returns the
  // OLDEST 100, so past that the chat stops showing anything new — the replies
  // are written, they just never reach the screen.
  const messages = (
    await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    })
  ).reverse();
  return messages.map((m) => ({
    id: m.id,
    role: m.role as "USER" | "ASSISTANT",
    content: m.content,
    createdAt: m.createdAt,
  }));
}

/**
 * Same conversation as the form-posted chat, but returns the thread instead of
 * relying on a page revalidation — a spoken turn has to land without the page
 * navigating out from under the microphone.
 */
export async function sendCoachMessageLive(content: string, spoken = false): Promise<CoachMessage[]> {
  const userId = await requireUserId();
  const trimmed = content.trim();
  if (!trimmed) return getCoachMessages();

  await prisma.chatMessage.create({ data: { userId, role: "USER", content: trimmed } });
  const reply = await generateCoachReply(userId, trimmed, spoken);
  await prisma.chatMessage.create({ data: { userId, role: "ASSISTANT", content: reply } });

  revalidatePath("/coach");
  return getCoachMessages();
}

/**
 * Fixes something you have already sent, and asks it again.
 *
 * Everything after it goes. That is not tidiness: the reply below was a
 * reply to the old wording, and the turns after it were a conversation
 * about that reply. Left in place they would be read back as though they
 * followed from the new message.
 *
 * Your own messages only. An edited reply would be this app putting words
 * in the coach's mouth and then reading them back to it as its own.
 */
export async function editCoachMessage(messageId: string, content: string): Promise<CoachMessage[]> {
  const userId = await requireUserId();

  // Only your own: an id on its own is never enough to write to a row.
  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, userId },
    select: { id: true, role: true, createdAt: true },
  });
  if (!message || message.role !== "USER") return getCoachMessages();

  const trimmed = content.trim().slice(0, MAX_EDIT_CHARS);
  if (!trimmed) return getCoachMessages();

  await prisma.chatMessage.updateMany({ where: { id: message.id, userId }, data: { content: trimmed } });
  await prisma.chatMessage.deleteMany({
    where: {
      userId,
      OR: [
        { createdAt: { gt: message.createdAt } },
        // Same millisecond: the id breaks the tie the way the list does.
        { createdAt: message.createdAt, id: { gt: message.id } },
      ],
    },
  });

  const reply = await generateCoachReply(userId, trimmed);
  await prisma.chatMessage.create({ data: { userId, role: "ASSISTANT", content: reply } });

  revalidatePath("/coach");
  return getCoachMessages();
}

/**
 * Takes one message out of the conversation.
 *
 * Same rule as the school AI: a message you sent goes with the replies that
 * followed it, because a reply to something that is no longer there is
 * nonsense on screen and worse in the history the coach is given back; a
 * reply goes on its own, so a bad answer can be removed without losing what
 * was asked. Anything after the next message you sent is untouched.
 */
export async function deleteCoachMessage(messageId: string): Promise<CoachMessage[]> {
  const userId = await requireUserId();

  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, userId },
    select: { id: true, role: true, createdAt: true },
  });
  if (!message) return getCoachMessages();

  const doomed = [message.id];
  if (message.role === "USER") {
    const after = await prisma.chatMessage.findMany({
      where: {
        userId,
        OR: [
          { createdAt: { gt: message.createdAt } },
          { createdAt: message.createdAt, id: { gt: message.id } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, role: true },
    });
    for (const row of after) {
      if (row.role === "USER") break;
      doomed.push(row.id);
    }
  }

  await prisma.chatMessage.deleteMany({ where: { userId, id: { in: doomed } } });
  revalidatePath("/coach");
  return getCoachMessages();
}

export async function clearCoachChat(): Promise<CoachMessage[]> {
  const userId = await requireUserId();
  await prisma.chatMessage.deleteMany({ where: { userId } });
  revalidatePath("/coach");
  return [];
}

export async function triggerWeeklyOptimization() {
  const userId = await requireUserId();
  await runWeeklyBalanceCheck(userId);
  revalidatePath("/coach");
}

export async function respondToRecommendation(id: string, action: "ACCEPTED" | "DECLINED") {
  const userId = await requireUserId();
  if (action === "ACCEPTED") await acceptRecommendation(id, userId);
  else await declineRecommendation(id, userId);
  revalidatePath("/coach");
}
