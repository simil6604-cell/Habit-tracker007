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

export async function sendChatMessage(formData: FormData) {
  const userId = await requireUserId();
  const content = String(formData.get("message") ?? "").trim();
  if (!content) return;

  await prisma.chatMessage.create({ data: { userId, role: "USER", content } });
  const reply = await generateCoachReply(userId, content);
  await prisma.chatMessage.create({ data: { userId, role: "ASSISTANT", content: reply } });

  revalidatePath("/coach");
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
