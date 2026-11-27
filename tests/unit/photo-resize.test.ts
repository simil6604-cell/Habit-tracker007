import { describe, expect, it } from "vitest";
import {
  MAX_EDGE,
  SAFE_BYTES,
  jpegName,
  needsShrinking,
  targetSize,
} from "@/lib/school/photo-resize";

/**
 * The arithmetic behind shrinking a photo before it is sent.
 *
 * Reported as "the AI service returned an error (400)" while attaching a
 * photo. A 12-megapixel phone photo is three to five megabytes, base64 adds
 * a third again, and the API refuses it. The canvas work is the browser's;
 * these are the decisions around it, which are the parts that can be wrong
 * quietly.
 */
describe("what size to draw a photo at", () => {
  it("leaves a photo the model can already read alone", () => {
    expect(targetSize(1200, 900)).toEqual({ width: 1200, height: 900 });
    expect(targetSize(MAX_EDGE, 1000)).toEqual({ width: MAX_EDGE, height: 1000 });
  });

  it("scales by the long edge, whichever way up the photo is", () => {
    // A phone photo, landscape and portrait: the long edge lands on the
    // limit and the other side keeps the proportions.
    expect(targetSize(4032, 3024)).toEqual({ width: 2576, height: 1932 });
    expect(targetSize(3024, 4032)).toEqual({ width: 1932, height: 2576 });
  });

  it("never rounds a side away to nothing", () => {
    // A long thin scan. Rounding the short side to zero gives a canvas that
    // throws, and the photo is lost rather than shrunk.
    const size = targetSize(6000, 1);
    expect(size.width).toBe(MAX_EDGE);
    expect(size.height).toBeGreaterThanOrEqual(1);
  });

  it("does not divide by zero on a file that is not really an image", () => {
    expect(targetSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("which files are touched at all", () => {
  it("shrinks a big photo, by bytes or by pixels", () => {
    expect(needsShrinking({ type: "image/jpeg", size: 4_000_000 }, 4032)).toBe(true);
    // Small file, huge canvas: a flat scan compresses to nothing and still
    // has more pixels than the model will look at.
    expect(needsShrinking({ type: "image/png", size: 200_000 }, 6000)).toBe(true);
    // Big file, modest canvas: a lossless PNG screenshot.
    expect(needsShrinking({ type: "image/png", size: SAFE_BYTES + 1 }, 1200)).toBe(true);
  });

  it("leaves a photo that is already fine exactly as it is", () => {
    // Re-encoding a clean small PNG would cost quality for nothing.
    expect(needsShrinking({ type: "image/png", size: 300_000 }, 1400)).toBe(false);
  });

  it("never touches a PDF, which is pages rather than pixels", () => {
    expect(needsShrinking({ type: "application/pdf", size: 9_000_000 }, 0)).toBe(false);
  });
});

describe("what the re-encoded file is called", () => {
  it("says what it now actually is", () => {
    expect(jpegName("IMG_1330.heic")).toBe("IMG_1330.jpg");
    expect(jpegName("past paper.png")).toBe("past paper.jpg");
    expect(jpegName("photo")).toBe("photo.jpg");
    expect(jpegName(".heic")).toBe("photo.jpg");
  });
});
