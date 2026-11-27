import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSchoolAITurns,
  chatContextTurns,
  NO_REAL_AI_MESSAGE,
  type StoredChatMessage,
} from "@/lib/school/school-ai";
import { aiFailureMessage } from "@/lib/ai/api-key";

/**
 * What the tutor is told about its own failures.
 *
 * When a call cannot be made, the reason goes into the chat as a message —
 * the student has to be told why nothing came back. But it is the app
 * talking, and for a while it was stored as the tutor's own reply and sent
 * straight back as context on the next question. Two things followed from
 * that, and both were reported from a real conversation:
 *
 *   - the last thing the tutor was on record as saying was that the account
 *     had run out of credit, so the first answer after a top-up was given in
 *     the light of a tutor announcing it could not help, and
 *   - every failed question left another copy in the transcript.
 *
 * So: kept on screen, kept out of the conversation. The second half matters
 * as much as the first — taking a message out of the middle leaves two
 * questions in a row, and the API refuses a request whose roles do not
 * alternate, which would turn a billing problem into a broken chat box.
 */

/** The app's own words for an account with no credit, not an approximation of them. */
const OUT_OF_CREDIT = aiFailureMessage(
  new Error(
    "the Anthropic account has run out of credit, so every AI feature is refused until it is topped up — " +
      "add credit at console.anthropic.com under Plans & Billing. Trying again will not help until then"
  ),
  "sk-ant-api03-0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
);

function message(
  role: "USER" | "ASSISTANT",
  content: string,
  extra: Partial<StoredChatMessage> = {}
): StoredChatMessage {
  return { role, content, imagePaths: null, failed: false, ...extra };
}

/** Nowhere in the result may two messages of the same role sit next to each other. */
function rolesAlternate(turns: { role: string }[]): boolean {
  return turns.every((turn, i) => i === 0 || turns[i - 1].role !== turn.role);
}

describe("a failed answer is not part of the conversation", () => {
  it("names the real failure, so this test breaks if the wording drifts", () => {
    expect(OUT_OF_CREDIT).toContain("run out of credit");
    expect(OUT_OF_CREDIT).not.toContain("try again in a moment");
  });

  it("keeps the failure notice out of what the tutor is sent", () => {
    const history: StoredChatMessage[] = [
      message("USER", "Explain enzyme inhibition"),
      message("ASSISTANT", OUT_OF_CREDIT, { failed: true }),
      message("USER", "Explain enzyme inhibition"),
      message("ASSISTANT", "Competitive inhibitors bind the active site."),
    ];

    const sent = buildSchoolAITurns(chatContextTurns(history));

    expect(sent.map((t) => t.content).join("\n")).not.toContain("credit");
    expect(sent.map((t) => t.content).join("\n")).not.toContain("could not answer");
  });

  it("still sends the answers that worked", () => {
    const history: StoredChatMessage[] = [
      message("USER", "Explain enzyme inhibition"),
      message("ASSISTANT", OUT_OF_CREDIT, { failed: true }),
      message("USER", "And non-competitive?"),
      message("ASSISTANT", "Competitive inhibitors bind the active site."),
    ];

    const sent = buildSchoolAITurns(chatContextTurns(history));

    expect(sent.at(-1)).toEqual({ role: "assistant", content: "Competitive inhibitors bind the active site." });
  });

  it("leaves the student's own question in, even though its answer failed", () => {
    const history: StoredChatMessage[] = [
      message("USER", "Explain enzyme inhibition"),
      message("ASSISTANT", OUT_OF_CREDIT, { failed: true }),
      message("USER", "And non-competitive?"),
    ];

    const sent = buildSchoolAITurns(chatContextTurns(history));

    expect(sent).toHaveLength(1);
    expect(sent[0].role).toBe("user");
    expect(sent[0].content).toContain("Explain enzyme inhibition");
    expect(sent[0].content).toContain("And non-competitive?");
  });
});

