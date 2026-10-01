import { describe, expect, it } from "vitest";
import { parseRevisionUrl, revisionHost, normalizeUserUrl } from "@/lib/utils/revision-url";

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

describe("normalizeUserUrl", () => {
  const LEAGUE = "https://matchcenter.el-pl.ch/default.aspx?v=397&oid=3&lng=1&t=31562&a=trr";

  it("keeps a proper address exactly as it is", () => {
    expect(normalizeUserUrl(LEAGUE)).toBe(LEAGUE);
  });

  it("accepts the address bar without its scheme, which is how a phone copies it", () => {
    expect(normalizeUserUrl("matchcenter.el-pl.ch/default.aspx?v=397")).toBe(
      "https://matchcenter.el-pl.ch/default.aspx?v=397"
    );
    expect(normalizeUserUrl("www.football.ch/gruppe/42")).toBe("https://www.football.ch/gruppe/42");
  });

  it("takes the address out of what a share sheet hands you", () => {
    // Both shapes: the title before the link, and the title after it. The
    // second is the dangerous one — it parses, so without this the title ends
    // up inside the address and the button opens the wrong page.
    expect(normalizeUserUrl("Tabelle\nhttps://matchcenter.el-pl.ch/x")).toBe("https://matchcenter.el-pl.ch/x");
    expect(normalizeUserUrl("https://matchcenter.el-pl.ch/x — Tabelle 2. Liga")).toBe(
      "https://matchcenter.el-pl.ch/x"
    );
  });

  it("still refuses a scheme that runs code, and never invents https for one", () => {
    // The guard this whole function sits in front of. Prepending https:// to
    // anything carrying a scheme is how a forgiving parser becomes a hole.
    const hostile = [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      // The one that matters most: strip its scheme and what is left still
      // looks like a host, so a version that rewrote every scheme to https
      // turned this into a saved link instead of refusing it. Refusing is the
      // rule — a scheme that is already there is judged, never replaced.
      "javascript:alert(document.cookie)",
      "JavaScript:alert(1)",
    ];
    for (const bad of hostile) {
      expect(normalizeUserUrl(bad), bad).toBeNull();
      expect(normalizeUserUrl(`  ${bad}  `), bad).toBeNull();
    }
  });

  it("refuses a sentence with no address in it", () => {
    expect(normalizeUserUrl("my league table")).toBeNull();
    expect(normalizeUserUrl("")).toBeNull();
    expect(normalizeUserUrl(null)).toBeNull();
    expect(normalizeUserUrl("   ")).toBeNull();
  });

  it("refuses a word that is not a host, even though a scheme would parse it", () => {
    expect(normalizeUserUrl("https://notes")).toBeNull();
    expect(normalizeUserUrl("localhost")).toBeNull();
  });
});
