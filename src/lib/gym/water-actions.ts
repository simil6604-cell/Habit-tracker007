"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/require-user";
import { prisma } from "@/lib/db/prisma";
import { startOfDay, endOfDay } from "date-fns";

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
