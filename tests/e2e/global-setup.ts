import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Runs once before the whole test suite. Recreates a dedicated test SQLite file
 * from the Prisma schema, so e2e runs never touch your real dev.db and never
 * inherit rows from a previous run. Some records are keyed by name rather than
 * by user — a football team, for one — so a stale file makes assertions about
 * what's on screen depend on what earlier runs happened to leave behind.
 */
export default function globalSetup() {
  const testDbPath = path.join(__dirname, "..", "..", "prisma", "test.db");

  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    fs.rmSync(`${testDbPath}${suffix}`, { force: true });
  }

  execSync("npx prisma db push --skip-generate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: `file:${testDbPath}` },
  });
}
