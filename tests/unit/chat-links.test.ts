import { describe, expect, it } from "vitest";
import { internalHref } from "@/lib/utils/internal-link";

/**
 * Which links a reply is allowed to turn into links.
 *
 * The tutor can now make things — an episode, cards, a plan — and a reply
 * that says "it is on your podcast page" is a reply nobody acts on. So a
 * link in model output becomes a real one.
 *
 * That is the one piece of markdown that carries an action rather than a
 * style, so the rule is narrow and tested from both sides: somewhere in this
 * app, or not a link at all.
 */
describe("a link in a reply", () => {
  it("is allowed when it points inside this app", () => {
    expect(internalHref("/school/podcast?play=abc#ep-abc")).toBe("/school/podcast?play=abc#ep-abc");
    expect(internalHref("/school/flashcards")).toBe("/school/flashcards");
    expect(internalHref("/")).toBe("/");
  });

  it("is refused when it would send them somewhere else", () => {
    // Every one of these is a reply turning into a way out of the app.
    expect(internalHref("https://example.com")).toBeNull();
    expect(internalHref("//example.com/school")).toBeNull();
    expect(internalHref("javascript:alert(1)")).toBeNull();
    expect(internalHref("JavaScript:alert(1)")).toBeNull();
    expect(internalHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(internalHref("mailto:someone@example.com")).toBeNull();
    expect(internalHref("school/podcast")).toBeNull();
    expect(internalHref("")).toBeNull();
  });

  it("is refused when it carries anything a path is not made of", () => {
    expect(internalHref("/school/<script>")).toBeNull();
    expect(internalHref('/school/" onload="x')).toBeNull();
    expect(internalHref("/school/podcast\njavascript:alert(1)")).toBeNull();
  });
});
