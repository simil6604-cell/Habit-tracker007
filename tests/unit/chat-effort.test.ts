import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CHAT_EFFORT, readEffort } from "@/lib/ai/model-config";

/**
 * The chat asks to think fast; the jobs worth waiting for do not.
 *
 * Reported as the tutor taking too long to answer. The dial is effort, and
 * the distinction that matters is between a conversation — a dozen short
 * exchanges where the waiting is the whole cost — and a one-shot job like
 * marking a photographed past paper, which takes a while anyway and is
 * worth it.
 */
describe("the effort a chat turn asks for", () => {
  it("is the fast end of the dial", () => {
    expect(CHAT_EFFORT).toBe("low");
  });

  it("reads a level the API accepts, and nothing else", () => {
    expect(readEffort("low")).toBe("low");
    expect(readEffort(" HIGH ")).toBe("high");
    expect(readEffort("max")).toBe("max");
    // Anything the API would refuse comes back as null so the caller keeps
    // its own default: a 400 about output_config takes every AI feature in
    // the app down at once.
    expect(readEffort("turbo")).toBeNull();
    expect(readEffort("")).toBeNull();
    expect(readEffort(undefined)).toBeNull();
    expect(readEffort(3)).toBeNull();
  });
});

describe("which call sites ask for it", () => {
  const read = (file: string) =>
    readFileSync(path.join(__dirname, "..", "..", "src", "lib", file), "utf8");

  it("the school chat does", () => {
    expect(read("school/school-ai-actions.ts")).toContain("effort: CHAT_EFFORT");
  });

  it("the work worth waiting for does not", () => {
    // Each of these is one long job the student asked for on purpose, and
    // a faster, worse one is not what they wanted.
    for (const file of [
      "school/exam-plan-build.ts",
      "school/podcast-episode.ts",
      "school/marked-paper-actions.ts",
    ]) {
      expect(read(file), file).not.toContain("CHAT_EFFORT");
    }
  });
});
