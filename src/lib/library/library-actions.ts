"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { parseFolderName, splitLibraryItemId } from "./library";
import { plannedFolders, plannedSections, STARTER_SECTIONS } from "./starter-structure";

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

  const raw = String(formData.get("folderId") ?? "").trim();
  // One control for both levels: a folder on its own, or "folderId:sectionId"
  // for a section inside it. The browser can rewrite either, so both are
  // checked against this account before anything is written.
  const [rawFolder, rawSection] = raw.split(":");
  let folderId: string | null = null;
  let sectionId: string | null = null;
  if (rawFolder) {
    const folder = await prisma.libraryFolder.findFirst({ where: { id: rawFolder, userId }, select: { id: true } });
    if (!folder) return;
    folderId = folder.id;

    if (rawSection) {
      // Scoped to the folder as well as the account: a section belonging to a
      // different folder would file the item somewhere it cannot be found.
      const section = await prisma.librarySection.findFirst({
        where: { id: rawSection, userId, folderId: folder.id },
        select: { id: true },
      });
      if (!section) return;
      sectionId = section.id;
    }
  }

  // The userId is written out at every call rather than hoisted into a shared
  // `where` object. It reads as repetition, but the ownership scan is a static
  // read of these statements and a variable hides the guard from it — and the
  // point of that scan is that nobody has to take a guard on trust.
  const id = parsed.id;
  if (parsed.table === "flashcard") {
    await prisma.flashcard.updateMany({ where: { id, userId }, data: { folderId, sectionId } });
  } else if (parsed.table === "note") {
    await prisma.notePhoto.updateMany({ where: { id, userId }, data: { folderId, sectionId } });
  } else if (parsed.table === "log") {
    await prisma.learningLogEntry.updateMany({ where: { id, userId }, data: { folderId, sectionId } });
  } else {
    await prisma.classRecording.updateMany({ where: { id, userId }, data: { folderId, sectionId } });
  }

  revalidatePath("/library");
}

/**
 * Builds the subject folders, each with its dividers.
 *
 * Idempotent on purpose: pressing it twice adds nothing, and a folder or a
 * section that is already there is left exactly as it is — including
 * anything filed in it. Someone who already made "Biology" by hand must not
 * end up with two, and must certainly not lose what is in the first one.
 */
export async function setUpSubjectFolders(): Promise<{ created: number; sections: number }> {
  const userId = await requireUserId();
  const existing = await prisma.libraryFolder.findMany({
    where: { userId },
    select: { id: true, name: true, sections: { select: { name: true } } },
  });

  const { create } = plannedFolders(existing.map((folder) => folder.name));
  let createdFolders = 0;
  let createdSections = 0;

  for (const name of create) {
    const folder = await prisma.libraryFolder.create({ data: { userId, name } });
    createdFolders++;
    for (const [index, section] of STARTER_SECTIONS.entries()) {
      await prisma.librarySection.create({
        data: { userId, folderId: folder.id, name: section, order: index },
      });
      createdSections++;
    }
  }

  // Folders that were already there get the dividers they are missing, and
  // keep any of their own.
  for (const folder of existing) {
    const missing = plannedSections(folder.sections.map((section) => section.name));
    for (const [index, section] of missing.entries()) {
      await prisma.librarySection.create({
        data: { userId, folderId: folder.id, name: section, order: folder.sections.length + index },
      });
      createdSections++;
    }
  }

  revalidatePath("/library");
  return { created: createdFolders, sections: createdSections };
}

// The folder is a bound argument and the previous state comes second, which is
// the shape useActionState calls an action with — so the form can show the
// refusal sentence instead of throwing it away.
export async function createLibrarySection(
  folderId: string,
  _prev: FolderFormState,
  formData: FormData
): Promise<FolderFormState> {
  const userId = await requireUserId();
  const parsed = parseFolderName(formData.get("name"));
  if (!parsed.ok) return { error: parsed.error };

  // The folder has to be this account's before anything is written into it.
  const folder = await prisma.libraryFolder.findFirst({ where: { id: folderId, userId }, select: { id: true } });
  if (!folder) return { error: "That folder is not there any more." };

  const siblings = await prisma.librarySection.findMany({
    where: { folderId: folder.id, userId },
    select: { name: true },
  });
  // Compared without case, because SQLite's uniqueness is case-sensitive and
  // would happily hold "Corrections" twice in different capitals.
  if (siblings.some((section) => section.name.trim().toLowerCase() === parsed.name.toLowerCase())) {
    return { error: "That folder already has a section with that name." };
  }

  await prisma.librarySection.create({
    data: { userId, folderId: folder.id, name: parsed.name, order: siblings.length },
  });
  revalidatePath("/library");
  return { ok: true };
}

export async function renameLibrarySection(id: string, formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const parsed = parseFolderName(formData.get("name"));
  if (!parsed.ok) return;
  await prisma.librarySection.updateMany({ where: { id, userId }, data: { name: parsed.name } });
  revalidatePath("/library");
}

/**
 * Removes a section. What was in it stays, and becomes unsorted inside the
 * same folder — the relation is SetNull, the same promise folders make.
 */
export async function deleteLibrarySection(id: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.librarySection.deleteMany({ where: { id, userId } });
  revalidatePath("/library");
}
