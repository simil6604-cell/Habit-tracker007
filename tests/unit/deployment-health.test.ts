import { afterEach, describe, expect, it, vi } from "vitest";
import path from "node:path";

/**
 * The check reads its configuration at module load, so each case loads it
 * fresh with the environment it is meant to describe.
 */
async function warningsWith(env: { NODE_ENV?: string; DATABASE_URL?: string; UPLOAD_DIR?: string }) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", env.NODE_ENV ?? "production");
  vi.stubEnv("DATABASE_URL", env.DATABASE_URL ?? "file:/var/data/prod.db");
  vi.stubEnv("UPLOAD_DIR", env.UPLOAD_DIR ?? "/var/data/uploads");
  const { getDeploymentWarnings } = await import("@/lib/config/deployment-health");
  return getDeploymentWarnings();
}

const inRepo = (...segments: string[]) => path.join(process.cwd(), ...segments);

afterEach(() => vi.unstubAllEnvs());

describe("getDeploymentWarnings", () => {
  it("stays silent when both live on a persistent disk", async () => {
    expect(await warningsWith({})).toEqual([]);
  });

  // This was the app's real state: photos written into the app directory,
  // deleted by every deploy, with nothing anywhere saying so.
  it("warns when uploads sit in the app directory", async () => {
    const [warning, ...rest] = await warningsWith({ UPLOAD_DIR: inRepo("public", "uploads") });
    expect(rest).toHaveLength(0);
    expect(warning.problem).toContain("Uploaded photos are stored inside the app directory");
    expect(warning.problem).toContain("deleted the next time this app deploys");
    expect(warning.fix).toContain("UPLOAD_DIR");
  });

  it("warns when the database sits in the app directory", async () => {
    const [warning, ...rest] = await warningsWith({ DATABASE_URL: `file:${inRepo("prisma", "prod.db")}` });
    expect(rest).toHaveLength(0);
    expect(warning.problem).toContain("database is stored inside the app directory");
    expect(warning.fix).toContain("DATABASE_URL");
  });

  it("warns about each independently when both are wrong", async () => {
    const warnings = await warningsWith({
      DATABASE_URL: `file:${inRepo("prisma", "prod.db")}`,
      UPLOAD_DIR: inRepo("public", "uploads"),
    });
    expect(warnings).toHaveLength(2);
  });

  it("resolves a relative database path before judging it", async () => {
    expect(await warningsWith({ DATABASE_URL: "file:./prisma/prod.db" })).toHaveLength(1);
  });

  it("says nothing about a database it doesn't manage the storage for", async () => {
    expect(await warningsWith({ DATABASE_URL: "postgresql://user:pw@host:5432/db" })).toEqual([]);
  });

  // Writing inside the project is exactly right on your own machine, and a
  // warning that cries wolf in development teaches you to ignore the real one.
  it("keeps quiet in development, where the app directory is the right place", async () => {
    const warnings = await warningsWith({
      NODE_ENV: "development",
      DATABASE_URL: `file:${inRepo("prisma", "dev.db")}`,
      UPLOAD_DIR: inRepo("public", "uploads"),
    });
    expect(warnings).toEqual([]);
  });

  it("falls back to a safe default rather than assuming, when UPLOAD_DIR is unset", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "file:/var/data/prod.db");
    vi.stubEnv("UPLOAD_DIR", "");
    const { getDeploymentWarnings } = await import("@/lib/config/deployment-health");
    // Unset means the in-repo default, which is precisely the risky case.
    expect(getDeploymentWarnings()).toHaveLength(1);
  });
});
