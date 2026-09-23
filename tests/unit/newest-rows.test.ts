import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Walks every Prisma query in the app and fails on the one shape that is
 * almost always a bug: `orderBy: { createdAt: "asc" }` together with a `take`.
 *
 * That combination returns the OLDEST N rows. Every place it appeared wanted
 * the newest N — a chat thread, a tutor's recent context. The failure has no
 * symptom until the row count crosses the limit, and then the feature simply
 * stops: new rows are written, and never appear. Nothing errors, nothing logs.
 *
 * Ordering ascending by a *meaningful* field and taking N is a different thing
 * and stays allowed — the soonest exams by date, the weakest topics by
 * progress. Only recency-by-creation is caught here.
 */

const SRC = path.join(__dirname, "..", "..", "src");

/** Queries that really do want the oldest rows, each with the reason. */
const ALLOWED: Record<string, string> = {};

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

/** The `{...}` argument of every prisma.<model>.findMany( call, by brace counting. */
function findManyArgs(src: string): { model: string; args: string; line: number }[] {
  const found: { model: string; args: string; line: number }[] = [];
  for (const match of src.matchAll(/prisma\.(\w+)\.findMany\(/g)) {
    const open = src.indexOf("{", match.index + match[0].length - 1);
    if (open === -1) continue;
    let depth = 0;
    let close = src.length;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) {
        close = i;
        break;
      }
    }
    found.push({
      model: match[1],
      args: src.slice(open, close + 1),
      line: src.slice(0, match.index).split("\n").length,
    });
  }
  return found;
}

const offenders: string[] = [];
for (const file of tsFiles(SRC)) {
  for (const { model, args, line } of findManyArgs(readFileSync(file, "utf8"))) {
    if (!/\btake\s*:/.test(args)) continue;
    if (!/createdAt\s*:\s*"asc"/.test(args)) continue;
    const where = `${path.relative(path.join(SRC, ".."), file)}:${line} (${model})`;
    if (where in ALLOWED) continue;
    offenders.push(where);
  }
}

describe("a capped list takes the newest rows, not the oldest", () => {
  it("finds queries to check at all", () => {
    // A regex that matched nothing would make the test below pass forever.
    const all = tsFiles(SRC).flatMap((f) => findManyArgs(readFileSync(f, "utf8")));
    expect(all.length).toBeGreaterThan(20);
    expect(all.filter((q) => /\btake\s*:/.test(q.args)).length).toBeGreaterThan(5);
  });

  it("has no query taking the oldest rows by creation time", () => {
    expect(offenders, `these take the OLDEST rows; order desc and reverse:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("still allows ordering ascending by a field that means something", () => {
    // The soonest exams and the weakest topics are ascending-plus-take on
    // purpose. If this ever goes to zero the rule has been written too wide.
    const meaningful = tsFiles(SRC)
      .flatMap((f) => findManyArgs(readFileSync(f, "utf8")))
      .filter((q) => /\btake\s*:/.test(q.args) && /"asc"/.test(q.args) && !/createdAt\s*:\s*"asc"/.test(q.args));
    expect(meaningful.length).toBeGreaterThan(0);
  });

  it("explains every exception, so the list cannot become a place to hide things", () => {
    for (const [where, reason] of Object.entries(ALLOWED)) {
      expect(reason.length, where).toBeGreaterThan(20);
    }
  });
});
