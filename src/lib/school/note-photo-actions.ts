"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { saveUploadedImage, deleteUploadedImage } from "@/lib/uploads/save-image";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import { buildAcademicSystemPrompt } from "@/lib/ai/academic-prompt";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type NotePhotoEntry = { id: string; imagePath: string; summary: string | null; createdAt: Date };

const MEDIA_TYPE_BY_EXT: Record<string, "image/jpeg" | "image/png" | "image/webp"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

async function summarizeNotePhoto(userId: string, imagePath: string, subjectName: string, topicName: string): Promise<string | null> {
  if (!isRealAIConfigured) return null;

  const ext = imagePath.split(".").pop()?.toLowerCase() ?? "jpg";
  const mediaType = MEDIA_TYPE_BY_EXT[ext];
  if (!mediaType) return null; // HEIC/HEIF etc. — Claude's vision API needs jpeg/png/webp/gif

  try {
    const buffer = await readFile(path.join(process.cwd(), "public", imagePath));
    const imageBase64 = buffer.toString("base64");
    const school = await prisma.school.findUnique({ where: { userId } });
    const system = buildAcademicSystemPrompt(school?.educationSystem);
    const prompt = `Subject: ${subjectName}\nTopic: ${topicName}\n\nThis is a photo of the student's own notes. Transcribe the key content and turn it into a clear, well-organized summary to help them revise. If any part is illegible, say so plainly instead of guessing.`;
    return await getAIProvider().generate(prompt, { system, imageBase64, imageMediaType: mediaType });
  } catch {
    return null;
  }
}

export async function getNotePhotos(topicId: string): Promise<NotePhotoEntry[]> {
  const userId = await requireUserId();
  const photos = await prisma.notePhoto.findMany({ where: { topicId, userId }, orderBy: { createdAt: "desc" } });
  return photos.map((p) => ({ id: p.id, imagePath: p.imagePath, summary: p.summary, createdAt: p.createdAt }));
}

/**
 * Saves one photo. No cap on how many a student can add to a topic overall —
 * the panel calls this once per selected file so a large batch still shows
 * live progress instead of one long silent wait.
 */
export async function addNotePhoto(topicId: string, formData: FormData): Promise<{ photos: NotePhotoEntry[]; error?: string }> {
  const userId = await requireUserId();
  const topic = await prisma.topic.findFirst({ where: { id: topicId, subject: { userId } }, include: { subject: true } });
  if (!topic) return { photos: await getNotePhotos(topicId), error: "Topic not found." };

  const file = formData.get("photo") as File | null;
  if (!file || file.size === 0) return { photos: await getNotePhotos(topicId), error: "Choose a photo first." };

  let imagePath: string | null;
  try {
    imagePath = await saveUploadedImage(file, userId);
  } catch (err) {
    return { photos: await getNotePhotos(topicId), error: err instanceof Error ? err.message : "Couldn't save that photo." };
  }
  if (!imagePath) return { photos: await getNotePhotos(topicId), error: "Couldn't save that photo." };

  const summary = await summarizeNotePhoto(userId, imagePath, topic.subject.name, topic.name);

  await prisma.notePhoto.create({ data: { userId, topicId, imagePath, summary } });
  revalidatePath(`/school/subjects/${topic.subjectId}`);
  return { photos: await getNotePhotos(topicId) };
}

export async function regenerateNoteSummary(topicId: string, photoId: string): Promise<NotePhotoEntry[]> {
  const userId = await requireUserId();
  const photo = await prisma.notePhoto.findFirst({ where: { id: photoId, userId }, include: { topic: { include: { subject: true } } } });
  if (photo) {
    const summary = await summarizeNotePhoto(userId, photo.imagePath, photo.topic.subject.name, photo.topic.name);
    if (summary) await prisma.notePhoto.update({ where: { id: photo.id }, data: { summary } });
  }
  return getNotePhotos(topicId);
}

export async function deleteNotePhoto(topicId: string, photoId: string): Promise<NotePhotoEntry[]> {
  const userId = await requireUserId();
  const photo = await prisma.notePhoto.findFirst({ where: { id: photoId, userId } });
  if (photo) {
    await prisma.notePhoto.delete({ where: { id: photo.id } });
    await deleteUploadedImage(photo.imagePath);
  }
  return getNotePhotos(topicId);
}
