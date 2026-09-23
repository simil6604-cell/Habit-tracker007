import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Where uploaded images live on disk.
 *
 * Deliberately NOT inside `public/`. On a platform like Render the app
 * directory is rebuilt from git on every deploy, so anything written under
 * `public/uploads` is gone the next time you deploy while the database rows
 * still point at it — every note photo, meal photo and progress photo silently
 * turns into a broken image. Set UPLOAD_DIR to a path on a persistent disk
 * (on Render: /var/data/uploads, the same disk the database is on).
 *
 * The default sits outside `public/` too, so files are served by the
 * /uploads route in every environment — one code path, and that path checks
 * that the photo belongs to whoever is asking.
 */
export const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), ".data", "uploads");

/** Files written before UPLOAD_DIR existed, still served for anyone upgrading. */
export const LEGACY_UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

/**
 * The biggest photo this app accepts.
 *
 * Exported because it is half of a pair: Next.js has its own Server Action
 * body limit, set in next.config.ts, and if that one is smaller the upload is
 * rejected with a 413 before this check ever runs — the student sees a failure
 * the app can't explain, about a photo well inside the limit it advertises.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/**
 * Saves an uploaded image to the upload root under <userId>/ and returns the
 * URL path it is served at. The file is stored as-is — nothing in this app
 * inspects or analyzes the image content.
 */
export async function saveUploadedImage(file: File, userId: string): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Image is too large (max 10MB).");
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Unsupported image type.");

  const ext = EXT_BY_TYPE[file.type] ?? "jpg";
  const filename = `${randomUUID()}.${ext}`;
  const userDir = path.join(UPLOAD_ROOT, userId);
  await mkdir(userDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(userDir, filename), buffer);

  return `/uploads/${userId}/${filename}`;
}

/**
 * Turns a stored `/uploads/<owner>/<file>` path into the two segments it must
 * consist of, or null.
 *
 * These paths are written by this app, so in principle they are already safe.
 * That is exactly the reasoning that let a traversal through the serving route
 * survive review, so the same strict shape is enforced here: anything that
 * isn't one id and one filename, in the alphabet this app generates, is not a
 * path we will touch the filesystem with.
 */
function uploadSegments(imagePath: string): [string, string] | null {
  if (!imagePath.startsWith("/uploads/")) return null;
  const segments = imagePath.slice("/uploads/".length).split("/");
  if (segments.length !== 2) return null;
  const [owner, filename] = segments;
  if (!/^[A-Za-z0-9_-]+$/.test(owner)) return null;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(filename)) return null;
  return [owner, filename];
}

/** Best-effort delete — a missing file is not an error worth surfacing. */
export async function deleteUploadedImage(imagePath: string | null | undefined) {
  const segments = imagePath ? uploadSegments(imagePath) : null;
  if (!segments) return;
  // Both roots: a photo saved before UPLOAD_DIR existed still deletes cleanly.
  for (const root of [UPLOAD_ROOT, LEGACY_UPLOAD_ROOT]) {
    try {
      await unlink(path.join(root, ...segments));
    } catch {
      // already gone, or never lived here — fine
    }
  }
}

/**
 * Reads back a stored image by the path the database holds.
 *
 * Both roots are tried, so a photo saved before UPLOAD_DIR existed still opens.
 * Without this every caller has to know where uploads live, and one that
 * guesses wrong fails silently — which is exactly what happened to the AI
 * summaries when uploads moved off the app directory.
 */
export async function readUploadedImage(imagePath: string): Promise<Buffer | null> {
  const segments = uploadSegments(imagePath);
  if (!segments) return null;
  for (const root of [UPLOAD_ROOT, LEGACY_UPLOAD_ROOT]) {
    try {
      return await readFile(path.join(root, ...segments));
    } catch {
      // try the other root
    }
  }
  return null;
}

/**
 * Whether the file behind a stored path is actually on disk.
 *
 * The rows and the files can disagree — a deploy that rebuilds the app
 * directory deletes the photos while every row still points at them, and the
 * app looks fine until you open a gallery of broken images. This is what makes
 * that visible before you go looking for a photo that is gone.
 */
export async function uploadedImageExists(imagePath: string): Promise<boolean> {
  const segments = uploadSegments(imagePath);
  if (!segments) return false;
  for (const root of [UPLOAD_ROOT, LEGACY_UPLOAD_ROOT]) {
    try {
      const info = await stat(path.join(root, ...segments));
      if (info.isFile()) return true;
    } catch {
      // try the other root
    }
  }
  return false;
}
