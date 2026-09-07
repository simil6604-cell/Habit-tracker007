import { execSync } from "node:child_process";
import path from "node:path";

/**
 * Runs once before the whole test suite. Pushes the Prisma schema to a
 * dedicated test SQLite file so e2e runs never touch your real dev.db.
 */
export default function globalSetup() {
  const testDbPath = path.join(__dirname, "..", "..", "prisma", "test.db");

  execSync("npx prisma db push --skip-generate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: `file:${testDbPath}` },
  });
}
