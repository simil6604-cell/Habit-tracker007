import { prisma } from "@/lib/db/prisma";
import type { LibraryItem } from "./library";

/**
 * Everything this account has made, as one flat list.
 *
 * Four tables, one shape. Each row keeps a link back to the page that owns it,
 * so the library is a way of finding things rather than a second place they
 * live — opening a flashcard still takes you to the flashcards page.
 *
 * The preview text is cut here rather than in CSS: a transcript can be tens of
 * thousands of characters, and sending all of it to the browser to show two
 * lines is a page that takes a second to load for no visible reason.
 */
const PREVIEW_CHARS = 160;

function preview(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS - 1)}…` : text;
}

export type LibraryFolderRow = { id: string; name: string; count: number };

export async function getLibrary(userId: string): Promise<{ items: LibraryItem[]; folders: LibraryFolderRow[] }> {
  const [flashcards, notePhotos, recordings, written, folders] = await Promise.all([
    prisma.flashcard.findMany({
      where: { userId },
      select: { id: true, front: true, back: true, topic: true, createdAt: true, folderId: true, subject: { select: { name: true } } },
    }),
    prisma.notePhoto.findMany({
      where: { userId },
      select: { id: true, summary: true, createdAt: true, folderId: true, topic: { select: { id: true, name: true, subjectId: true } } },
    }),
    prisma.classRecording.findMany({
      where: { userId },
      select: { id: true, summary: true, transcript: true, createdAt: true, folderId: true, topic: { select: { id: true, name: true, subjectId: true } } },
    }),
    prisma.learningLogEntry.findMany({
      where: { userId },
      select: { id: true, type: true, content: true, createdAt: true, folderId: true, topic: { select: { id: true, name: true, subjectId: true } } },
    }),
    prisma.libraryFolder.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const items: LibraryItem[] = [
    ...flashcards.map((card): LibraryItem => ({
      id: `flashcard-${card.id}`,
      type: "FLASHCARD",
      kind: "Flashcard",
      title: preview(card.front),
      detail: preview(card.back),
      context: card.subject?.name ?? card.topic ?? null,
      createdAt: card.createdAt,
      href: "/school/flashcards",
      folderId: card.folderId,
    })),
    ...notePhotos.map((note): LibraryItem => ({
      id: `note-${note.id}`,
      type: "NOTE",
      kind: "Photo of notes",
      title: preview(note.summary) || `Notes on ${note.topic.name}`,
      detail: "",
      context: note.topic.name,
      createdAt: note.createdAt,
      href: `/school/subjects/${note.topic.subjectId}`,
      folderId: note.folderId,
    })),
    ...written.map((entry): LibraryItem => ({
      id: `log-${entry.id}`,
      type: "NOTE",
      kind:
        entry.type === "CONFUSED" ? "Didn't get this" : entry.type === "QUESTION" ? "Question" : "Understood",
      title: preview(entry.content),
      detail: "",
      context: entry.topic.name,
      createdAt: entry.createdAt,
      href: `/school/subjects/${entry.topic.subjectId}`,
      folderId: entry.folderId,
    })),
    ...recordings.map((rec): LibraryItem => ({
      id: `recording-${rec.id}`,
      type: "RECORDING",
      kind: "Class recording",
      title: preview(rec.summary) || `Recording from ${rec.topic.name}`,
      detail: preview(rec.transcript),
      context: rec.topic.name,
      createdAt: rec.createdAt,
      href: `/school/subjects/${rec.topic.subjectId}`,
      folderId: rec.folderId,
    })),
  ];

  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.folderId) counts.set(item.folderId, (counts.get(item.folderId) ?? 0) + 1);
  }

  return {
    items,
    folders: folders.map((folder) => ({ ...folder, count: counts.get(folder.id) ?? 0 })),
  };
}

/** Just the size of the library, for the count beside it in the sidebar. */
export async function countLibrary(userId: string): Promise<number> {
  const [flashcards, notePhotos, recordings, written] = await Promise.all([
    prisma.flashcard.count({ where: { userId } }),
    prisma.notePhoto.count({ where: { userId } }),
    prisma.classRecording.count({ where: { userId } }),
    prisma.learningLogEntry.count({ where: { userId } }),
  ]);
  return flashcards + notePhotos + recordings + written;
}
