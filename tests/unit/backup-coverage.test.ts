import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Walks the schema on every run and fails when a table this account owns is
 * missing from the backup, the wipe, or the restore.
 *
 * This is the bug class that has no symptom until it matters. A new model gets
 * added, the feature works, the backup downloads without complaint — and the
 * day someone restores it, that feature's data is simply not there. It cost
 * the timetable once already (three separate faces of the same miss), and it
 * had just cost the school-AI conversation and the saved drill videos when
 * this test was written.
 */

const root = path.join(__dirname, "..", "..");
const schema = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
const backupSrc = readFileSync(path.join(root, "src", "lib", "export", "backup.ts"), "utf8");
const restoreSrc = readFileSync(path.join(root, "src", "lib", "export", "restore.ts"), "utf8");

/** Tables deliberately left out, each with the reason it is not an oversight. */
const EXCLUDED: Record<string, string> = {
  Account: "sign-in credentials — stripped from every backup on purpose",
  Session: "live sign-in sessions — stripped from every backup on purpose",
  TimetableSlot:
    "has a userId but no relation on User, so it cannot be included through the user query — loaded and restored by its own query instead",
};

type Model = { name: string; body: string };

const models: Model[] = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => ({
  name: m[1],
  body: m[2],
}));

const userBody = models.find((m) => m.name === "User")?.body ?? "";

/** The field name a model hangs off User by, e.g. SchoolAIMessage → schoolAIMessages. */
function relationField(model: string): string | null {
  const match = userBody.match(new RegExp(`^\\s*(\\w+)\\s+${model}(\\[\\]|\\?)?\\s*$`, "m"));
  return match ? match[1] : null;
}

/** How Prisma Client names the model: first letter lowercased. */
function clientName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

const ownedModels = models.filter((m) => m.name !== "User" && /^\s*userId\s+String/m.test(m.body)).map((m) => m.name);

const covered = ownedModels.filter((m) => !(m in EXCLUDED));

describe("every table this account owns is in the backup", () => {
  it("finds the schema's user-owned tables at all", () => {
    // A regex that silently matched nothing would make every test below pass.
    expect(ownedModels).toContain("Subject");
    expect(ownedModels).toContain("SchoolAIMessage");
    expect(ownedModels.length).toBeGreaterThan(20);
  });

  it.each(covered)("%s hangs off User, so the backup query can reach it", (model) => {
    expect(relationField(model), model).not.toBeNull();
  });

  it.each(covered)("%s is included in the backup", (model) => {
    const field = relationField(model);
    expect(field, model).not.toBeNull();
    // Included directly, or nested under a parent that is (topics under
    // subjects, set logs under sessions, and so on).
    expect(backupSrc, `${model} (${field}) missing from loadBackupData`).toMatch(
      new RegExp(`\\b${field}:\\s*(true|\\{)`)
    );
  });

  it.each(covered)("%s is wiped before a restore writes over it", (model) => {
    expect(restoreSrc, `${model} missing from the restore wipe`).toContain(
      `tx.${clientName(model)}.deleteMany({ where: { userId } })`
    );
  });

  it.each(covered)("%s is written back by a restore", (model) => {
    expect(restoreSrc, `${model} is never created during a restore`).toContain(`tx.${clientName(model)}.create(`);
  });

  it("explains every exclusion, so the list can't become a place to hide things", () => {
    for (const [model, reason] of Object.entries(EXCLUDED)) {
      expect(ownedModels, `${model} is excluded but no longer exists`).toContain(model);
      expect(reason.length, model).toBeGreaterThan(20);
    }
  });
});
