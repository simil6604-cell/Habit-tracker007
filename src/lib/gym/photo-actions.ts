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

export async function uploadBodyPhoto(formData: FormData) {
  const userId = await requireUserId();
  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) return;

  const imagePath = await saveUploadedImage(file, userId);
  if (!imagePath) return;

  const caption = String(formData.get("caption") ?? "").trim() || null;
  await prisma.bodyPhoto.create({ data: { userId, imagePath, caption } });

  revalidatePath("/gym");
  revalidatePath("/gym/history");
}

export async function deleteBodyPhoto(photoId: string) {
  const userId = await requireUserId();
  const photo = await prisma.bodyPhoto.findFirst({ where: { id: photoId, userId } });
  if (!photo) return;

  await prisma.bodyPhoto.delete({ where: { id: photo.id } });
  await deleteUploadedImage(photo.imagePath);

  revalidatePath("/gym");
  revalidatePath("/gym/history");
}
