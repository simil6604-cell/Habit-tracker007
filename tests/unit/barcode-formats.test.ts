import { BarcodeFormat, DecodeHintType, MultiFormatReader, BinaryBitmap, RGBLuminanceSource, HybridBinarizer } from "@zxing/library";
import { describe, expect, it } from "vitest";
import { RETAIL_BARCODE_FORMATS, cameraConstraints, retailBarcodeHints } from "@/lib/gym/barcode-formats";

/**
 * The decoder is told which formats to look for. This checks that the list is
 * the right one by actually decoding a barcode with it — a hint map that
 * named the wrong formats would still look perfectly reasonable in review.
 */

/** EAN-13 left-hand encodings, odd and even parity, and the right-hand set. */
const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

/** The bar pattern of an EAN-13, as a string of 0s and 1s. */
function ean13Bits(code: string): string {
  const d = [...code].map(Number);
  const parity = PARITY[d[0]];
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[d[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return bits + "101";
}

/** Renders the pattern as a luminance buffer zxing can read. */
function decode(code: string, hints: Map<DecodeHintType, unknown>): string {
  const bits = ean13Bits(code);
  const scale = 3;
  const quiet = 20;
  const width = quiet * 2 + bits.length * scale;
  const height = 40;
  const luminances = new Uint8ClampedArray(width * height).fill(255);
  for (let x = 0; x < bits.length; x++) {
    if (bits[x] !== "1") continue;
    for (let s = 0; s < scale; s++) {
      for (let y = 0; y < height; y++) luminances[y * width + quiet + x * scale + s] = 0;
    }
  }
  const reader = new MultiFormatReader();
  reader.setHints(hints as Map<DecodeHintType, unknown>);
  const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminances, width, height)));
  return reader.decode(bitmap).getText();
}

describe("retailBarcodeHints", () => {
  it("decodes a real EAN-13 with the hints the scanner uses", () => {
    // A valid EAN-13 — the last digit is its check digit.
    expect(decode("4006381333931", retailBarcodeHints())).toBe("4006381333931");
  });

  it("names the formats that appear on groceries, and not the 2D ones", () => {
    expect(RETAIL_BARCODE_FORMATS).toContain(BarcodeFormat.EAN_13);
    expect(RETAIL_BARCODE_FORMATS).toContain(BarcodeFormat.UPC_A);
    expect(RETAIL_BARCODE_FORMATS).toContain(BarcodeFormat.EAN_8);
    // Every frame spent trying these is a frame not spent on the one that
    // could match — a shop barcode is never a QR code.
    expect(RETAIL_BARCODE_FORMATS).not.toContain(BarcodeFormat.QR_CODE);
    expect(RETAIL_BARCODE_FORMATS).not.toContain(BarcodeFormat.PDF_417);
  });

  it("asks the decoder to try hard, which is what finds a small or angled code", () => {
    expect(retailBarcodeHints().get(DecodeHintType.TRY_HARDER)).toBe(true);
  });

  it("hands the formats over under the key zxing reads", () => {
    expect(retailBarcodeHints().get(DecodeHintType.POSSIBLE_FORMATS)).toEqual(RETAIL_BARCODE_FORMATS);
  });
});

describe("cameraConstraints", () => {
  // At 640x480 an EAN-13 held at arm's length is a couple of pixels per bar,
  // which no decoder can read — the camera looks fine and nothing ever scans.
  it("asks for a sharp picture, and for the camera facing away from you", () => {
    const video = cameraConstraints().video as MediaTrackConstraints;
    expect(video.facingMode).toBe("environment");
    expect(video.width).toEqual({ ideal: 1920 });
    expect(video.height).toEqual({ ideal: 1080 });
  });

  it("asks rather than demands, so a weaker camera still starts", () => {
    const video = cameraConstraints().video as MediaTrackConstraints;
    expect(JSON.stringify(video)).not.toContain("exact");
  });
});
