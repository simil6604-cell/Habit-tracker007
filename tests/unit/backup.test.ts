import { describe, expect, it } from "vitest";
import { stripSensitive } from "@/lib/export/backup";

/**
 * The backup is a file the user is told to keep somewhere else — emailed to
 * themselves, dropped in a cloud folder. So what it must NOT contain is as
 * much part of the feature as what it must.
 */
describe("stripSensitive", () => {
  it("removes the password hash and the sign-in rows, wherever they sit", () => {
    const out = stripSensitive({
      id: "u1",
      email: "me@example.com",
      passwordHash: "$2a$10$notinthebackup",
      accounts: [{ id: "a1", access_token: "secret" }],
      sessions: [{ sessionToken: "secret" }],
      subjects: [{ id: "s1", name: "Maths", user: { passwordHash: "nested-too" } }],
    }) as Record<string, unknown>;

    expect(out.email).toBe("me@example.com");
    expect(out.passwordHash).toBeUndefined();
    expect(out.accounts).toBeUndefined();
    expect(out.sessions).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain("notinthebackup");
    expect(JSON.stringify(out)).not.toContain("nested-too");
    expect(JSON.stringify(out)).not.toContain("secret");
  });

  it("keeps everything else, including inside arrays", () => {
    const out = stripSensitive({
      subjects: [
        { id: "s1", name: "Maths", topics: [{ id: "t1", name: "Vectors", progressPct: 40 }] },
        { id: "s2", name: "Physics", topics: [] },
      ],
    }) as { subjects: { name: string; topics: { name: string; progressPct: number }[] }[] };

    expect(out.subjects.map((s) => s.name)).toEqual(["Maths", "Physics"]);
    expect(out.subjects[0].topics[0]).toEqual({ id: "t1", name: "Vectors", progressPct: 40 });
  });

  it("writes dates as ISO strings, so the file is readable without Prisma", () => {
    const out = stripSensitive({ createdAt: new Date("2026-09-17T10:20:30.000Z") }) as { createdAt: string };
    expect(out.createdAt).toBe("2026-09-17T10:20:30.000Z");
  });

  it("leaves nulls and empty values alone rather than inventing data", () => {
    expect(stripSensitive({ weightKg: null, caption: "", photos: [] })).toEqual({
      weightKg: null,
      caption: "",
      photos: [],
    });
  });
});
