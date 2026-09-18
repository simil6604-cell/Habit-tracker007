import { describe, expect, it } from "vitest";
import { stripMarkdown } from "@/lib/utils/markdown";

describe("stripMarkdown", () => {
  // Used for clamped previews, where real blocks would break the clamp but
  // raw "##" and "**" read as the app being broken.
  it("removes heading markers", () => {
    expect(stripMarkdown("## REVISE\nSome text")).toBe("REVISE\nSome text");
  });

  it("unwraps bold without eating the words", () => {
    expect(stripMarkdown("**Key point:** algebra")).toBe("Key point: algebra");
  });

  it("turns list markers into bullets you can read in one line", () => {
    expect(stripMarkdown("- factorising\n- expanding")).toBe("• factorising\n• expanding");
  });

  it("leaves ordinary prose alone", () => {
    const plain = "Factorising reverses expanding.";
    expect(stripMarkdown(plain)).toBe(plain);
  });

  it("does not mistake mid-word asterisks or a hash for markup", () => {
    expect(stripMarkdown("2 * 3 = 6 and issue #4")).toBe("2 * 3 = 6 and issue #4");
  });

  it("handles an empty summary without throwing", () => {
    expect(stripMarkdown("")).toBe("");
  });
});
