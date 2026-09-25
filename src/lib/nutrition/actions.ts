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

export type MealFormState = { error?: string } | undefined;

/**
 * Logs a meal, and says so when the photo didn't make it.
 *
 * The photo used to be able to fail the whole action — an unsupported format
 * or an oversized file threw, and what the student saw was a form that did
 * nothing at all. The meal is the point and the photo is a note attached to
 * it, so a photo that can't be saved loses the photo, not the meal, and the
 * reason is handed back rather than swallowed.
 */
export async function createMeal(_prevState: MealFormState, formData: FormData): Promise<MealFormState> {
  const userId = await requireUserId();
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return { error: "Write what you ate first." };

  const kcalRaw = formData.get("kcal");
  const proteinRaw = formData.get("proteinG");
  const carbsRaw = formData.get("carbsG");
  const fatRaw = formData.get("fatG");
  const photo = formData.get("photo") as File | null;
  let imagePath: string | null = null;
  let photoError: string | undefined;
  if (photo && photo.size > 0) {
    try {
      imagePath = await saveUploadedImage(photo, userId);
    } catch (err) {
      photoError = err instanceof Error ? err.message : "That photo couldn't be saved.";
    }
  }

  await prisma.meal.create({
    data: {
      userId,
      type: String(formData.get("type") ?? "SNACK"),
      description,
      kcal: kcalRaw ? Number(kcalRaw) : null,
      proteinG: proteinRaw ? Number(proteinRaw) : null,
      carbsG: carbsRaw ? Number(carbsRaw) : null,
      fatG: fatRaw ? Number(fatRaw) : null,
      estimated: Boolean(formData.get("estimated")),
      imagePath,
    },
  });
  revalidatePath("/gym");
  return photoError ? { error: `Meal logged, but the photo wasn't saved: ${photoError}` } : undefined;
}

export async function deleteMeal(mealId: string) {
  const userId = await requireUserId();
  const meal = await prisma.meal.findFirst({ where: { id: mealId, userId } });
  if (!meal) return;

  await prisma.meal.delete({ where: { id: meal.id } });
  await deleteUploadedImage(meal.imagePath);
  revalidatePath("/gym");
}
