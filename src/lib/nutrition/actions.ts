"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { saveUploadedImage, deleteUploadedImage } from "@/lib/uploads/save-image";

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
  const photo = formData.get("photo") as File | null;
  const imagePath = photo && photo.size > 0 ? await saveUploadedImage(photo, userId) : null;

  await prisma.meal.create({
    data: {
      userId,
      type: String(formData.get("type") ?? "SNACK"),
      description,
      kcal: kcalRaw ? Number(kcalRaw) : null,
      imagePath,
    },
  });
  revalidatePath("/gym");
}

export async function deleteMeal(mealId: string) {
  const userId = await requireUserId();
  const meal = await prisma.meal.findFirst({ where: { id: mealId, userId } });
  if (!meal) return;

  await prisma.meal.delete({ where: { id: meal.id } });
  await deleteUploadedImage(meal.imagePath);
  revalidatePath("/gym");
}
