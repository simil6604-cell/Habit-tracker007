// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "@/lib/utils/sanitize-svg";

/**
 * This is the one place in the app where model output reaches the DOM as
 * markup rather than as text, so everything it lets through is executed by the
 * browser. The cases below are the attacks that matter, written as tests so
 * nobody widens the allowlist without meeting them again.
 */
const wrap = (inner: string) => `<svg viewBox="0 0 320 220">${inner}</svg>`;

describe("sanitizeSvg", () => {
  it("keeps an ordinary diagram intact", () => {
    const out = sanitizeSvg(wrap('<rect x="10" y="10" width="40" height="20" fill="#333"/><text x="12" y="24">Mon</text>'))!;
    expect(out).toContain("<rect");
    expect(out).toContain("<text");
    expect(out).toContain("Mon");
  });

  describe("removes anything that could run or fetch", () => {
    it.each([
      ["a script tag", "<script>alert(1)</script>", "script"],
      ["foreignObject, which can carry HTML", "<foreignObject><body>hi</body></foreignObject>", "foreignobject"],
      ["an external image", '<image href="https://example.com/x.png"/>', "image"],
      ["use, which can pull in other documents", '<use href="https://example.com/x.svg#a"/>', "use"],
      ["an animation that can set attributes", '<set attributeName="fill" to="red"/>', "set"],
    ])("%s", (_label, payload, tag) => {
      const out = sanitizeSvg(wrap(payload));
      expect(out?.toLowerCase() ?? "").not.toContain(`<${tag}`);
    });

    it("event handler attributes", () => {
      const out = sanitizeSvg(wrap('<rect onload="alert(1)" onclick="alert(2)" fill="red"/>'))!;
      expect(out).not.toContain("onload");
      expect(out).not.toContain("onclick");
      expect(out).toContain('fill="red"'); // the harmless attribute survives
    });

    it("javascript: and data: URLs, whatever attribute carries them", () => {
      const out = sanitizeSvg(wrap('<path d="M0 0" fill="url(javascript:alert(1))" stroke="data:text/html,x"/>'))!;
      expect(out.toLowerCase()).not.toContain("javascript:");
      expect(out.toLowerCase()).not.toContain("data:");
    });

    it("attributes nobody put on the list, like style", () => {
      const out = sanitizeSvg(wrap('<rect style="position:fixed" fill="red"/>'))!;
      expect(out).not.toContain("style=");
    });

    it("a nested payload, not just a top-level one", () => {
      const out = sanitizeSvg(wrap("<g><g><script>alert(1)</script></g></g>"))!;
      expect(out.toLowerCase()).not.toContain("<script");
    });
  });

  describe("refuses outright rather than returning something half-safe", () => {
    it.each([
      ["markup that isn't an SVG at all", "<div>hello</div>"],
      ["a bare script", "<script>alert(1)</script>"],
      ["unparseable rubbish", "<svg><rect"],
      ["nothing", ""],
    ])("%s", (_label, input) => {
      expect(sanitizeSvg(input)).toBeNull();
    });

    it("a diagram far larger than any explanation needs", () => {
      expect(sanitizeSvg(wrap("<rect/>".repeat(250)))).toBeNull();
    });
  });

  describe("normalises the drawing for the page", () => {
    it("drops fixed dimensions so it scales to its container", () => {
      const out = sanitizeSvg('<svg width="900" height="700" viewBox="0 0 320 220"><rect/></svg>')!;
      expect(out).not.toContain("width=\"900\"");
      expect(out).not.toContain("height=\"700\"");
    });

    it("supplies a viewBox when the model forgot one", () => {
      expect(sanitizeSvg("<svg><rect/></svg>")).toContain("viewBox");
    });
  });
});
