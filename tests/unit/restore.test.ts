import { describe, expect, it } from "vitest";
import { createTarGz } from "@/lib/export/tar";
import { parseBackup, scalars } from "@/lib/export/restore";

/**
 * A restore reads a file the user uploaded. That file may not be a backup at
 * all, and it may be a backup somebody built by hand — so these are the things
 * it must refuse before any of it reaches the database or the filesystem.
 */
const data = (extra: Record<string, unknown> = {}) =>
  Buffer.from(JSON.stringify({ id: "u1", email: "me@example.com", subjects: [], ...extra }), "utf8");

describe("parseBackup", () => {
  it("reads the data file and the photos", () => {
    const archive = createTarGz([
      { name: "momentum-backup-2026-09-17/data.json", body: data() },
      { name: "momentum-backup-2026-09-17/README.txt", body: Buffer.from("notes", "utf8") },
      { name: "momentum-backup-2026-09-17/photos/abc-123.jpg", body: Buffer.alloc(10, 1) },
    ]);
    const result = parseBackup(archive);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.data.email).toBe("me@example.com");
    expect([...result.backup.photos.keys()]).toEqual(["abc-123.jpg"]);
    expect(result.backup.ignored).toEqual([]);
  });

  it("refuses a photo name that would climb out of the folder, and says it left it out", () => {
    const archive = createTarGz([
      { name: "backup/data.json", body: data() },
      { name: "backup/photos/../../../etc/cron.d/evil", body: Buffer.from("* * * * * root sh", "utf8") },
      { name: "backup/photos/..%2Fescape.jpg", body: Buffer.alloc(4) },
      { name: "backup/photos/nested/deeper.jpg", body: Buffer.alloc(4) },
      { name: "backup/../../outside.txt", body: Buffer.alloc(4) },
      { name: "backup/photos/no-extension", body: Buffer.alloc(4) },
      { name: "backup/photos/.hidden.jpg", body: Buffer.alloc(4) },
    ]);
    const result = parseBackup(archive);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...result.backup.photos.keys()]).toEqual([]);
    expect(result.backup.ignored.length).toBe(6);
  });

  it("refuses a file that is not an archive", () => {
    for (const junk of [Buffer.from("hello", "utf8"), Buffer.alloc(0), Buffer.from([0x50, 0x4b, 0x03, 0x04])]) {
      expect(parseBackup(junk).ok).toBe(false);
    }
  });

  it("refuses an archive with no data.json", () => {
    const result = parseBackup(createTarGz([{ name: "backup/photos/a.jpg", body: Buffer.alloc(3) }]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("data.json");
  });

  it("refuses a data file that is not readable, or not an account", () => {
    expect(parseBackup(createTarGz([{ name: "b/data.json", body: Buffer.from("{not json", "utf8") }])).ok).toBe(false);
    expect(parseBackup(createTarGz([{ name: "b/data.json", body: Buffer.from("[]", "utf8") }])).ok).toBe(false);
    expect(parseBackup(createTarGz([{ name: "b/data.json", body: Buffer.from('{"a":1}', "utf8") }])).ok).toBe(false);
  });

  it("takes the first data.json and ignores a second one smuggled in beside it", () => {
    const result = parseBackup(
      createTarGz([
        { name: "backup/data.json", body: data({ theme: "dark" }) },
        { name: "backup/data.json", body: data({ theme: "light" }) },
      ])
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.backup.data.theme).toBe("dark");
  });
});

/**
 * The rows in a backup carry their relations as well as their own columns, and
 * Prisma refuses both on a create. An empty relation is the trap: `school:
 * null` is indistinguishable in shape from a nullable column like `weightKg:
 * null`, and passing it through fails the whole restore at the first row —
 * which is exactly how this broke the first time.
 */
describe("scalars", () => {
  it("drops relations, including the empty ones, and keeps nullable columns", () => {
    const row = scalars({
      id: "u1",
      name: "Me",
      weightKg: null,
      targetWeightKg: 72,
      dailyCalorieGoal: null,
      school: null,
      team: null,
      subject: null,
      subjects: [{ id: "s1" }],
      topics: [],
      footballProfile: { id: "p1" },
    });

    expect(row).toEqual({
      id: "u1",
      name: "Me",
      weightKg: null,
      targetWeightKg: 72,
      dailyCalorieGoal: null,
    });
  });

  it("adds the owner, and refuses anything that is not a row", () => {
    expect(scalars({ name: "x" }, { userId: "me" })).toEqual({ name: "x", userId: "me" });
    expect(scalars(null)).toBeNull();
    expect(scalars([1, 2])).toBeNull();
    expect(scalars("nope")).toBeNull();
  });
});
