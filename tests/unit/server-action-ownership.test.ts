import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Every server action that takes a row id from the caller must prove the row
 * belongs to whoever is signed in.
 *
 * A photo-serving route recently shipped with a guard that could never fire,
 * and one account could read another's private photos. That was found by
 * review, by chance. This walks the whole surface instead: 125-odd actions,
 * each reachable by anyone signed in, each one id away from the same bug.
 *
 * It is a static check on source text, so it can only be a good heuristic. It
 * is deliberately noisy rather than lenient: an action it cannot see the guard
 * in must be listed below with the reason, which is a small cost against
 * silently shipping the next one.
 */

/** Actions that run before anyone is signed in, so there is no user to check. */
const PRE_AUTH: Record<string, string> = {
  registerAction: "creates the account — by definition there is no session yet",
};

/** Actions whose ownership check the scan cannot see, each verified by hand. */
const VERIFIED_SAFE: Record<string, string> = {
  // loadTopicContext(topicId, userId) returns null unless the topic belongs to
  // the user, and the function returns before the update.
  submitMistake: "guarded by loadTopicContext(topicId, userId) returning null first",
};

function serverActionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return serverActionFiles(full);
    if (!full.endsWith(".ts")) return [];
    return readFileSync(full, "utf8").includes('"use server"') ? [full] : [];
  });
}

/** The body of a function, by brace counting from its signature. */
function bodyAfter(src: string, from: number): string {
  const start = src.indexOf("{", from);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

const QUERY_METHODS = "findFirst|findUnique|findMany|update|updateMany|delete|deleteMany|count";

/** Scoped to the signed-in user, directly or through a relation like { profile: { userId } }. */
function isOwnershipScoped(statement: string): boolean {
  return /userId/.test(statement);
}

/**
 * Every prisma query in a body, matched by counting parentheses rather than by
 * a regex over the argument.
 *
 * A pattern requiring a closing brace on its own line silently skips
 * `prisma.task.delete({ where: { id } })` written on one line — which is how
 * this check first passed a deliberately unguarded action.
 */
function prismaQueries(body: string): string[] {
  const queries: string[] = [];
  const opener = new RegExp(`prisma\\.\\w+\\.(?:${QUERY_METHODS})\\(`, "g");
  for (const match of body.matchAll(opener)) {
    let depth = 0;
    for (let i = match.index! + match[0].length - 1; i < body.length; i++) {
      if (body[i] === "(") depth++;
      else if (body[i] === ")" && --depth === 0) {
        queries.push(body.slice(match.index!, i + 1));
        break;
      }
    }
  }
  return queries;
}

type Action = { file: string; name: string; body: string; params: string };

function allActions(): Action[] {
  const found: Action[] = [];
  for (const file of serverActionFiles("src/lib")) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/export async function (\w+)\(([^)]*)\)/g)) {
      found.push({ file, name: m[1], params: m[2], body: bodyAfter(src, m.index! + m[0].length - 1) });
    }
  }
  return found;
}

const ACTIONS = allActions();

describe("server actions", () => {
  it("finds the action surface at all, so a passing run means something", () => {
    expect(ACTIONS.length).toBeGreaterThan(50);
  });

  it("every action that touches the database establishes who is asking", () => {
    const anonymous = ACTIONS.filter(
      (a) => /prisma\.\w+\./.test(a.body) && !/requireUserId|auth\(\)/.test(a.body) && !PRE_AUTH[a.name]
    ).map((a) => `${a.file} → ${a.name}()`);
    expect(anonymous).toEqual([]);
  });

  it("every action taking a row id scopes its query to that user", () => {
    const unscoped: string[] = [];

    for (const action of ACTIONS) {
      if (!/\b\w*[Ii]d\s*:/.test(action.params)) continue; // takes no id
      if (VERIFIED_SAFE[action.name]) continue;

      // The common shape here is fetch-then-write: read the row scoped to the
      // user, bail if it isn't theirs, then write by id alone. That write is
      // safe, so an action counts as guarded once an ownership-scoped query
      // has run before it. This cannot tell that the *same* id was the one
      // checked — a static read of source text can't — but it does catch the
      // case that matters: a caller-supplied id reaching the database with no
      // ownership check anywhere ahead of it.
      let ownershipEstablished = false;
      for (const statement of prismaQueries(action.body)) {
        if (isOwnershipScoped(statement)) {
          ownershipEstablished = true;
          continue;
        }
        if (!/\bwhere\b/.test(statement)) continue;
        if (ownershipEstablished) continue;
        unscoped.push(`${action.file} → ${action.name}(): ${statement.split("\n")[0].trim()}`);
      }
    }

    expect(unscoped).toEqual([]);
  });

  // The scan itself is the thing most likely to rot, and a scan that sees
  // nothing passes quietly. This pins the shapes it must recognise.
  it("recognises a prisma query however it is written", () => {
    const oneLine = "{ await prisma.task.delete({ where: { id: taskId } }); }";
    const multiLine = "{\n  await prisma.task.delete({\n    where: { id: taskId },\n  });\n}";
    expect(prismaQueries(oneLine)).toHaveLength(1);
    expect(prismaQueries(multiLine)).toHaveLength(1);
    expect(prismaQueries("{ await prisma.task.delete({ where: { id, userId } }); }")[0]).toContain("userId");
    expect(prismaQueries("{ const x = 1; }")).toEqual([]);
  });

  it("treats a fetch-then-write as guarded, and a bare write as not", () => {
    const guarded = `{
      const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
      if (!task) return;
      await prisma.task.delete({ where: { id: taskId } });
    }`;
    const bare = `{ await prisma.task.delete({ where: { id: taskId } }); }`;
    expect(prismaQueries(guarded).some(isOwnershipScoped)).toBe(true);
    expect(prismaQueries(bare).some(isOwnershipScoped)).toBe(false);
  });

  it("only lists an exception with a reason", () => {
    for (const [name, reason] of Object.entries({ ...VERIFIED_SAFE, ...PRE_AUTH })) {
      expect(ACTIONS.some((a) => a.name === name), `${name} is no longer an action`).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
    }
  });
});
