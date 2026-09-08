"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function createSchoolHabit(formData: FormData) {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const emoji = String(formData.get("emoji") ?? "").trim() || null;

  const order = await prisma.schoolHabit.count({ where: { userId } });
  await prisma.schoolHabit.create({ data: { userId, name, emoji, order } });

  revalidatePath("/school/habits");
  revalidatePath("/school");
}

export async function deleteSchoolHabit(habitId: string) {
  const userId = await requireUserId();
  await prisma.schoolHabit.deleteMany({ where: { id: habitId, userId } });
  revalidatePath("/school/habits");
  revalidatePath("/school");
}

export async function toggleSchoolHabitLog(habitId: string, dateKey: string) {
  const userId = await requireUserId();
  const habit = await prisma.schoolHabit.findFirst({ where: { id: habitId, userId } });
  if (!habit) return;

  const date = new Date(`${dateKey}T00:00:00`);
  const existing = await prisma.schoolHabitLog.findUnique({ where: { habitId_date: { habitId, date } } });
  if (existing) {
    await prisma.schoolHabitLog.delete({ where: { id: existing.id } });
  } else {
    await prisma.schoolHabitLog.create({ data: { habitId, date } });
  }

  revalidatePath("/school/habits");
  revalidatePath("/school");
}
