import { describe, expect, it } from "vitest";
import { parseRevisionUrl, revisionHost } from "@/lib/utils/revision-url";

describe("parseRevisionUrl", () => {
  it("keeps an ordinary https link", () => {
    expect(parseRevisionUrl("https://www.savemyexams.com/igcse/maths/cie/")).toBe(
      "https://www.savemyexams.com/igcse/maths/cie/"
    );
  });

  it("keeps http too, for a school's own portal on the local network", () => {
    expect(parseRevisionUrl("http://intranet.school.local/notes")).toBe("http://intranet.school.local/notes");
  });

  it("ignores surrounding whitespace, which pasting reliably brings along", () => {
    expect(parseRevisionUrl("  https://example.com/a  ")).toBe("https://example.com/a");
  });

  // The value ends up in an href, so a scheme that can execute is the whole
  // reason this function exists.
  describe("refuses anything that could run when tapped", () => {
    it.each([
      ["javascript:", "javascript:alert(1)"],
      ["javascript: with padding", "  javascript:alert(1)  "],
      ["mixed case javascript:", "JavaScript:alert(1)"],
      ["a data: document", "data:text/html,<script>alert(1)</script>"],
      ["a file: path", "file:///etc/passwd"],
    ])("%s", (_label, input) => {
      expect(parseRevisionUrl(input)).toBeNull();
    });
  });

  it("stores nothing rather than something that only looks like a link", () => {
    expect(parseRevisionUrl("not a url")).toBeNull();
    expect(parseRevisionUrl("savemyexams.com")).toBeNull(); // no scheme — not a URL
  });

  it("treats empty input as clearing the link", () => {
    expect(parseRevisionUrl("")).toBeNull();
    expect(parseRevisionUrl("   ")).toBeNull();
    expect(parseRevisionUrl(null)).toBeNull();
    expect(parseRevisionUrl(undefined)).toBeNull();
  });
});

describe("revisionHost", () => {
  it("names the site without the www., which is what you recognise", () => {
    expect(revisionHost("https://www.savemyexams.com/igcse/")).toBe("savemyexams.com");
    expect(revisionHost("https://physicsandmathstutor.com/a")).toBe("physicsandmathstutor.com");
  });

  it("keeps a meaningful subdomain", () => {
    expect(revisionHost("https://notes.myschool.ch/x")).toBe("notes.myschool.ch");
  });

  it("returns nothing for nothing, instead of throwing in a render", () => {
    expect(revisionHost(null)).toBeNull();
    expect(revisionHost("")).toBeNull();
    expect(revisionHost("not a url")).toBeNull();
  });
});
