import { describe, it, expect } from "vitest";
import {
  findSchemaGaps,
  describeGap,
  schemaCheck,
  schemaErrorMessage,
  type ActualTables,
} from "@/lib/config/schema-check";

const db = (shape: Record<string, string[]>): ActualTables =>
  new Map(Object.entries(shape).map(([table, columns]) => [table, new Set(columns)]));

describe("findSchemaGaps", () => {
  const expected = [
    { table: "FootballLink", columns: ["id", "userId", "url"] },
    { table: "School", columns: ["id", "userId", "timetableImage"] },
  ];

  it("finds nothing when the database matches", () => {
    expect(
      findSchemaGaps(expected, db({ FootballLink: ["id", "userId", "url"], School: ["id", "userId", "timetableImage"] }))
    ).toEqual([]);
  });

  it("reports a table the deploy never created", () => {
    const gaps = findSchemaGaps(expected, db({ School: ["id", "userId", "timetableImage"] }));
    expect(gaps).toEqual([{ table: "FootballLink" }]);
  });

  it("reports a column added to a table that already existed", () => {
    // The quieter half of the same failure: the table is there, so nothing
    // looks wrong until the one feature that uses the new column runs.
    const gaps = findSchemaGaps(expected, db({ FootballLink: ["id", "userId", "url"], School: ["id", "userId"] }));
    expect(gaps).toEqual([{ table: "School", column: "timetableImage" }]);
  });

  it("names a missing table once, not once per column it would have had", () => {
    const gaps = findSchemaGaps(expected, db({ School: ["id", "userId", "timetableImage"] }));
    expect(gaps).toHaveLength(1);
  });

  it("ignores tables the database has and the app does not know about", () => {
    const actual = db({
      FootballLink: ["id", "userId", "url"],
      School: ["id", "userId", "timetableImage"],
      _prisma_migrations: ["id"],
    });
    expect(findSchemaGaps(expected, actual)).toEqual([]);
  });
});

describe("describeGap", () => {
  it("names a table on its own and a column with its table", () => {
    expect(describeGap({ table: "FootballLink" })).toBe("FootballLink");
    expect(describeGap({ table: "School", column: "timetableImage" })).toBe("School.timetableImage");
  });
});

describe("schemaCheck", () => {
  it("passes quietly when nothing is missing", () => {
    const check = schemaCheck([]);
    expect(check.status).toBe("ok");
    expect(check.fix).toBeUndefined();
  });

  it("fails, names what is missing, and gives the command that fixes it", () => {
    const check = schemaCheck([{ table: "FootballLink" }, { table: "School", column: "timetableImage" }]);
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("FootballLink");
    expect(check.detail).toContain("School.timetableImage");
    expect(check.fix).toContain("prisma db push");
  });

  it("says nothing is deleted, because that is the fear that stops someone running it", () => {
    expect(schemaCheck([{ table: "FootballLink" }]).fix).toMatch(/nothing is deleted/i);
  });

  it("counts the rest instead of printing forty names", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ table: `T${i}` }));
    const check = schemaCheck(many);
    expect(check.detail).toContain("T0");
    expect(check.detail).toContain("and 4 more");
    expect(check.detail).not.toContain("T9");
  });
});

describe("schemaErrorMessage", () => {
  it("recognises a missing table and a missing column", () => {
    expect(schemaErrorMessage({ code: "P2021" })).toContain("Settings");
    expect(schemaErrorMessage({ code: "P2022" })).toContain("Settings");
  });

  it("leaves every other failure alone, so a real bug is not dressed up as this one", () => {
    expect(schemaErrorMessage({ code: "P2002" })).toBeNull();
    expect(schemaErrorMessage(new Error("connection reset"))).toBeNull();
    expect(schemaErrorMessage(null)).toBeNull();
    expect(schemaErrorMessage(undefined)).toBeNull();
  });
});

/**
 * The half that cannot be faked: what the app expects is read off the client
 * generated from the schema, so a model added tomorrow is covered without
 * anyone remembering to add it here.
 */
describe("expectedTables", () => {
  it("knows every model in the schema, including the one this check was written for", async () => {
    const { expectedTables } = await import("@/lib/config/schema-probe");
    const tables = expectedTables();
    const byName = new Map(tables.map((t) => [t.table, t.columns]));

    expect(byName.has("FootballLink"), "FootballLink").toBe(true);
    expect(byName.get("FootballLink")).toEqual(expect.arrayContaining(["id", "userId", "kind", "title", "url"]));
    // The quiet half: a column added to a table that already existed.
    expect(byName.get("School")).toContain("timetableImage");
    expect(tables.length).toBeGreaterThan(40);
  });

  it("asks for columns, not relations — a relation is not something SQLite has", async () => {
    const { expectedTables } = await import("@/lib/config/schema-probe");
    const footballLink = expectedTables().find((t) => t.table === "FootballLink")!;
    expect(footballLink.columns).not.toContain("user");
  });

  it("finds the real gap when the real table is missing", async () => {
    const { expectedTables } = await import("@/lib/config/schema-probe");
    const tables = expectedTables();
    // A database that has everything except the table a deploy would have added.
    const actual: ActualTables = new Map(
      tables.filter((t) => t.table !== "FootballLink").map((t) => [t.table, new Set(t.columns)])
    );
    expect(findSchemaGaps(tables, actual)).toEqual([{ table: "FootballLink" }]);
  });
});
