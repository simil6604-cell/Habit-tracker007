import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads/save-image";

/**
 * The two limits a photo has to get past, and the rule that they agree.
 *
 * Next.js caps a Server Action body at 1MB unless told otherwise, and every
 * upload in this app is a Server Action. With the default, a 2.4MB photo —
 * smaller than anything a phone takes — was rejected with a 413 before the
 * app's own 10MB check ran, so the student was told their photo failed while
 * the app's own rules said it was fine.
 *
 * Read out of next.config.ts as text on purpose: importing it would run Next's
 * config machinery, and the thing being tested is the literal a person edits.
 */

const configSrc = readFileSync(path.join(__dirname, "..", "..", "next.config.ts"), "utf8");

/** "12mb" → bytes, the way Next's own config parser reads it. */
function parseSizeLimit(raw: string): number {
  const match = /^([\d.]+)\s*(b|kb|mb|gb)$/i.exec(raw.trim());
  if (!match) return NaN;
  const units: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
  return Number(match[1]) * units[match[2].toLowerCase()];
}

describe("upload size limits", () => {
  const declared = /bodySizeLimit:\s*([A-Za-z_]+)/.exec(configSrc);
  const literal = /SERVER_ACTION_BODY_LIMIT\s*=\s*"([^"]+)"/.exec(configSrc);

  it("sets a Server Action body limit at all", () => {
    // Without this the default 1MB applies, and no photo from a phone fits.
    expect(configSrc, "next.config.ts must configure serverActions.bodySizeLimit").toContain("bodySizeLimit");
    expect(declared, "bodySizeLimit should point at the named constant").not.toBeNull();
    expect(literal, "SERVER_ACTION_BODY_LIMIT should be a string literal").not.toBeNull();
  });

  it("parses to a real number of bytes", () => {
    expect(parseSizeLimit(literal![1])).toBeGreaterThan(0);
  });

  // The whole point: the transport limit must be at least the limit the app
  // advertises, or the app rejects photos it promised to accept.
  it("is at least as large as the biggest photo the app accepts", () => {
    expect(parseSizeLimit(literal![1])).toBeGreaterThanOrEqual(MAX_UPLOAD_BYTES);
  });

  // A multipart body is the file plus boundaries, field names and headers. An
  // exactly-equal limit rejects a file of exactly the maximum size.
  it("leaves room for the multipart envelope around a maximum-size photo", () => {
    expect(parseSizeLimit(literal![1])).toBeGreaterThan(MAX_UPLOAD_BYTES + 64 * 1024);
  });

  it("is not so large that one request can carry a whole batch", () => {
    // Batches upload one photo per request. A limit big enough for twelve
    // would hide that requirement until a phone on a slow connection hit it.
    expect(parseSizeLimit(literal![1])).toBeLessThan(MAX_UPLOAD_BYTES * 3);
  });

  it("agrees with the 10MB the upload error message quotes at the student", () => {
    const saveSrc = readFileSync(
      path.join(__dirname, "..", "..", "src", "lib", "uploads", "save-image.ts"),
      "utf8"
    );
    expect(saveSrc).toContain("max 10MB");
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});
