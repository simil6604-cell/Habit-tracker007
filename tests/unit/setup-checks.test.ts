import { describe, expect, it } from "vitest";
import {
  aiCheck,
  backupCheck,
  databaseCheck,
  photoFilesCheck,
  photoStorageCheck,
  summarize,
  type SetupCheck,
} from "@/lib/config/setup-checks";
import type { AIHealth } from "@/lib/ai/health";

const cwd = "/srv/app";

/**
 * These checks exist to catch the one failure this app has actually shipped:
 * photos written inside the app directory, deleted by the next deploy, with
 * every row still pointing at them. So the tests are mostly about that
 * distinction being made correctly, and about the wording being something a
 * person can act on.
 */
describe("photoStorageCheck", () => {
  it("fails a production path inside the app directory", () => {
    const check = photoStorageCheck("/srv/app/.data/uploads", true, cwd);
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("deploy");
    expect(check.fix).toContain("UPLOAD_DIR");
  });

  it("passes a production path on a separate disk", () => {
    expect(photoStorageCheck("/var/data/uploads", true, cwd).status).toBe("ok");
  });

  it("judges a relative path against the directory it is comparing to", () => {
    // Resolving the target against the real working directory while comparing
    // it to another one calls the app's own folder "outside the app".
    expect(photoStorageCheck(".data/uploads", true, cwd).status).toBe("fail");
  });

  it("does not complain on a developer's own machine", () => {
    // Writing inside the project is exactly what you want locally.
    expect(photoStorageCheck("/srv/app/.data/uploads", false, cwd).status).toBe("ok");
  });
});

describe("photoFilesCheck", () => {
  it("says nothing is at risk when there are no photos", () => {
    expect(photoFilesCheck({ total: 0, missing: 0 }).status).toBe("ok");
  });

  it("confirms the files are there when they are", () => {
    const check = photoFilesCheck({ total: 12, missing: 0 });
    expect(check.status).toBe("ok");
    expect(check.detail).toContain("12");
  });

  it("fails loudly when rows point at files that are gone", () => {
    const check = photoFilesCheck({ total: 12, missing: 3 });
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("3 of 12");
    expect(check.fix).toContain("backup");
  });

  it("says how many it looked at when it did not look at all of them", () => {
    // "All 4000 are fine" after checking 600 is exactly the false reassurance
    // this card exists to replace.
    const check = photoFilesCheck({ total: 4000, missing: 0, checked: 600 });
    expect(check.status).toBe("ok");
    expect(check.detail).toContain("600 most recent");
    expect(check.detail).toContain("4000");
  });

  it("reads correctly for a single photo", () => {
    expect(photoFilesCheck({ total: 1, missing: 0 }).detail).toMatch(/1 saved photo is/);
    expect(photoFilesCheck({ total: 1, missing: 1 }).detail).toMatch(/1 of 1 saved photo is missing/);
  });
});

describe("databaseCheck", () => {
  it("fails a production SQLite file inside the app directory", () => {
    expect(databaseCheck("file:/srv/app/prisma/prod.db", true, cwd).status).toBe("fail");
  });

  it("resolves a relative path against prisma/, the way Prisma does", () => {
    // file:./dev.db means prisma/dev.db — resolving it against the working
    // directory would check a file that does not exist and pass by accident.
    const check = databaseCheck("file:./dev.db", true, cwd);
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("/srv/app/prisma/dev.db");
  });

  it("passes a database on the persistent disk", () => {
    expect(databaseCheck("file:/var/data/prod.db", true, cwd).status).toBe("ok");
  });

  it("has nothing to say about a database that is not a file", () => {
    expect(databaseCheck("postgresql://user@host/db", true, cwd).status).toBe("ok");
  });
});

describe("aiCheck", () => {
  const health = (over: Partial<AIHealth>): AIHealth => ({
    ok: true,
    problem: null,
    fix: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    failuresSinceSuccess: 0,
    ...over,
  });

  it("passes on a working AI and says whether it has been used", () => {
    expect(aiCheck(health({ lastSuccessAt: new Date() })).detail).toMatch(/last call went through/);
    expect(aiCheck(health({})).detail).toMatch(/Nothing has called the AI yet/);
  });

  it("repeats the real problem rather than inventing a generic one", () => {
    const check = aiCheck(health({ ok: false, problem: "No AI key reached the app.", fix: "Add ANTHROPIC_API_KEY." }));
    expect(check.status).toBe("warn");
    expect(check.detail).toBe("No AI key reached the app.");
    expect(check.fix).toBe("Add ANTHROPIC_API_KEY.");
  });
});

describe("backupCheck", () => {
  const now = new Date("2026-09-21T09:00:00");
  const daysAgo = (days: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    return date;
  };

  it("warns when there has never been one", () => {
    const check = backupCheck(null, now);
    expect(check.status).toBe("warn");
    expect(check.detail).toMatch(/only copy/);
  });

  it("passes on a recent one", () => {
    expect(backupCheck(daysAgo(2), now).status).toBe("ok");
  });

  it("warns again once it is stale", () => {
    expect(backupCheck(daysAgo(60), now).status).toBe("warn");
  });
});

describe("summarize", () => {
  const check = (status: SetupCheck["status"]): SetupCheck => ({ id: "x", label: "x", status, detail: "x" });

  it("leads with the worst thing in the list", () => {
    expect(summarize([check("ok"), check("warn"), check("fail")]).status).toBe("fail");
    expect(summarize([check("ok"), check("warn")]).status).toBe("warn");
    expect(summarize([check("ok"), check("ok")]).status).toBe("ok");
  });

  it("says what it means without a status code", () => {
    expect(summarize([check("fail")]).label).toMatch(/lose data/);
    expect(summarize([check("ok")]).label).toMatch(/checks out/);
  });
});
