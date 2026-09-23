"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { getAIProvider, isRealAIConfigured } from "@/lib/ai/provider";
import type { ProviderImage } from "@/lib/ai/anthropic-provider";
import { deleteUploadedImage, readUploadedImage, saveUploadedImage } from "@/lib/uploads/save-image";
import {
  NO_REAL_AI_MESSAGE,
  buildSchoolAIPrompt,
  buildSchoolAISystemPrompt,
  type SchoolAITurn,
} from "./school-ai";
import { MAX_PHOTOS_PER_MESSAGE, ownedUploadPaths, parseImagePaths, visionMediaType } from "./school-ai-photos";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type SchoolAIMessageEntry = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  imagePaths: string[];
  createdAt: Date;
};

/**
 * How much picture data one question may carry.
 *
 * Twelve photos of a past paper is a normal thing to ask about; twelve
 * ten-megabyte photos is a request the API rejects outright, and a 413 from
 * someone else's server is not an error this app can explain. So the budget
 * is checked here, where we can say which photo pushed it over.
 */
const MAX_IMAGE_BYTES = 18 * 1024 * 1024;

/** How much of the conversation is kept on screen and available to the tutor. */
const HISTORY_LIMIT = 200;

function toEntry(m: { id: string; role: string; content: string; imagePaths: string | null; createdAt: Date }): SchoolAIMessageEntry {
  return {
    id: m.id,
    role: m.role as "USER" | "ASSISTANT",
    content: m.content,
    imagePaths: parseImagePaths(m.imagePaths),
    createdAt: m.createdAt,
  };
}

/**
 * The conversation, oldest turn first.
 *
 * Fetched newest-first and then reversed, because `orderBy: asc` with a `take`
 * returns the OLDEST 200 rows, not the newest. Past that many messages the
 * chat would have frozen: new replies land in the database and never appear,
 * and nothing about it looks like a bug from the outside.
 *
 * The id breaks a tie on createdAt — two rows written in the same millisecond
 * could otherwise come back with the answer above the question.
 */
export async function getSchoolAIMessages(): Promise<SchoolAIMessageEntry[]> {
  const userId = await requireUserId();
  const messages = await prisma.schoolAIMessage.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HISTORY_LIMIT,
  });
  return messages.reverse().map(toEntry);
}

export type UploadResult = { paths: string[]; error?: string };

/**
 * Saves a batch of photos and hands back the paths, without sending anything.
 *
 * Upload and ask are deliberately two steps: someone photographing four pages
 * of a question wants to see all four land, and be able to drop the blurry one,
 * before spending a turn on them.
 */
export async function uploadSchoolAIPhotos(formData: FormData): Promise<UploadResult> {
  const userId = await requireUserId();
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { paths: [], error: "Choose at least one photo." };
  if (files.length > MAX_PHOTOS_PER_MESSAGE) {
    return { paths: [], error: `That's ${files.length} photos — send up to ${MAX_PHOTOS_PER_MESSAGE} at a time.` };
  }

  await sweepAbandonedUploads(userId);

  const paths: string[] = [];
  const problems: string[] = [];

  for (const file of files) {
    // An iPhone's default HEIC saves fine but the vision API can't read it, so
    // it would sit in the thread as a photo the tutor silently never saw. Say
    // so at the point where it can still be re-taken.
    if (!visionMediaType(file.type)) {
      problems.push(
        `${file.name || "that photo"} is ${file.type || "an unknown format"}, which the AI can't read. On iPhone: Settings → Camera → Formats → Most Compatible, or send a screenshot of it instead.`
      );
      continue;
    }
    try {
      const path = await saveUploadedImage(file, userId);
      if (path) {
        // Recorded as staged, which is what later tells this file apart from
        // every other photo sitting in the same directory.
        await prisma.schoolAIUpload.create({ data: { userId, path } });
        paths.push(path);
      }
    } catch (err) {
      problems.push(`${file.name || "a photo"}: ${err instanceof Error ? err.message : "couldn't be saved"}`);
    }
  }

  return { paths, error: problems.length > 0 ? problems.join(" ") : undefined };
}

/**
 * Drops a photo that was uploaded but not yet sent.
 *
 * The path arrives from the browser, so it is caller-supplied input reaching a
 * delete. Being under this user's own upload directory is not enough to act
 * on: that is equally true of their progress photos and their note photos, and
 * a crafted call would have deleted one of those, leaving the row behind and
 * the picture gone. The staged row is the proof, and it only exists for a file
 * this user uploaded here and has not sent.
 */
export async function discardSchoolAIPhoto(imagePath: string): Promise<void> {
  const userId = await requireUserId();
  const [owned] = ownedUploadPaths([imagePath], userId);
  if (!owned) return;

  const { count } = await prisma.schoolAIUpload.deleteMany({ where: { userId, path: owned } });
  if (count === 0) return;
  await deleteUploadedImage(owned);
}

