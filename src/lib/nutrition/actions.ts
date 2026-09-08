"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function createMeal(formData: FormData) {
  const userId = await requireUserId();
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;

  const kcalRaw = formData.get("kcal");
  await prisma.meal.create({
    data: {
      userId,
      type: String(formData.get("type") ?? "SNACK"),
      description,
      kcal: kcalRaw ? Number(kcalRaw) : null,
    },
  });
  revalidatePath("/gym");
}

export async function deleteMeal(mealId: string) {
  const userId = await requireUserId();
  await prisma.meal.deleteMany({ where: { id: mealId, userId } });
  revalidatePath("/gym");
}