describe("the gap a dropped message leaves cannot break the request", () => {
  it("joins the two questions either side of it instead of sending both", () => {
    const history: StoredChatMessage[] = [
      message("USER", "First question"),
      message("ASSISTANT", OUT_OF_CREDIT, { failed: true }),
      message("USER", "Second question"),
      message("ASSISTANT", OUT_OF_CREDIT, { failed: true }),
      message("USER", "Third question"),
    ];

    const sent = buildSchoolAITurns(chatContextTurns(history));

    expect(rolesAlternate(sent)).toBe(true);
    expect(sent).toEqual([{ role: "user", content: "First question\n\nSecond question\n\nThird question" }]);
  });

  it("alternates through a conversation where only some answers failed", () => {
    const history: StoredChatMessage[] = [
      message("USER", "One"),
      message("ASSISTANT", "Answer one"),
      message("USER", "Two"),
      message("ASSISTANT", OUT_OF_CREDIT, { failed: true }),
      message("USER", "Three"),
      message("ASSISTANT", "Answer three"),
    ];

    const sent = buildSchoolAITurns(chatContextTurns(history));

    expect(rolesAlternate(sent)).toBe(true);
    expect(sent).toEqual([
      { role: "user", content: "One" },
      { role: "assistant", content: "Answer one" },
      { role: "user", content: "Two\n\nThree" },
      { role: "assistant", content: "Answer three" },
    ]);
  });

  it("holds for the older gap too: a message with no text at all", () => {
    const history: StoredChatMessage[] = [
      message("USER", "A question"),
      message("ASSISTANT", "   "),
      message("USER", "Another question"),
    ];

    const sent = buildSchoolAITurns(chatContextTurns(history));

    expect(rolesAlternate(sent)).toBe(true);
    expect(sent).toEqual([{ role: "user", content: "A question\n\nAnother question" }]);
  });

  it("keeps the photo note when a question is joined to the next one", () => {
    const history: StoredChatMessage[] = [
      message("USER", "What's wrong with this working?", { imagePaths: JSON.stringify(["/uploads/a.jpg"]) }),
      message("ASSISTANT", OUT_OF_CREDIT, { failed: true }),
      message("USER", "Still there?"),
    ];

    const sent = buildSchoolAITurns(chatContextTurns(history));

    expect(sent[0].content).toBe("[sent 1 photo] What's wrong with this working?\n\nStill there?");
  });

  it("changes nothing about an ordinary conversation", () => {
    const history: StoredChatMessage[] = [
      message("USER", "One"),
      message("ASSISTANT", "Answer one"),
      message("USER", "Two"),
      message("ASSISTANT", "Answer two"),
    ];

    expect(buildSchoolAITurns(chatContextTurns(history))).toEqual([
      { role: "user", content: "One" },
      { role: "assistant", content: "Answer one" },
      { role: "user", content: "Two" },
      { role: "assistant", content: "Answer two" },
    ]);
  });
});

/**
 * The half the pure functions above cannot see.
 *
 * `chatContextTurns` only works if something sets the flag, and that happens
 * in a `"use server"` module whose every import reaches for a database. The
 * two branches that produce a non-answer are read out of the source instead,
 * so the day a third one is added without the flag, this says so.
 */
describe("the action marks a non-answer as one", () => {
  const source = readFileSync(path.join(process.cwd(), "src/lib/school/school-ai-actions.ts"), "utf8");

  it("stores the flag with the message", () => {
    expect(source).toMatch(/schoolAIMessage\.create\(\{\s*data:\s*\{[^}]*role:\s*"ASSISTANT"[^}]*failed[^}]*\}/);
  });

  it("sets it when there is no key at all", () => {
    expect(source).toMatch(/reply = NO_REAL_AI_MESSAGE;\s*\n\s*failed = true;/);
  });

  it("sets it when the call threw", () => {
    expect(source).toMatch(/reply = aiFailureMessage\(err\);\s*\n\s*failed = true;/);
  });

  it("has exactly as many assignments as there are ways to fail", () => {
    expect(source.match(/failed = true;/g)).toHaveLength(2);
  });
});

/**
 * The messages that were already in the chat when this shipped.
 *
 * The column arrives with a default of false, so every failure written
 * before it existed reads as an ordinary reply — and the conversation with
 * the most of them in it is the one that was being had at the time. They are
 * recognised by the words this app puts in them.
 */
describe("failures stored before the flag existed", () => {
  const stale = (content: string): StoredChatMessage => ({
    role: "ASSISTANT",
    content,
    imagePaths: null,
    failed: false,
  });

  it("recognises the out-of-credit sentence", () => {
    expect(chatContextTurns([stale(OUT_OF_CREDIT)])).toEqual([]);
  });

  it("recognises the older wording, the one that still said to retry", () => {
    expect(
      chatContextTurns([stale("Couldn't reach the AI service right now (the AI service returned an error (400)) — try again in a moment.")])
    ).toEqual([]);
  });

  it("recognises a key problem and the no-key notice", () => {
    expect(chatContextTurns([stale(NO_REAL_AI_MESSAGE)])).toEqual([]);
    expect(
      chatContextTurns([stale("The AI key has a space inside it, so the API rejects it. Copy it again.")])
    ).toEqual([]);
  });

  it("recognises one that has a photo note in front of it", () => {
    expect(
      chatContextTurns([stale(`_(1 of your 2 files couldn't be included.)_\n\n${OUT_OF_CREDIT}`)])
    ).toEqual([]);
  });

  it("leaves a real answer alone, even one that talks about the AI", () => {
    const answer = stale("The AI could help here, but let's do it by hand: enzymes lower activation energy.");
    expect(chatContextTurns([answer])).toHaveLength(1);
  });

  it("never drops a question the student wrote, whatever is in it", () => {
    const question: StoredChatMessage = {
      role: "USER",
      content: `Why do I keep getting this? ${OUT_OF_CREDIT}`,
      imagePaths: null,
      failed: false,
    };
    expect(chatContextTurns([question])).toHaveLength(1);
  });
});
