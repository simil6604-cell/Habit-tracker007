import type { ImageMediaType } from "@/lib/ai/anthropic-provider";

/**
 * The photo rules for the school AI, kept out of the "use server" file so they
 * can be unit-tested directly and imported by the client panel — a module with
 * "use server" may only export async functions.
 */

/** Per message, not per conversation: ask about the next four pages in the next turn. */
export const MAX_PHOTOS_PER_MESSAGE = 12;

const VISION_TYPES: Record<string, ImageMediaType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

/**
 * The media type to send this file as, or null if the vision API can't read it.
 *
 * HEIC/HEIF is the one that matters: it is what an iPhone saves by default, it
 * uploads and stores perfectly well, and the AI simply cannot open it. Caught
 * here, it becomes a sentence telling the student how to re-take the photo.
 */
export function visionMediaType(fileType: string | null | undefined): ImageMediaType | null {
  return VISION_TYPES[(fileType ?? "").toLowerCase()] ?? null;
}

/**
 * What a PDF counts as: a document, read page by page rather than looked at.
 *
 * A past paper, a mark scheme and a set of lesson slides all arrive as PDFs,
 * and until now the only way to ask about one was to photograph the screen.
 * Sent as a document the model reads the real pages — the diagrams, the mark
 * allocations, the question numbering — instead of a photo of them.
 */
export const DOCUMENT_MEDIA_TYPE = "application/pdf";

export type AttachmentKind = "image" | "document";

/**
 * Which of the two an uploaded file is, or null if the AI can't read it.
 *
 * One function so the upload action, the sending action and the panel cannot
 * disagree about what is allowed — a disagreement there shows up as a file
 * that uploads fine and is then silently never looked at.
 */
export function attachmentKind(fileType: string | null | undefined): AttachmentKind | null {
  const type = (fileType ?? "").toLowerCase();
  if (type === DOCUMENT_MEDIA_TYPE) return "document";
  return visionMediaType(type) ? "image" : null;
}

/** Whether a stored path is a PDF, which is shown as a file rather than a picture. */
export function isDocumentPath(path: string): boolean {
  return path.toLowerCase().endsWith(".pdf");
}

/** The accept= list for the file input, so the picker filters before anything uploads. */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";

/**
 * Keeps only the upload paths that provably belong to this user.
 *
 * The paths come back from the browser between uploading and sending, so they
 * are caller-supplied input reaching the filesystem — the exact shape that let
 * a traversal through once before. `/uploads/<owner>/<file>` carries its owner
 * in it, so the check is that the owner is the person asking and the rest is
 * one filename in the alphabet this app generates. Anything else is dropped
 * silently: there is no legitimate way for the panel to produce one.
 */
export function ownedUploadPaths(paths: unknown, userId: string): string[] {
  if (!Array.isArray(paths)) return [];
  const kept: string[] = [];
  for (const path of paths) {
    if (typeof path !== "string") continue;
    if (!path.startsWith("/uploads/")) continue;
    const segments = path.slice("/uploads/".length).split("/");
    if (segments.length !== 2) continue;
    const [owner, filename] = segments;
    if (owner !== userId) continue;
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9]{2,5}$/.test(filename)) continue;
    if (kept.includes(path)) continue;
    kept.push(path);
  }
  return kept;
}

/** Stored as a JSON array; anything else is read as "no photos" rather than thrown. */
export function parseImagePaths(stored: string | null | undefined): string[] {
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}
