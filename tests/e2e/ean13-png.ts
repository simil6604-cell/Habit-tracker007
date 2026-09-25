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
