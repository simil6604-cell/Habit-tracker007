import { crc32, deflateSync } from "node:zlib";

/**
 * A real, scannable EAN-13 barcode as a PNG.
 *
 * The scanner's photo path is the one someone actually uses on a phone, so the
 * test has to hand it a picture a decoder can genuinely read — not a stand-in.
 * This draws the bar pattern itself, at a size and with the quiet zones a real
 * label has.
 */
const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];

export function ean13Bits(code: string): string {
  const d = [...code].map(Number);
  const parity = PARITY[d[0]];
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[d[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return bits + "101";
}

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

export function ean13Png(code: string, scale = 4, height = 160, quiet = 40): Buffer {
  const bits = ean13Bits(code);
  const width = quiet * 2 + bits.length * scale;

  // Greyscale, 8 bit. One filter byte per row, then one byte per pixel.
  const raw = Buffer.alloc(height * (1 + width), 0xff);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width);
    raw[rowStart] = 0;
    for (let x = 0; x < bits.length; x++) {
      if (bits[x] !== "1") continue;
      for (let s = 0; s < scale; s++) raw[rowStart + 1 + quiet + x * scale + s] = 0x00;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type: greyscale

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * What a photo of a barcode actually looks like.
 *
 * The barcode above is the ideal case: crisp, black on white, filling the
 * frame. A phone never produces that. It produces a big picture of a packet
 * on a table, with the barcode somewhere in it, a fraction of the width,
 * often turned on its side because that is how the label sits.
 *
 * So this composes one: a large grey-ish noisy frame with the bars placed
 * inside it at a given size, position and rotation. It is the picture the
 * decoder has to cope with, and the one it used to fail on.
 */
export function barcodePhotoPng(
  code: string,
  options: {
    width?: number;
    height?: number;
    /** How wide the barcode is, as a fraction of the picture. */
    fraction?: number;
    /** Turned a quarter turn, the way a label on a shelf often is. */
    rotated?: boolean;
    /** Where the middle of the barcode sits, 0..1 of the picture. */
    at?: { x: number; y: number };
  } = {}
): Buffer {
  const width = options.width ?? 1400;
  const height = options.height ?? 1000;
  const fraction = options.fraction ?? 0.3;
  const at = options.at ?? { x: 0.5, y: 0.5 };

  const bits = ean13Bits(code);
  // The barcode's own pixel grid, before it is placed.
  const span = options.rotated ? height * fraction : width * fraction;
  const scale = Math.max(1, Math.round(span / bits.length));
  const barsWide = bits.length * scale;
  const barsTall = Math.max(24, Math.round(barsWide * 0.45));
  // A real label has white around the bars; without it nothing decodes.
  const quiet = Math.max(8, scale * 10);
  const labelW = barsWide + quiet * 2;
  const labelH = barsTall + quiet;

  const pixel = new Uint8Array(width * height);
  // A table top: light, uneven, with grain — not a clean white page.
  for (let i = 0; i < pixel.length; i++) {
    pixel[i] = 150 + ((i * 2654435761) % 60);
  }

  const put = (x: number, y: number, value: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    pixel[y * width + x] = value;
  };

  const centreX = Math.round(width * at.x);
  const centreY = Math.round(height * at.y);
  // Drawn in the label's own coordinates, then placed — rotated or not.
  for (let ly = 0; ly < labelH; ly++) {
    for (let lx = 0; lx < labelW; lx++) {
      const inBars = lx >= quiet && lx < quiet + barsWide && ly >= quiet / 2 && ly < quiet / 2 + barsTall;
      const bit = inBars ? bits[Math.floor((lx - quiet) / scale)] : "0";
      const value = inBars && bit === "1" ? 0x14 : 0xf2;
      const dx = lx - labelW / 2;
      const dy = ly - labelH / 2;
      if (options.rotated) put(centreX + Math.round(dy), centreY + Math.round(-dx), value);
      else put(centreX + Math.round(dx), centreY + Math.round(dy), value);
    }
  }

  const raw = Buffer.alloc(height * (1 + width));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) raw[rowStart + 1 + x] = pixel[y * width + x];
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
