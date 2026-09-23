"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { generateCoachReply } from "./chat-engine";
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
export async function sendCoachMessageLive(content: string): Promise<CoachMessage[]> {
  const userId = await requireUserId();
  const trimmed = content.trim();
  if (!trimmed) return getCoachMessages();

  await prisma.chatMessage.create({ data: { userId, role: "USER", content: trimmed } });
  const reply = await generateCoachReply(userId, trimmed);
  await prisma.chatMessage.create({ data: { userId, role: "ASSISTANT", content: reply } });

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
