"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function createGoal(formData: FormData) {
  const userId = await requireUserId();
  const title = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "GENERAL");
  const path = String(formData.get("redirectPath") ?? "/");
  if (!title) return;

  await prisma.goal.create({ data: { userId, title, category } });
  revalidatePath(path);
}

export async function updateGoalProgress(goalId: string, progressPct: number, path: string) {
  const userId = await requireUserId();
  await prisma.goal.updateMany({ where: { id: goalId, userId }, data: { progressPct } });
  revalidatePath(path);
}

export async function deleteGoal(goalId: string, path: string) {
  const userId = await requireUserId();
  await prisma.goal.deleteMany({ where: { id: goalId, userId } });
  revalidatePath(path);
}
