import { describe, it, expect } from "vitest";
import { parseStandingsReply, standingsSourceLine, STANDINGS_TASK } from "@/lib/football/standings-import";

const NO_TABLE = "No table in that.";

const row = (over: Record<string, unknown> = {}) => ({
  rank: 1,
  teamName: "FC Zug 94",
  played: 10,
  won: 7,
  drawn: 2,
  lost: 1,
  goalsFor: 24,
  goalsAgainst: 9,
  points: 23,
  ...over,
});

describe("parseStandingsReply", () => {
  it("reads a clean array", () => {
    const result = parseStandingsReply(JSON.stringify([row()]), NO_TABLE);
    expect(result).toEqual({ ok: true, data: [row()] });
  });

  it("digs the array out of a code fence, which models add unasked", () => {
    const reply = "```json\n" + JSON.stringify([row()]) + "\n```";
    const result = parseStandingsReply(reply, NO_TABLE);
    expect(result.ok && result.data).toHaveLength(1);
  });

  it("digs it out of a sentence wrapped around it", () => {
    const reply = `Here is the table you asked for:\n${JSON.stringify([row()])}\nLet me know if you need anything else.`;
    const result = parseStandingsReply(reply, NO_TABLE);
    expect(result.ok && result.data[0].teamName).toBe("FC Zug 94");
  });

  it("puts the rows in table order, whatever order they arrived in", () => {
    const reply = JSON.stringify([row({ rank: 3, teamName: "C" }), row({ rank: 1, teamName: "A" }), row({ rank: 2, teamName: "B" })]);
    const result = parseStandingsReply(reply, NO_TABLE);
    expect(result.ok && result.data.map((r) => r.teamName)).toEqual(["A", "B", "C"]);
  });

  it("uses the caller's own words when there is no table", () => {
    // Each route says something different and useful here — a bad link, a
    // blurry photo — so the refusal is not one sentence for all three.
    expect(parseStandingsReply("NONE", NO_TABLE)).toEqual({ ok: false, error: NO_TABLE });
    expect(parseStandingsReply("   ", NO_TABLE)).toEqual({ ok: false, error: NO_TABLE });
    expect(parseStandingsReply("[]", NO_TABLE)).toEqual({ ok: false, error: NO_TABLE });
  });

  it("drops a row with no team name rather than inventing one", () => {
    const reply = JSON.stringify([row(), row({ rank: 2, teamName: "  " })]);
    const result = parseStandingsReply(reply, NO_TABLE);
    expect(result.ok && result.data).toHaveLength(1);
  });

  it("says so when every row was nameless, instead of saving an empty table", () => {
    const result = parseStandingsReply(JSON.stringify([row({ teamName: "" })]), NO_TABLE);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/without a team name/);
  });

  it("turns a dash or a missing column into 0, not into NaN", () => {
    // A photo of a table often has "-" where a number would be, and NaN
    // written to the database renders as nothing and breaks every total.
    const reply = JSON.stringify([row({ drawn: "-", goalsFor: null, points: undefined })]);
    const result = parseStandingsReply(reply, NO_TABLE);
    expect(result.ok && result.data[0]).toMatchObject({ drawn: 0, goalsFor: 0, points: 0 });
    expect(result.ok && Number.isNaN(result.data[0].drawn)).toBe(false);
  });

  it("reads numbers that came back as strings", () => {
    const reply = JSON.stringify([row({ played: "10", points: "23" })]);
    const result = parseStandingsReply(reply, NO_TABLE);
    expect(result.ok && result.data[0]).toMatchObject({ played: 10, points: 23 });
  });

  it("refuses an answer that is not table data at all", () => {
    const result = parseStandingsReply("I'm sorry, I can't help with that.", NO_TABLE);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/not table data/);
  });

  it("finds the rows inside a wrapper object rather than giving up on them", () => {
    // Asked for a bare array, models sometimes answer {"teams": [...]}. The
    // rows are right there, so they are taken rather than refused.
    const result = parseStandingsReply(JSON.stringify({ teams: [row()] }), NO_TABLE);
    expect(result.ok && result.data[0].teamName).toBe("FC Zug 94");
  });

  it("skips entries that are not objects without losing the real rows", () => {
    const reply = JSON.stringify([row(), "not a row", 42, null]);
    const result = parseStandingsReply(reply, NO_TABLE);
    expect(result.ok && result.data).toHaveLength(1);
  });
});

describe("STANDINGS_TASK", () => {
  it("asks for every column the table stores", () => {
    for (const field of ["rank", "teamName", "played", "won", "drawn", "lost", "goalsFor", "goalsAgainst", "points"]) {
      expect(STANDINGS_TASK, field).toContain(field);
    }
  });

  it("gives the model a way to say there is no table", () => {
    expect(STANDINGS_TASK).toContain("NONE");
  });
});

describe("standingsSourceLine", () => {
  it("names the route the rows came in by", () => {
    expect(standingsSourceLine("API", true)).toMatch(/table page/i);
    expect(standingsSourceLine("PASTED", true)).toMatch(/pasted/i);
    expect(standingsSourceLine("PHOTO", true)).toMatch(/photo/i);
    expect(standingsSourceLine("MANUAL", true)).toMatch(/by hand/i);
  });

  it("never tells you to paste a link about a table that is already filled in", () => {
    // What it did: after reading the table off a photograph, the page said
    // "Paste a link to your league's table below" — about the rows underneath.
    for (const source of ["API", "PASTED", "PHOTO", "MANUAL", "SOMETHING_NEW"]) {
      expect(standingsSourceLine(source, true), source).not.toMatch(/^Paste a link/);
    }
  });

  it("says how to start when there is nothing yet", () => {
    expect(standingsSourceLine("MANUAL", false)).toMatch(/No table yet/);
    expect(standingsSourceLine("PHOTO", false)).toMatch(/No table yet/);
  });

  it("says something useful for a source it has never heard of", () => {
    expect(standingsSourceLine("FUTURE_THING", true).length).toBeGreaterThan(20);
  });
});
