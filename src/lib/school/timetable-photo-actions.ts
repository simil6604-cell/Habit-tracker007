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

/**
 * The timetable as it was handed to you, photographed.
 *
 * The grid built from TimetableSlot is what the app reasons with — what is on
 * today, what clashes with training. This is the other thing a timetable is
 * for: looking at it. A photo is right the moment it is taken, including the
 * option blocks and room numbers nobody wants to type in twice.
 *
 * One per account. Uploading another replaces it, and the old file is deleted
 * rather than left behind on the disk.
 */
export async function saveTimetablePhoto(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) return;

  const imagePath = await saveUploadedImage(file, userId);
  if (!imagePath) return;

  const school = await prisma.school.findUnique({ where: { userId }, select: { timetableImage: true } });
  const previous = school?.timetableImage ?? null;

  // upsert: the row exists for anyone who finished onboarding, but a photo
  // should not be the one thing that needs a school to be set up first.
  await prisma.school.upsert({
    where: { userId },
    create: { userId, name: "My school", educationSystem: "IGCSE", timetableImage: imagePath },
    update: { timetableImage: imagePath },
  });

  if (previous && previous !== imagePath) await deleteUploadedImage(previous);

  revalidatePath("/school");
  revalidatePath("/school/timetable");
}

export async function removeTimetablePhoto(): Promise<void> {
  const userId = await requireUserId();
  const school = await prisma.school.findUnique({ where: { userId }, select: { timetableImage: true } });
  if (!school?.timetableImage) return;

  await prisma.school.update({ where: { userId }, data: { timetableImage: null } });
  await deleteUploadedImage(school.timetableImage);

  revalidatePath("/school");
  revalidatePath("/school/timetable");
}
