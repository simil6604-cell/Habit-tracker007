import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");
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
 * Saves an uploaded image file to disk under public/uploads/<userId>/ and
 * returns its public URL path. The file is stored as-is — nothing in this
 * app inspects or analyzes the image content.
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
  try {
    await unlink(path.join(process.cwd(), "public", imagePath));
  } catch {
    // already gone, or never existed — fine
  }
}
