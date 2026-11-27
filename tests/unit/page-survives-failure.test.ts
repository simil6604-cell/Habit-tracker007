import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * No button may be able to take its page down with it.
 *
 * Reported twice, from two different pages, and the second time as
 * "Website gecrashed". The mechanism is always the same: a component runs
 * a server action inside a transition, the action throws — an expired
 * session is enough, and a phone left open overnight is an expired session
 * — React hands the rejection to the nearest error boundary, and the whole
 * route is replaced by "This page didn't load". The chat, the lists, the
 * work in progress, gone, over one tap.
 *
 * Two things stop it now, and this walks the source for both:
 *
 * 1. Components use useSafeTransition, not React's useTransition. The
 *    signature is the same; the difference is that a failure becomes a
 *    line at the bottom of the screen instead of an unhandled rejection.
 * 2. Server actions redirect a signed-out person to the login page rather
 *    than throwing "Unauthorized" at them, which is where most of these
 *    throws came from in the first place.
 *
 * A static check on source text, so it is a heuristic — deliberately noisy
 * rather than lenient. Anything it cannot see must be listed below with a
 * reason, which is a small cost against shipping the next one.
 */

const SRC = path.join(__dirname, "..", "..", "src");

function filesUnder(dir: string, extension: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...filesUnder(full, extension));
    else if (entry.endsWith(extension)) found.push(full);
  }
  return found;
}

const named = (file: string) => path.relative(SRC, file);

describe("a failed button never kills the page", () => {
  /** Components allowed to use React's own useTransition, each with a reason. */
  const RAW_TRANSITION_ALLOWED: Record<string, string> = {};

  it("every component runs its actions through the safe transition", () => {
    const offenders = filesUnder(path.join(SRC, "components"), ".tsx").filter((file) => {
      const source = readFileSync(file, "utf8");
      return /\buseTransition\s*\(/.test(source) && !RAW_TRANSITION_ALLOWED[named(file)];
    });
    expect(offenders.map(named)).toEqual([]);
  });

  it("and there are plenty of them, so this is checking something", () => {
    // A guard that matches nothing because the pattern changed name is a
    // guard that passes for ever and protects nothing.
    const using = filesUnder(path.join(SRC, "components"), ".tsx").filter((file) =>
      readFileSync(file, "utf8").includes("useSafeTransition")
    );
    expect(using.length).toBeGreaterThan(25);
  });
});

describe("a signed-out person is sent to sign in, not shown a broken page", () => {
  it("no action file keeps its own copy that throws instead", () => {
    // Thirty-five identical copies of this function existed, all throwing.
    const offenders = filesUnder(path.join(SRC, "lib"), ".ts").filter((file) => {
      const source = readFileSync(file, "utf8");
      return /async function requireUserId/.test(source) && !file.endsWith("require-user.ts");
    });
    expect(offenders.map(named)).toEqual([]);
  });

  it("the one that is left redirects rather than throwing", () => {
    const source = readFileSync(path.join(SRC, "lib", "auth", "require-user.ts"), "utf8");
    expect(source).toContain('redirect("/login")');
    expect(source).not.toMatch(/throw new Error\("Unauthorized"\)/);
  });

  /**
   * The body of every `try` in a file, with the `catch` that follows it.
   *
   * Brace-counted rather than matched with a regex: a try block holds
   * braces of its own, and the question here is specifically whether the
   * call to requireUserId is INSIDE one. A catch around an AI call further
   * down the function cannot swallow anything, and flagging it would make
   * this check noise people learn to ignore.
   */
  function tryBlocks(source: string): { body: string; handler: string }[] {
    const blocks: { body: string; handler: string }[] = [];
    for (let i = source.indexOf("try {"); i !== -1; i = source.indexOf("try {", i + 1)) {
      let depth = 0;
      let end = -1;
      for (let j = i + 4; j < source.length; j++) {
        if (source[j] === "{") depth++;
        else if (source[j] === "}") {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      if (end === -1) continue;
      const after = source.slice(end);
      const catchStart = after.indexOf("{");
      let handler = "";
      if (/^\s*\}\s*catch/.test(after) && catchStart !== -1) {
        let depth2 = 0;
        for (let j = end + catchStart; j < source.length; j++) {
          if (source[j] === "{") depth2++;
          else if (source[j] === "}") {
            depth2--;
            if (depth2 === 0) {
              handler = source.slice(end + catchStart, j);
              break;
            }
          }
        }
      }
      blocks.push({ body: source.slice(i, end), handler });
    }
    return blocks;
  }

  it("nothing swallows the redirect on its way out", () => {
    // redirect() works by throwing. A catch around requireUserId that does
    // not rethrow turns "go and sign in" into a message about something
    // going wrong, on a page nobody can use anyway.
    const offenders: string[] = [];
    for (const file of filesUnder(path.join(SRC, "lib"), ".ts")) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("requireUserId(")) continue;
      for (const block of tryBlocks(source)) {
        if (!block.body.includes("requireUserId(")) continue;
        if (!block.handler.includes("unstable_rethrow")) offenders.push(named(file));
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });

  it("and that check can actually see a swallowed redirect", () => {
    // The scanner above is the kind that quietly matches nothing. This is
    // the shape it exists to catch, written out.
    const bad = `
      export async function thing() {
        try {
          const userId = await requireUserId();
          return { ok: userId };
        } catch (err) {
          return { error: "something went wrong" };
        }
      }
    `;
    const blocks = tryBlocks(bad);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].body).toContain("requireUserId(");
    expect(blocks[0].handler).not.toContain("unstable_rethrow");
  });
});