/** Staged photos older than this were abandoned — the tab was closed, or the question never got asked. */
const STAGED_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes staged photos nobody came back for.
 *
 * Only ever rows in this table, so it can never reach a photo that belongs to
 * something else. Without it every abandoned upload stays on the disk for the
 * life of the deployment, unreachable and unnameable.
 */
async function sweepAbandonedUploads(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - STAGED_UPLOAD_TTL_MS);
  const stale = await prisma.schoolAIUpload.findMany({ where: { userId, createdAt: { lt: cutoff } } });
  if (stale.length === 0) return;

  await prisma.schoolAIUpload.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
  for (const row of stale) await deleteUploadedImage(row.path);
}

async function loadImages(paths: string[]): Promise<{ images: ProviderImage[]; skipped: number }> {
  const images: ProviderImage[] = [];
  let skipped = 0;
  let bytes = 0;

  for (const path of paths) {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const mediaType = visionMediaType(`image/${ext === "jpg" ? "jpeg" : ext}`);
    if (!mediaType) {
      skipped += 1;
      continue;
    }
    const buffer = await readUploadedImage(path);
    if (!buffer || bytes + buffer.byteLength > MAX_IMAGE_BYTES) {
      skipped += 1;
      continue;
    }
    bytes += buffer.byteLength;
    images.push({ base64: buffer.toString("base64"), mediaType });
  }

  return { images, skipped };
}

export async function sendSchoolAIMessage(content: string, imagePaths: string[] = []): Promise<SchoolAIMessageEntry[]> {
  const userId = await requireUserId();
  const trimmed = content.trim();
  const photos = ownedUploadPaths(imagePaths, userId).slice(0, MAX_PHOTOS_PER_MESSAGE);
  // A photo on its own is a real question ("what's wrong with this?"), so an
  // empty box is only empty when nothing is attached either.
  if (!trimmed && photos.length === 0) return getSchoolAIMessages();

  // Newest first then reversed, for the same reason as getSchoolAIMessages:
  // taken ascending, the tutor's "recent context" freezes at the first 200
  // messages ever sent and never moves again.
  const history = (
    await prisma.schoolAIMessage.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: HISTORY_LIMIT,
    })
  ).reverse();

  await prisma.schoolAIMessage.create({
    data: {
      userId,
      role: "USER",
      content: trimmed || "(sent photos without a question)",
      imagePaths: photos.length > 0 ? JSON.stringify(photos) : null,
    },
  });
  // They belong to the question now, so they are no longer staged — and the
  // sweep must never come back for them.
  if (photos.length > 0) {
    await prisma.schoolAIUpload.deleteMany({ where: { userId, path: { in: photos } } });
  }

  let reply: string;
  if (!isRealAIConfigured) {
    reply = NO_REAL_AI_MESSAGE;
  } else {
    const turns: SchoolAITurn[] = history.map((m) => ({
      role: m.role as "USER" | "ASSISTANT",
      content: m.content,
      photoCount: parseImagePaths(m.imagePaths).length,
    }));

    const { images, skipped } = await loadImages(photos);
    const system = await buildSchoolAISystemPrompt(userId);
    const prompt = buildSchoolAIPrompt(turns, trimmed || "Have a look at these and tell me what you see.", images.length);

    try {
      reply = await getAIProvider().generate(prompt, { system, maxTokens: 2000, images });
    } catch (err) {
      reply = `Couldn't reach the AI service right now (${err instanceof Error ? err.message : "unknown error"}) — try again in a moment.`;
    }

    // Never let a photo go unanswered-for in silence: if one couldn't be read
    // or didn't fit, the reply says so rather than quietly covering the rest.
    if (skipped > 0) {
      reply = `_(${skipped} of your ${photos.length} photos couldn't be included — too large, or the file is missing. Send ${skipped === 1 ? "it" : "them"} again on their own if ${skipped === 1 ? "it matters" : "they matter"}.)_\n\n${reply}`;
    }
  }

  await prisma.schoolAIMessage.create({ data: { userId, role: "ASSISTANT", content: reply } });
  revalidatePath("/school/ai");
  return getSchoolAIMessages();
}

export async function clearSchoolAIChat(): Promise<SchoolAIMessageEntry[]> {
  const userId = await requireUserId();
  const messages = await prisma.schoolAIMessage.findMany({ where: { userId } });
  await prisma.schoolAIMessage.deleteMany({ where: { userId } });
  // The photos belonged to this conversation and nothing else points at them,
  // so clearing it takes them off the disk too rather than leaving a pile of
  // orphaned files no screen in the app can ever show again.
  for (const message of messages) {
    for (const path of parseImagePaths(message.imagePaths)) {
      await deleteUploadedImage(path);
    }
  }
  revalidatePath("/school/ai");
  return [];
}
