"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { parseFolderName, splitLibraryItemId } from "./library";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export type FolderFormState = { error?: string; ok?: boolean } | undefined;

export async function createLibraryFolder(_prev: FolderFormState, formData: FormData): Promise<FolderFormState> {
  const userId = await requireUserId();

  const parsed = parseFolderName(formData.get("name"));
  if (!parsed.ok) return { error: parsed.error };

  const existing = await prisma.libraryFolder.findFirst({
    where: { userId, name: parsed.name },
    select: { id: true },
  });
  // Caught here rather than left to the unique index, so the answer is a
  // sentence instead of a database error that reaches the browser as a crash.
  if (existing) return { error: "You already have a folder with that name." };

  await prisma.libraryFolder.create({ data: { userId, name: parsed.name } });
  revalidatePath("/library");
  return { ok: true };
}

export async function renameLibraryFolder(id: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();

  const parsed = parseFolderName(formData.get("name"));
  if (!parsed.ok) return;

  const owned = await prisma.libraryFolder.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) return;

  const clash = await prisma.libraryFolder.findFirst({
    where: { userId, name: parsed.name, NOT: { id: owned.id } },
    select: { id: true },
  });
  if (clash) return;

  await prisma.libraryFolder.update({ where: { id: owned.id }, data: { name: parsed.name } });
  revalidatePath("/library");
}

/**
 * Deleting a folder empties the shelf; it does not burn the books.
 *
 * The relation is onDelete SetNull, so everything inside simply becomes
 * unfiled. A folder is a way of arranging things, and nobody expects tidying
 * to destroy what was being tidied.
 */
export async function deleteLibraryFolder(id: string): Promise<void> {
  const userId = await requireUserId();
  const owned = await prisma.libraryFolder.findFirst({ where: { id, userId }, select: { id: true } });
  if (!owned) return;

  await prisma.libraryFolder.delete({ where: { id: owned.id } });
  revalidatePath("/library");
}

/** Put one thing on a shelf, or take it off ("" means unfiled). */
export async function moveLibraryItem(itemId: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();

  const parsed = splitLibraryItemId(itemId);
  if (!parsed) return;

  const rawFolder = String(formData.get("folderId") ?? "").trim();
  let folderId: string | null = null;
  if (rawFolder) {
    // The folder id arrives from a <select> the browser can rewrite, so it is
    // checked against this account before anything is written.
    const folder = await prisma.libraryFolder.findFirst({ where: { id: rawFolder, userId }, select: { id: true } });
    if (!folder) return;
    folderId = folder.id;
  }

  // The userId is written out at every call rather than hoisted into a shared
  // `where` object. It reads as repetition, but the ownership scan is a static
  // read of these statements and a variable hides the guard from it — and the
  // point of that scan is that nobody has to take a guard on trust.
  const id = parsed.id;
  if (parsed.table === "flashcard") {
    await prisma.flashcard.updateMany({ where: { id, userId }, data: { folderId } });
  } else if (parsed.table === "note") {
    await prisma.notePhoto.updateMany({ where: { id, userId }, data: { folderId } });
  } else if (parsed.table === "log") {
    await prisma.learningLogEntry.updateMany({ where: { id, userId }, data: { folderId } });
  } else {
    await prisma.classRecording.updateMany({ where: { id, userId }, data: { folderId } });
  }

  revalidatePath("/library");
}
