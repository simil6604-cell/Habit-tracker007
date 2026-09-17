import { gzipSync } from "node:zlib";

/**
 * A minimal tar writer, so "download everything" is one file.
 *
 * Written by hand rather than pulled in as a dependency: the format is a
 * 512-byte header per file and the data padded to the same block size, which
 * is less code than reading someone else's options. It produces plain ustar
 * archives — the test extracts one with the system's own tar, which is the
 * only opinion that counts.
 */

export type TarEntry = { name: string; body: Buffer; mtime?: Date };

const BLOCK = 512;

/** An octal field: `digits` octal characters, zero-padded, then a NUL. */
function octal(value: number, digits: number): Buffer {
  return Buffer.from(value.toString(8).padStart(digits, "0") + "\0", "ascii");
}

function writeHeader(entry: TarEntry): Buffer {
  const header = Buffer.alloc(BLOCK);
  const name = Buffer.from(entry.name, "utf8");
  if (name.length > 100) throw new Error(`Archive path too long for tar: ${entry.name}`);

  name.copy(header, 0);
  octal(0o644, 7).copy(header, 100); // mode
  octal(0, 7).copy(header, 108); // uid
  octal(0, 7).copy(header, 116); // gid
  octal(entry.body.length, 11).copy(header, 124);
  octal(Math.floor((entry.mtime ?? new Date()).getTime() / 1000), 11).copy(header, 136);
  header.write("        ", 148, 8, "ascii"); // checksum field counts as spaces while summing
  header.write("0", 156, 1, "ascii"); // typeflag: regular file
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");

  let sum = 0;
  for (const byte of header) sum += byte;
  // The checksum is six octal digits, a NUL, then a space — in that order.
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");

  return header;
}

function padding(length: number): Buffer {
  const remainder = length % BLOCK;
  return remainder === 0 ? Buffer.alloc(0) : Buffer.alloc(BLOCK - remainder);
}

export function createTar(entries: TarEntry[]): Buffer {
  const parts: Buffer[] = [];
  for (const entry of entries) {
    parts.push(writeHeader(entry), entry.body, padding(entry.body.length));
  }
  // Two zero blocks mark the end of the archive.
  parts.push(Buffer.alloc(BLOCK * 2));
  return Buffer.concat(parts);
}

export function createTarGz(entries: TarEntry[]): Buffer {
  return gzipSync(createTar(entries));
}
