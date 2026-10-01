import { describe, it, expect } from "vitest";
import {
  cleanLine,
  cleanNote,
  parseMatchDate,
  matchWhereLine,
  MAX_LOCATION,
  MAX_MATCH_NOTE,
} from "@/lib/football/match-details";

describe("cleanLine", () => {
  it("keeps an ordinary place", () => {
    expect(cleanLine("Sportplatz Herti, Zug", MAX_LOCATION)).toBe("Sportplatz Herti, Zug");
  });

  it("flattens a pasted line break, because this is one line", () => {
    expect(cleanLine("Sportplatz Herti\nZug", MAX_LOCATION)).toBe("Sportplatz Herti Zug");
  });

  it("treats blank and whitespace as nothing at all", () => {
    expect(cleanLine("   ", MAX_LOCATION)).toBeNull();
    expect(cleanLine("", MAX_LOCATION)).toBeNull();
    expect(cleanLine(null, MAX_LOCATION)).toBeNull();
    expect(cleanLine(42, MAX_LOCATION)).toBeNull();
  });

  it("cuts a value too long to be a place", () => {
    expect(cleanLine("x".repeat(500), MAX_LOCATION)).toHaveLength(MAX_LOCATION);
  });
});

describe("cleanNote", () => {
  it("keeps the lines, because a note is a list", () => {
    expect(cleanNote("Besammlung 13:00\nRotes Trikot")).toBe("Besammlung 13:00\nRotes Trikot");
  });

  it("tidies the gaps without joining the lines together", () => {
    expect(cleanNote("  Besammlung 13:00  \n\n\n\n  Rotes Trikot ")).toBe("Besammlung 13:00\n\nRotes Trikot");
  });

  it("is nothing when it is only whitespace", () => {
    expect(cleanNote("\n\n   \n")).toBeNull();
    expect(cleanNote(undefined)).toBeNull();
  });

  it("cuts a note that would fill the card", () => {
    expect(cleanNote("y".repeat(900))).toHaveLength(MAX_MATCH_NOTE);
  });
});

describe("parseMatchDate", () => {
  it("reads what a datetime-local field sends", () => {
    const date = parseMatchDate("2026-04-12T14:00");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getHours()).toBe(14);
  });

  it("refuses an empty or unreadable value instead of storing Invalid Date", () => {
    // new Date("") is an Invalid Date, which stores as a match with no date
    // and then renders as "Invalid Date" forever.
    expect(parseMatchDate("")).toBeNull();
    expect(parseMatchDate("   ")).toBeNull();
    expect(parseMatchDate("next saturday")).toBeNull();
    expect(parseMatchDate(null)).toBeNull();
  });
});

describe("matchWhereLine", () => {
  it("says the place when there is one", () => {
    expect(matchWhereLine({ isHome: true, location: "Sportplatz Herti" })).toBe("Sportplatz Herti");
  });

  it("falls back to the one thing you always know", () => {
    expect(matchWhereLine({ isHome: true, location: null })).toBe("Home");
    expect(matchWhereLine({ isHome: false, location: null })).toBe("Away");
  });

  it("prefers the real place over home and away, even for a home game", () => {
    expect(matchWhereLine({ isHome: true, location: "Pitch 2" })).toBe("Pitch 2");
  });
});
