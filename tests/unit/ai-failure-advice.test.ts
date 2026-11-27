import { describe, expect, it } from "vitest";
import { aiFailureMessage } from "@/lib/ai/api-key";

/** A key that gets past the shape check, so the error itself is what is judged. */
const GOOD_KEY = `sk-ant-api03-${"A".repeat(95)}`;

/**
 * Whether "try again in a moment" is honest advice.
 *
 * Some failures are a blip and retrying is exactly right. Others say the
 * same thing in a minute, in an hour and tomorrow — an account out of
 * credit, a key that is refused — and inviting someone to retry sends them
 * round a loop instead of to the one place they can fix it. Reported
 * exactly that way: an out-of-credit account, wrapped in an invitation to
 * try again.
 */
describe("what a failed AI call tells you to do", () => {
  it("does not offer to retry an account that has run out of credit", () => {
    const text = aiFailureMessage(
      new Error("the Anthropic account has run out of credit, so every AI feature is refused until it is topped up"),
      GOOD_KEY
    );
    expect(text).not.toMatch(/try again/i);
    expect(text).toContain("run out of credit");
  });

  it("does not offer to retry a key the service refuses", () => {
    for (const detail of ["the API key was rejected as invalid", "the API key was refused (403)"]) {
      expect(aiFailureMessage(new Error(detail), GOOD_KEY), detail).not.toMatch(/try again/i);
    }
  });

  it("still offers to retry the things that really are a blip", () => {
    // An outage at their end, a dropped connection: a minute later it
    // works, and saying so is the most useful thing on the screen.
    const text = aiFailureMessage(
      new Error("the AI service is temporarily unavailable — this one is at their end, try again shortly"),
      GOOD_KEY
    );
    expect(text).toMatch(/try again in a moment/i);
  });

  it("still leads with the key itself when the key is the problem", () => {
    // A key that is obviously incomplete never reaches the API at all, and
    // that check comes first for the same reason: it names the fix.
    const text = aiFailureMessage(new Error("anything"), "sk-ant-short");
    expect(text).toMatch(/key/i);
    expect(text).not.toMatch(/try again in a moment/i);
  });
});
