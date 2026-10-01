import type { SetupCheck } from "./setup-checks";

/**
 * Does the database actually have the shape this build of the app expects?
 *
 * This is the failure that cost a working feature and looked like a bug in the
 * feature. The league-links panel saved nothing and showed an error; the code
 * was right and the tests were green. The database simply had no FootballLink
 * table, because the deployment's start command never ran `prisma db push` —
 * so every schema change since it was set up is missing from it.
 *
 * Nothing about that is visible. The app boots, every old page works, and only
 * the one feature that touches the new table or column fails, with a message
 * from Prisma that never reaches the screen. The next schema change does it
 * again, somewhere else, and looks like a different bug.
 *
 * So it is checked rather than remembered, against the client generated from
 * the schema this build was compiled from — which cannot drift from the code,
 * the way a hand-written list of tables would.
 */

export type SchemaGap = { table: string; column?: string };

/** A model's table and the columns the app will read and write on it. */
export type ExpectedTable = { table: string; columns: string[] };

/** What the database actually has: table name -> its column names. */
export type ActualTables = Map<string, Set<string>>;

/**
 * Everything the app expects and the database does not have.
 *
 * A missing table is reported once, without also listing each of its columns —
 * "FootballLink is missing" is the fix, and forty column lines underneath it
 * are noise.
 */
export function findSchemaGaps(expected: ExpectedTable[], actual: ActualTables): SchemaGap[] {
  const gaps: SchemaGap[] = [];
  for (const { table, columns } of expected) {
    const have = actual.get(table);
    if (!have) {
      gaps.push({ table });
      continue;
    }
    for (const column of columns) {
      if (!have.has(column)) gaps.push({ table, column });
    }
  }
  return gaps;
}

/** "FootballLink" / "School.timetableImage" — how a gap reads in a sentence. */
export function describeGap(gap: SchemaGap): string {
  return gap.column ? `${gap.table}.${gap.column}` : gap.table;
}

const MAX_NAMED = 6;

/**
 * The Settings row.
 *
 * A gap is always a "fail": it is not a risk to the data but a feature that is
 * already broken, and the person looking at this page is the only one who can
 * fix it.
 */
export function schemaCheck(gaps: SchemaGap[]): SetupCheck {
  if (gaps.length === 0) {
    return {
      id: "schema",
      label: "Database schema",
      status: "ok",
      detail: "The database has every table and column this version of the app uses.",
    };
  }

  const named = gaps.slice(0, MAX_NAMED).map(describeGap).join(", ");
  const rest = gaps.length - MAX_NAMED;
  const list = rest > 0 ? `${named}, and ${rest} more` : named;

  return {
    id: "schema",
    label: "Database schema",
    status: "fail",
    detail:
      `The database is missing ${list}. The app was deployed but the database was never brought up to date with it, ` +
      "so anything that reads or writes those is failing right now — usually as an error with no explanation, on the one screen that uses it.",
    fix: "The start command must apply the schema before the app runs: npx prisma db push --skip-generate && npm run start. On Render that is Settings → Start Command, then redeploy. Nothing is deleted — the tables and columns are added.",
  };
}

/**
 * Turns Prisma's "that table isn't there" into something the person reading it
 * can act on, or null when the failure is anything else.
 *
 * Without this the error leaves the server action unhandled and the screen
 * shows whatever React shows for a thrown action — which is nothing useful,
 * and reads as "this feature is broken" rather than "this deployment is a
 * schema behind". That misreading cost a day: the feature was looked at twice
 * before the database was.
 *
 * P2021 is a missing table, P2022 a missing column. Both mean the same thing
 * here, and both have the same fix.
 */
export function schemaErrorMessage(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code;
  if (code !== "P2021" && code !== "P2022") return null;
  return (
    "Saved nothing — this app's database is a version behind the app itself, so the place this is stored does not exist yet. " +
    "Open Settings: the setup card names what is missing and what to change on your host."
  );
}
