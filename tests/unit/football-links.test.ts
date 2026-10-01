import { describe, it, expect } from "vitest";
import { parseLink, orderLinks, kindLabel, linkHost, linkSubtitle, MAX_LINK_TITLE } from "@/lib/football/links";

describe("parseLink", () => {
  it("keeps a normal league page", () => {
    const parsed = parseLink("https://matchcenter.el-pl.ch/default.aspx?v=397&t=31562", "Tabelle", "TABLE");
    expect(parsed).toEqual({
      ok: true,
      kind: "TABLE",
      title: "Tabelle",
      url: "https://matchcenter.el-pl.ch/default.aspx?v=397&t=31562",
    });
  });

  it("refuses a scheme that would run code when the button is tapped", () => {
    // The value goes straight into an href. This is the whole reason the URL
    // is parsed at all rather than stored as typed.
    for (const hostile of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox"]) {
      const parsed = parseLink(hostile, "Table", "TABLE");
      expect(parsed.ok, hostile).toBe(false);
    }
  });

  it("refuses something that is not a link at all", () => {
    expect(parseLink("my league table", "", "TABLE").ok).toBe(false);
    expect(parseLink("", "", "TABLE").ok).toBe(false);
    expect(parseLink(null, "", "TABLE").ok).toBe(false);
  });

  it("names an unnamed link after what it is, instead of leaving a blank button", () => {
    // Not after the site: a league's table and its fixtures sit on the same
    // host, so that gives two buttons with the same name.
    const parsed = parseLink("https://www.football.ch/gruppe/123", "   ", "FIXTURES");
    expect(parsed).toMatchObject({ ok: true, title: "Fixtures", kind: "FIXTURES" });
  });

  it("names an unnamed Other link after the site, because \"Other\" says nothing", () => {
    const parsed = parseLink("https://www.football.ch/anything", "", "OTHER");
    expect(parsed).toMatchObject({ ok: true, title: "football.ch", kind: "OTHER" });
  });

  it("treats an unknown kind as Other rather than storing it", () => {
    const parsed = parseLink("https://example.com", "x", "DROP TABLE");
    expect(parsed).toMatchObject({ ok: true, kind: "OTHER" });
  });

  it("collapses whitespace in a typed name", () => {
    const parsed = parseLink("https://example.com", "  Liga   2.  Tabelle ", "TABLE");
    expect(parsed).toMatchObject({ ok: true, title: "Liga 2. Tabelle" });
  });

  it("refuses a name too long to fit on a button", () => {
    const parsed = parseLink("https://example.com", "x".repeat(MAX_LINK_TITLE + 1), "TABLE");
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.error).toContain(String(MAX_LINK_TITLE));
  });
});

describe("orderLinks", () => {
  it("puts the table first and the odds and ends last", () => {
    const links = [
      { id: "1", kind: "OTHER" },
      { id: "2", kind: "RESULTS" },
      { id: "3", kind: "TABLE" },
      { id: "4", kind: "FIXTURES" },
      { id: "5", kind: "TEAM" },
    ];
    expect(orderLinks(links).map((l) => l.id)).toEqual(["3", "4", "2", "5", "1"]);
  });

  it("leaves a kind nobody recognises at the end rather than dropping it", () => {
    const links = [{ id: "a", kind: "WHAT" }, { id: "b", kind: "TABLE" }];
    expect(orderLinks(links).map((l) => l.id)).toEqual(["b", "a"]);
  });

  it("does not reorder the caller's own array", () => {
    const links = [{ id: "1", kind: "OTHER" }, { id: "2", kind: "TABLE" }];
    orderLinks(links);
    expect(links.map((l) => l.id)).toEqual(["1", "2"]);
  });
});

describe("kindLabel and linkHost", () => {
  it("names every kind, including one that is no longer known", () => {
    expect(kindLabel("TABLE")).toBe("Table");
    expect(kindLabel("TEAM")).toBe("My team");
    expect(kindLabel("SOMETHING_OLD")).toBe("Other");
  });

  it("shows the site without the www", () => {
    expect(linkHost("https://www.football.ch/x")).toBe("football.ch");
    expect(linkHost("not a url")).toBeNull();
  });
});

describe("linkSubtitle", () => {
  it("says what the page is and which site it is on", () => {
    expect(linkSubtitle({ kind: "TABLE", title: "Tabelle 2. Liga", url: "https://matchcenter.el-pl.ch/x" }))
      .toBe("Table · matchcenter.el-pl.ch");
  });

  it("does not repeat a name that is already the kind", () => {
    expect(linkSubtitle({ kind: "FIXTURES", title: "Fixtures", url: "https://www.football.ch/x" }))
      .toBe("football.ch");
  });

  it("still says something when the address is unreadable", () => {
    expect(linkSubtitle({ kind: "TABLE", title: "Mine", url: "nonsense" })).toBe("Table");
  });
});
