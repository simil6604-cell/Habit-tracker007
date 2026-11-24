import { describe, expect, it } from "vitest";
import { clientFailureMessage, serverFailureMessage } from "@/lib/utils/action-error";

/**
 * The words on screen when a button fails.
 *
 * The point of them existing at all is that the alternative was the whole
 * page being replaced by "This page didn't load" — so what matters is that
 * there is always a sentence, that it never tells someone to retry when
 * retrying cannot work, and that it says nothing was saved, because the
 * first thing you wonder after a failed button is whether it half-happened.
 */
describe("what a failed action says", () => {
  it("tells a signed-out person to sign in rather than to try again", () => {
    const text = serverFailureMessage(new Error("Unauthorized"), "The plan");
    expect(text).toMatch(/signed out/i);
    expect(text).toMatch(/sign in/i);
    // "Try again" on an expired session is advice that cannot work.
    expect(text).not.toMatch(/trying again is safe/);
  });

  it("names what the server said, when it said something", () => {
    const text = serverFailureMessage(new Error("Database is locked"), "The plan");
    expect(text).toContain("Database is locked");
    expect(text).toMatch(/nothing was saved/i);
  });

  it("still says something useful when there is nothing to name", () => {
    for (const thrown of [undefined, null, "a string", {}]) {
      const text = serverFailureMessage(thrown, "The plan");
      expect(text.length).toBeGreaterThan(20);
      expect(text).toMatch(/nothing was saved/i);
    }
  });

  it("keeps a runaway message short enough to read", () => {
    const text = serverFailureMessage(new Error("x".repeat(5_000)), "The plan");
    expect(text.length).toBeLessThan(300);
  });

  it("does not guess at a cause when the call never arrived", () => {
    const text = clientFailureMessage("The plan");
    expect(text).toMatch(/offline|restarting/i);
    expect(text).toMatch(/nothing was saved/i);
  });
});
