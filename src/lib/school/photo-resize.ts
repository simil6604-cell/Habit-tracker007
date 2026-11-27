/**
 * Making a phone photo small enough for the AI to read.
 *
 * A 12-megapixel photo off a modern phone is three to five megabytes, and
 * it is base64 in the request, which adds a third again. The API refuses an
 * image over its per-image limit with a 400 — reported as "Couldn't reach
 * the AI service right now (the AI service returned an error (400))" by
 * someone who had simply photographed a question.
 *
 * So it is shrunk in the browser, before it is uploaded. That fixes three
 * things at once: the API accepts it, the upload is a fraction of the size
 * over a phone connection, and the Server Action body stays well under its
 * own limit.
 *
 * Nothing is lost by it. The model works at MAX_EDGE on its long side and
 * scales anything bigger down itself, so sending more pixels than that
 * costs upload time and buys no detail.
 */

/**
 * The longest edge the model actually uses, in pixels.
 *
 * Opus 4.7 and Sonnet 5 upwards read images at up to 2576 on the long edge;
 * before them it was 1568. Shrinking to this keeps every pixel the model
 * can see — a past paper's small print and someone's handwriting included —
 * and throws away only what it would have discarded anyway.
 */
export const MAX_EDGE = 2576;

/**
 * The biggest file sent without re-encoding it.
 *
 * Base64 is 4 bytes per 3, so this is about 4.7 MB on the wire — under the
 * API's per-image limit with room to spare, and chosen under it rather than
 * at it, because the limit is theirs to change.
 */
export const SAFE_BYTES = 3_500_000;

/** JPEG quality for a re-encode: visually clean on text, a fraction of the size. */
export const QUALITY = 0.85;

/** The size to draw at: unchanged when it already fits, scaled by the long edge when not. */
export function targetSize(
  width: number,
  height: number,
  maxEdge = MAX_EDGE
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const scale = maxEdge / longest;
  // At least one pixel each way: a 6000x1 scan must not round to zero and
  // become a canvas that throws.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Whether this file needs anything doing to it at all. */
export function needsShrinking(file: { type: string; size: number }, longestEdge: number): boolean {
  // A PDF is pages, not pixels — it goes up untouched.
  if (file.type === "application/pdf") return false;
  return file.size > SAFE_BYTES || longestEdge > MAX_EDGE;
}

/** The name a re-encoded file keeps, with the extension it now really is. */
export function jpegName(name: string): string {
  const base = name.replace(/\.[^.]*$/, "") || "photo";
  return `${base}.jpg`;
}
