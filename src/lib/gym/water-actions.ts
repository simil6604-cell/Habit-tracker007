"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { startOfDay, endOfDay } from "date-fns";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function logWater(amountMl: number) {
  const userId = await requireUserId();
  if (!amountMl || amountMl <= 0) return;
  await prisma.waterLog.create({ data: { userId, amountMl } });
  revalidatePath("/gym");
}

export async function undoLastWater() {
  const userId = await requireUserId();
  const start = startOfDay(new Date());
  const end = endOfDay(new Date());
  const last = await prisma.waterLog.findFirst({
    where: { userId, loggedAt: { gte: start, lte: end } },
    orderBy: { loggedAt: "desc" },
  });
  if (last) await prisma.waterLog.delete({ where: { id: last.id } });
  revalidatePath("/gym");
}
