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
export type PrismaQuery = { text: string; assignedTo: string | null };

function prismaQueries(body: string): PrismaQuery[] {
  const queries: PrismaQuery[] = [];
  const opener = new RegExp(`prisma\\.\\w+\\.(?:${QUERY_METHODS})\\(`, "g");
  for (const match of body.matchAll(opener)) {
    let depth = 0;
    for (let i = match.index! + match[0].length - 1; i < body.length; i++) {
      if (body[i] === "(") depth++;
      else if (body[i] === ")" && --depth === 0) {
        // `const topic = await prisma.topic.findFirst(...)` — the name matters:
        // a later write keyed on `topic.id` is keyed on the row just proven.
        const preceding = body.slice(Math.max(0, match.index! - 80), match.index!);
        const assigned = preceding.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?$/);
        queries.push({ text: body.slice(match.index!, i + 1), assignedTo: assigned ? assigned[1] : null });
        break;
      }
    }
  }
  return queries;
}

/**
 * The id a query keys its `where` on, as written: `taskId`, `a.subjectId`, or
 * the shorthand `{ id }`. Null when the query selects by something else — by
 * the user, by a date, by a list of ids.
 */
export function keyedId(statement: string): string | null {
  const explicit = statement.match(/where:\s*\{[^{}]*?\bid:\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/);
  if (explicit) return explicit[1];
  if (/where:\s*\{\s*id\s*[,}]/.test(statement)) return "id";
  return null;
}

/** The names a where-clause filters on, as written: `topicId`, `existing.id`, `workout`. */
function whereReferences(statement: string): string[] {
  const where = statement.slice(statement.search(/\bwhere\b/));
  return [...where.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/g)].map((m) => m[1]);
}

/**
 * The queries in one action that reach the database on an id the action never
 * proved belongs to the signed-in user.
 *
 * Provenance spreads, because that is how the code is actually written: a
 * query scoped by `userId` proves the id it looked up and the row it returns,
 * a row proves the relations included with it, and a query filtered on
 * something already proven is itself proven. What does not spread is a
 * *different* id appearing in the same function — which is exactly the bug
 * this missed twice.
 */
export function unprovenQueries(action: { body: string }): string[] {
  const proven = new Set<string>();

  // `for (const exercise of workout.exercises)` — a row reached through a
  // proven row is proven too.
  const loopVars = (): void => {
    for (const m of action.body.matchAll(/for\s*\(\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s+of\s+([A-Za-z_$][\w$]*)\./g)) {
      if (proven.has(m[2])) proven.add(m[1]);
    }
  };

  const remember = (query: PrismaQuery): void => {
    const id = keyedId(query.text);
    if (id) proven.add(id);
    if (query.assignedTo) {
      proven.add(query.assignedTo);
      proven.add(`${query.assignedTo}.id`);
    }
    loopVars();
  };

  const unproven: string[] = [];
  for (const query of prismaQueries(action.body)) {
    if (isOwnershipScoped(query.text)) {
      remember(query);
      continue;
    }
    if (!/\bwhere\b/.test(query.text)) continue;

    const references = whereReferences(query.text);
    if (references.some((name) => proven.has(name) || proven.has(name.split(".")[0]))) {
      remember(query);
      continue;
    }
    unproven.push(query.text.split("\n")[0].trim());
  }
  return unproven;
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

  /**
   * The first version of this check had two holes, and a security review found
   * a live bug in each of them.
   *
   * It only looked at actions whose *typed parameters* contained an id, so an
   * id arriving inside a FormData blob was never examined — and one such
   * action wrote to a subject id the browser had sent, with no check at all.
   * Every action is scanned now.
   *
   * And it counted an action as guarded once *any* ownership-scoped query had
   * run, without asking whether the id it checked was the id it then wrote.
   * Two actions took (topicId, subjectId), proved the subject was yours, and
   * deleted the topic: naming your own subject alongside someone else's topic
   * satisfied the check. So the id is now tracked by name — a write keyed on
   * `topicId` needs `topicId` itself to have been proven, not some other id in
   * the same function.
   */
  it("every query keyed on a caller-supplied id proves that id belongs to the user", () => {
    const unscoped: string[] = [];

    for (const action of ACTIONS) {
      if (VERIFIED_SAFE[action.name] || PRE_AUTH[action.name]) continue;
      unscoped.push(...unprovenQueries(action).map((q) => `${action.file} → ${action.name}(): ${q}`));
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
    expect(prismaQueries("{ await prisma.task.delete({ where: { id, userId } }); }")[0].text).toContain("userId");
    expect(prismaQueries("{ const x = 1; }")).toEqual([]);
  });

  /**
   * The shapes the scan must tell apart. The third one is the bug a security
   * review found twice in this repo after the first version of this test
   * passed it: ownership proven for one id, the write keyed on another.
   */
  it("tells a proven id apart from a different id proven in the same function", () => {
    const provenSameId = {
      body: `{
        const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
        if (!task) return;
        await prisma.task.delete({ where: { id: taskId } });
      }`,
    };
    const provenRow = {
      body: `{
        const workout = await prisma.workout.findFirst({ where: { id: workoutId, userId }, include: { exercises: true } });
        if (!workout) return;
        for (const exercise of workout.exercises) {
          await prisma.setLog.findFirst({ where: { exerciseId: exercise.id } });
        }
      }`,
    };
    const differentId = {
      body: `{
        const subject = await prisma.subject.findFirst({ where: { id: subjectId, userId } });
        if (!subject) return;
        await prisma.topic.delete({ where: { id: topicId } });
      }`,
    };
    const fromClientBlob = {
      body: `{
        await prisma.subject.update({ where: { id: a.subjectId }, data: { baselineConfidence: 20 } });
      }`,
    };

    expect(unprovenQueries(provenSameId)).toEqual([]);
    expect(unprovenQueries(provenRow)).toEqual([]);
    expect(unprovenQueries(differentId)).toHaveLength(1);
    expect(unprovenQueries(differentId)[0]).toContain("prisma.topic.delete");
    expect(unprovenQueries(fromClientBlob)).toHaveLength(1);
  });

  it("reads the id out of a where clause however it is written", () => {
    expect(keyedId("prisma.t.delete({ where: { id: topicId } })")).toBe("topicId");
    expect(keyedId("prisma.t.delete({ where: { id } })")).toBe("id");
    expect(keyedId("prisma.t.delete({ where: { id, userId } })")).toBe("id");
    expect(keyedId("prisma.t.update({ where: { id: a.subjectId }, data: {} })")).toBe("a.subjectId");
    expect(keyedId("prisma.t.findMany({ where: { userId } })")).toBeNull();
  });

  it("treats a fetch-then-write as guarded, and a bare write as not", () => {
    const guarded = `{
      const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
      if (!task) return;
      await prisma.task.delete({ where: { id: taskId } });
    }`;
    const bare = `{ await prisma.task.delete({ where: { id: taskId } }); }`;
    expect(prismaQueries(guarded).some((q) => isOwnershipScoped(q.text))).toBe(true);
    expect(prismaQueries(bare).some((q) => isOwnershipScoped(q.text))).toBe(false);
  });

  it("only lists an exception with a reason", () => {
    for (const [name, reason] of Object.entries({ ...VERIFIED_SAFE, ...PRE_AUTH })) {
      expect(ACTIONS.some((a) => a.name === name), `${name} is no longer an action`).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
    }
  });
});
