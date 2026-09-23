import { crc32, deflateSync } from "node:zlib";

/**
 * A real, valid PNG of roughly the size a phone camera produces.
 *
 * The 1x1 PNGs the rest of the suite uses are about seventy bytes, which is
 * why they never noticed that Next.js rejects a Server Action body over 1MB
 * with a 413 — every upload in this app is a Server Action, and every photo
 * off a phone is several megabytes. A test photo has to actually be big, and
 * it has to be big the way a photograph is: random pixels, so it survives
 * PNG's compression instead of shrinking back to nothing.
 */
function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

export function makeNoisyPng(width: number, height: number, seed = 1): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  // 10-12: compression, filter, interlace — all 0

  // A cheap deterministic PRNG: reproducible across runs, and random enough
  // that deflate can't squeeze it, which is the whole point.
  let state = seed >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state >>> 24) & 0xff;
  };

  const raw = Buffer.alloc(height * (1 + width * 3));
  let at = 0;
  for (let y = 0; y < height; y++) {
    raw[at++] = 0; // filter: none
    for (let x = 0; x < width * 3; x++) raw[at++] = next();
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 1 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
