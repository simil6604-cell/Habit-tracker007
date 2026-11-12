"use client";

import type { BrowserMultiFormatReader } from "@zxing/browser";

/**
 * Reading a barcode out of a photo someone actually took.
 *
 * The old version handed the picture to the decoder once, exactly as it came
 * off the camera, and took no for an answer. That works on a crisp barcode
 * filling the frame and fails on the thing people really photograph: a
 * packet on a table, the barcode a fifth of the width, and — this is the one
 * that failed outright — the label turned on its side, because that is how
 * it sits on a bottle and on most shelves.
 *
 * So the picture is tried several ways: upright and turned, whole and
 * zoomed into the middle. Each attempt is cheap, the first success wins, and
 * the order runs from most likely to least so the common case is still one
 * attempt.
 */

export type PhotoAttempt = {
  /** Quarter turns clockwise before decoding. */
  rotate: 0 | 90;
  /** How much of the middle of the picture to keep, as a fraction. */
  crop: number;
};

/**
 * What to try, in order.
 *
 * Upright-and-whole first, because that is what a careful photo looks like
 * and it costs one attempt. Then turned, which is the case that used to
 * fail. Then the middle of the picture at two sizes: people centre the
 * barcode, and cropping to it makes the bars a far bigger share of the
 * pixels the decoder is given.
 *
 * 180 and 270 degrees are deliberately absent: a one-dimensional barcode
 * reads the same upside down, and the decoder handles that itself.
 */
export const PHOTO_ATTEMPTS: PhotoAttempt[] = [
  { rotate: 0, crop: 1 },
  { rotate: 90, crop: 1 },
  { rotate: 0, crop: 0.6 },
  { rotate: 90, crop: 0.6 },
  { rotate: 0, crop: 0.4 },
  { rotate: 90, crop: 0.4 },
];

/**
 * The longest side a decode attempt is given.
 *
 * A twelve-megapixel photo is slow to decode and no more readable: what
 * matters is pixels per bar, not pixels. A crop is allowed to be scaled UP
 * to this, which is the point of cropping at all.
 */
export const MAX_DECODE_SIDE = 1800;

/** Draws one attempt — cropped, turned, and scaled to something sensible. */
export function drawAttempt(
  image: CanvasImageSource & { width: number; height: number },
  attempt: PhotoAttempt
): HTMLCanvasElement | null {
  const sourceW = Math.round(image.width * attempt.crop);
  const sourceH = Math.round(image.height * attempt.crop);
  if (sourceW < 32 || sourceH < 32) return null;
  const sourceX = Math.round((image.width - sourceW) / 2);
  const sourceY = Math.round((image.height - sourceH) / 2);

  // After a quarter turn the picture's sides swap.
  const turned = attempt.rotate === 90;
  const outW = turned ? sourceH : sourceW;
  const outH = turned ? sourceW : sourceH;
  const scale = Math.min(MAX_DECODE_SIDE / Math.max(outW, outH), 3);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(outW * scale));
  canvas.height = Math.max(1, Math.round(outH * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;

  // Nearest-neighbour: a barcode is hard edges, and smoothing a zoomed crop
  // turns the thin bars into grey mush.
  context.imageSmoothingEnabled = false;
  context.save();
  if (turned) {
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
  }
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceW,
    sourceH,
    0,
    0,
    turned ? canvas.height : canvas.width,
    turned ? canvas.width : canvas.height
  );
  context.restore();
  return canvas;
}

/** Loads a file into an image element the canvas can draw. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("unreadable"));
    image.src = url;
  });
}

export type PhotoResult =
  | { ok: true; text: string }
  | { ok: false; reason: "unreadable" | "no-barcode" };

/**
 * Tries the picture every way, and stops at the first barcode.
 *
 * The reader is passed in rather than made here so the caller keeps the
 * hints it already configured, and so this can be driven in a test.
 */
export async function decodePhoto(
  url: string,
  reader: Pick<BrowserMultiFormatReader, "decodeFromCanvas">,
  attempts: PhotoAttempt[] = PHOTO_ATTEMPTS
): Promise<PhotoResult> {
  let image: HTMLImageElement;
  try {
    image = await loadImage(url);
  } catch {
    // A format the browser cannot open at all — HEIC on a desktop browser,
    // or a file that is not really an image.
    return { ok: false, reason: "unreadable" };
  }

  for (const attempt of attempts) {
    const canvas = drawAttempt(image, attempt);
    if (!canvas) continue;
    try {
      const result = reader.decodeFromCanvas(canvas);
      const text = result.getText().trim();
      if (text) return { ok: true, text };
    } catch {
      // This way round, nothing. Try the next.
    }
    // Let the browser breathe between attempts: six full-size decodes in one
    // go locks the page up on a phone, and a frozen page reads as a crash.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { ok: false, reason: "no-barcode" };
}
