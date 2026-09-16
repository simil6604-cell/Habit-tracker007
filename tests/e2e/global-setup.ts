import { execSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Runs once before the whole test suite: points a dedicated SQLite file at the
 * current schema and empties it, so e2e runs never touch your real dev.db and
 * never inherit rows from a previous run. Some records are keyed by name
 * rather than by user — a football team, for one — so leftovers make
 * assertions about what's on screen depend on what earlier runs left behind.
 *
 * The emptying is done with DELETE over a connection rather than by removing
 * the file. `reuseExistingServer` means a Next server from an earlier run may
 * still be holding the old file open: unlinking it would leave that server
 * writing to the now-nameless original while the tests read a fresh one, and
 * the stale rows this is meant to remove would show up anyway.
 */
export default async function globalSetup() {
  const testDbPath = path.join(__dirname, "..", "..", "prisma", "test.db");
  const url = `file:${testDbPath}`;

  execSync("npx prisma db push --skip-generate", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tables = await prisma.$queryRaw<{ name: string }[]>`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%'
    `;
    // Foreign keys off for the duration: the tables reference each other, and
    // there is no delete order that satisfies every constraint.
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
    for (const { name } of tables) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${name}"`);
    }
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
    console.log(`e2e: cleared ${tables.length} tables in ${testDbPath}`);
  } finally {
    await prisma.$disconnect();
  }
}
