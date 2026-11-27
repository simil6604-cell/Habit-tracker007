"use client";

import { MAX_EDGE, QUALITY, jpegName, needsShrinking, targetSize } from "./photo-resize";

/**
 * The browser half of shrinking a photo: decode, draw smaller, re-encode.
 *
 * Separate from photo-resize.ts because that file is arithmetic and this
 * one is a canvas, and only one of the two can be tested without a browser.
 *
 * It never throws and never refuses. A file it cannot decode — an exotic
 * format, a browser without createImageBitmap, a corrupt photo — comes back
 * exactly as it arrived, and the upload path behaves as it did before this
 * existed. Losing someone's photo to a resize that failed would be a worse
 * bug than the one this fixes.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (file.type === "application/pdf") return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Undecodable here. It may still be readable further on, and the
    // existing "this file could not be read" path says so if it is not.
    return file;
  }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (!needsShrinking(file, longest)) return file;

    const { width, height } = targetSize(bitmap.width, bitmap.height, MAX_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY)
    );
    // A re-encode that came out bigger is a re-encode worth throwing away.
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], jpegName(file.name), { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
