import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
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

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
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
  if (file.size > MAX_BYTES) throw new Error("Image is too large (max 10MB).");
  if (!ALLOWED_TYPES.has(file.type)) throw new Error("Unsupported image type.");

  const ext = EXT_BY_TYPE[file.type] ?? "jpg";
  const filename = `${randomUUID()}.${ext}`;
  const userDir = path.join(UPLOAD_ROOT, userId);
  await mkdir(userDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(userDir, filename), buffer);

  return `/uploads/${userId}/${filename}`;
}

/** Best-effort delete — a missing file is not an error worth surfacing. */
export async function deleteUploadedImage(imagePath: string | null | undefined) {
  if (!imagePath || !imagePath.startsWith("/uploads/")) return;
  const relative = imagePath.slice("/uploads/".length);
  // Both roots: a photo saved before UPLOAD_DIR existed still deletes cleanly.
  for (const root of [UPLOAD_ROOT, LEGACY_UPLOAD_ROOT]) {
    try {
      await unlink(path.join(root, relative));
    } catch {
      // already gone, or never lived here — fine
    }
  }
}
