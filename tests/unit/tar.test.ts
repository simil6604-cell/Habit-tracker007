import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTar, createTarGz } from "@/lib/export/tar";

/**
 * The archive is only worth anything if the user's own computer can open it,
 * so this does not check the bytes against my idea of the format — it hands
 * the file to the system's tar and reads back what came out.
 */
function extract(archive: Buffer, filename: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "momentum-tar-"));
  const file = path.join(dir, filename);
  writeFileSync(file, archive);
  execFileSync("tar", ["-xf", file, "-C", dir]);
  return dir;
}

describe("createTar", () => {
  it("writes an archive the system tar can extract", () => {
    const archive = createTar([
      { name: "backup/data.json", body: Buffer.from('{"hello":"world"}', "utf8") },
      { name: "backup/photos/one.jpg", body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) },
    ]);
    const dir = extract(archive, "backup.tar");

    expect(readFileSync(path.join(dir, "backup", "data.json"), "utf8")).toBe('{"hello":"world"}');
    expect(readdirSync(path.join(dir, "backup", "photos"))).toEqual(["one.jpg"]);
    expect([...readFileSync(path.join(dir, "backup", "photos", "one.jpg"))]).toEqual([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  });

  it("survives sizes that do not land on a block boundary", () => {
    // 512 bytes per block — the sizes most likely to break padding.
    for (const size of [0, 1, 511, 512, 513, 1024, 5000]) {
      const body = Buffer.alloc(size, 0x41);
      const dir = extract(createTar([{ name: "backup/blob.bin", body }]), "blob.tar");
      const out = readFileSync(path.join(dir, "backup", "blob.bin"));
      expect(out.length, `size ${size}`).toBe(size);
      expect(out.equals(body), `size ${size}`).toBe(true);
    }
  });

  it("keeps UTF-8 content byte-for-byte", () => {
    const body = Buffer.from("Mathematik — Übung: 25 % schneller ✅", "utf8");
    const dir = extract(createTar([{ name: "backup/notes.txt", body }]), "utf8.tar");
    expect(readFileSync(path.join(dir, "backup", "notes.txt"), "utf8")).toBe(body.toString("utf8"));
  });

  it("gzips into something tar reads as a compressed archive", () => {
    const archive = createTarGz([{ name: "backup/data.json", body: Buffer.from("[]", "utf8") }]);
    expect(archive[0]).toBe(0x1f); // gzip magic
    expect(archive[1]).toBe(0x8b);
    const dir = extract(archive, "backup.tar.gz");
    expect(readFileSync(path.join(dir, "backup", "data.json"), "utf8")).toBe("[]");
  });

  it("refuses a path too long for the format instead of writing a broken archive", () => {
    expect(() => createTar([{ name: `backup/${"a".repeat(200)}.json`, body: Buffer.alloc(1) }])).toThrow(/too long/);
  });
});
