import { gunzipSync, gzipSync } from "node:zlib";

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

function readOctal(block: Buffer, offset: number, length: number): number {
  // Fields are octal digits terminated by a NUL or a space; some writers pad
  // with spaces on the left as well.
  const raw = block.subarray(offset, offset + length).toString("ascii").replace(/\0.*$/, "").trim();
  if (!raw) return 0;
  const value = parseInt(raw, 8);
  return Number.isFinite(value) ? value : 0;
}

function cString(block: Buffer, offset: number, length: number): string {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString("utf8");
}

/**
 * Reads a tar archive back into its entries.
 *
 * Only regular files are returned: a restore has no business creating
 * symlinks, devices or directories out of a file someone uploaded. Entry names
 * are handed back exactly as stored — deciding which of them is acceptable is
 * the caller's job, and the caller has more context for it than this does.
 */
export function readTar(archive: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + BLOCK);
    // A block of zeros ends the archive.
    if (header.every((byte) => byte === 0)) break;

    const name = cString(header, 0, 100);
    const prefix = cString(header, 345, 155);
    const size = readOctal(header, 124, 12);
    const mtime = readOctal(header, 136, 12);
    const typeflag = String.fromCharCode(header[156] || 0x30);

    const dataStart = offset + BLOCK;
    const dataEnd = dataStart + size;
    if (dataEnd > archive.length) throw new Error("Archive is truncated.");

    // "0" and "\0" both mean a regular file; anything else is skipped.
    if (typeflag === "0" || typeflag === "\0") {
      entries.push({
        name: prefix ? `${prefix}/${name}` : name,
        body: Buffer.from(archive.subarray(dataStart, dataEnd)),
        mtime: new Date(mtime * 1000),
      });
    }

    offset = dataEnd + (size % BLOCK === 0 ? 0 : BLOCK - (size % BLOCK));
  }

  return entries;
}

/**
 * The largest archive this will unpack, in bytes once decompressed.
 *
 * Compression ratios are unbounded, so a small upload can decompress to
 * anything: a few hundred kilobytes of gzipped zeros becomes gigabytes, and
 * unpacking it into memory takes the whole app down with it. A limit on the
 * uploaded file says nothing about that — only a limit on the output does.
 * 200MB is far more than a real backup of one person's school years, photos
 * included.
 */
export const MAX_UNPACKED_BYTES = 200 * 1024 * 1024;

export function readTarGz(archive: Buffer, maxUnpackedBytes = MAX_UNPACKED_BYTES): TarEntry[] {
  // Not a gzip file? Then it was never one of ours.
  if (archive.length < 2 || archive[0] !== 0x1f || archive[1] !== 0x8b) {
    throw new Error("That file isn't a .tar.gz archive.");
  }
  let unpacked: Buffer;
  try {
    unpacked = gunzipSync(archive, { maxOutputLength: maxUnpackedBytes });
  } catch (err) {
    // Node throws ERR_BUFFER_TOO_LARGE once the output passes the limit, which
    // is a different thing from a corrupt file and worth saying separately.
    if (err instanceof Error && "code" in err && err.code === "ERR_BUFFER_TOO_LARGE") {
      throw new Error("That backup unpacks to more than this app will read at once.");
    }
    throw new Error("That file isn't a .tar.gz archive.");
  }
  return readTar(unpacked);
}
