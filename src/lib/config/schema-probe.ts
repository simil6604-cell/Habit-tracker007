import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { findSchemaGaps, type ActualTables, type ExpectedTable, type SchemaGap } from "./schema-check";

/**
 * What this build of the app expects the database to look like.
 *
 * Read off the generated Prisma client rather than written down here: the
 * client is produced from the same schema the code was compiled against, so
 * this cannot drift. A hand-kept list would be one more thing to forget on the
 * next migration — which is the exact mistake being caught.
 *
 * Only scalar fields. A relation is not a column, and an implicit many-to-many
 * is a table nobody declared.
 */
export function expectedTables(): ExpectedTable[] {
  return Prisma.dmmf.datamodel.models.map((model) => ({
    table: model.dbName ?? model.name,
    columns: model.fields.filter((f) => f.kind === "scalar" || f.kind === "enum").map((f) => f.dbName ?? f.name),
  }));
}

/** Reads the real shape out of SQLite. */
async function actualTables(): Promise<ActualTables> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
  `;

  const actual: ActualTables = new Map();
  for (const { name } of rows) {
    // PRAGMA takes no bound parameters, so the name is interpolated — it comes
    // from sqlite_master itself, never from a request, and is quoted anyway.
    const columns = await prisma.$queryRawUnsafe<{ name: string }[]>(
      `PRAGMA table_info("${name.replace(/"/g, '""')}")`
    );
    actual.set(name, new Set(columns.map((c) => c.name)));
  }
  return actual;
}

/**
 * The gaps, or an empty list if the database cannot be read at all — a server
 * that cannot reach its database has a louder problem than this check, and
 * reporting every table as missing would bury it.
 */
export async function findDeployedSchemaGaps(): Promise<SchemaGap[]> {
  try {
    return findSchemaGaps(expectedTables(), await actualTables());
  } catch {
    return [];
  }
}
