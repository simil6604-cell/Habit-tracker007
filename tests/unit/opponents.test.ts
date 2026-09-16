import { describe, expect, it } from "vitest";
import { previewOpponents } from "@/lib/football/opponents";
import type { Standing } from "@/lib/football/table-analysis";

const s = (rank: number, teamName: string, points: number, goalsFor = 10, goalsAgainst = 10): Standing => ({
  rank,
  teamName,
  played: 5,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor,
  goalsAgainst,
  points,
});

const TABLE: Standing[] = [
  s(1, "SC Cham", 13, 14, 4),
  s(2, "FC Baar", 12, 11, 6),
  s(3, "FC Zug 94", 8, 9, 8),
  s(4, "FC Rotkreuz", 7),
];

const fixture = (opponent: string) => ({ id: opponent, opponent, date: new Date("2099-01-10T15:00:00Z"), isHome: true });

describe("previewOpponents", () => {
  it("matches a name typed by hand to its fuller form in the table", () => {
    const [p] = previewOpponents([fixture("Baar")], TABLE, "FC Zug 94");
    expect(p.standing?.teamName).toBe("FC Baar");
  });

  it("works the other way round too, when you type more than the table lists", () => {
    const [p] = previewOpponents([fixture("FC Rotkreuz 1")], TABLE, "FC Zug 94");
    expect(p.standing?.teamName).toBe("FC Rotkreuz");
  });

  it("frames a team above you as a six-pointer and one below as must-not-drop", () => {
    const [above, below] = previewOpponents([fixture("Baar"), fixture("Rotkreuz")], TABLE, "FC Zug 94");
    expect(above.rankDelta).toBe(2 - 3);
    expect(above.read).toContain("six-pointer");
    expect(below.rankDelta).toBe(4 - 3);
    expect(below.read).toContain("can't afford to drop");
  });

  it("says a name isn't in the table instead of pairing it with the wrong club", () => {
    const [p] = previewOpponents([fixture("Luzern Reserve")], TABLE, "FC Zug 94");
    expect(p.standing).toBeNull();
    expect(p.read).toContain("Not matched");
  });

  it("treats an ambiguous name as no match rather than picking one", () => {
    const withTwoZugs = [...TABLE, s(5, "SC Zug United", 6)];
    const [p] = previewOpponents([fixture("Zug")], withTwoZugs, "FC Zug 94");
    expect(p.standing).toBeNull();
  });

  // A club listed as just "FC" normalises to an empty string, which is
  // "contained in" every other name — so it matched every fixture.
  it("ignores a table row whose name is nothing but a club prefix", () => {
    const withBareFC = [s(1, "FC", 15), ...TABLE.slice(1)];
    // "Rotkreuz 1" deliberately does not match any row exactly, so the fuzzy
    // path runs — which is where a name that normalises to "" used to match
    // everything, making every fixture look ambiguous and resolve to nothing.
    const [p] = previewOpponents([fixture("Rotkreuz 1")], withBareFC, "FC Zug 94");
    expect(p.standing?.teamName).toBe("FC Rotkreuz");
  });

  it("still lists a fixture when there is no table at all", () => {
    const [p] = previewOpponents([fixture("Baar")], [], "FC Zug 94");
    expect(p.match.opponent).toBe("Baar");
    expect(p.standing).toBeNull();
  });

  it("flags a high-scoring opponent so the reading isn't only about position", () => {
    const [p] = previewOpponents([fixture("Cham")], TABLE, "FC Zug 94");
    expect(p.read).toContain("the back line decides this one");
  });

  it("honours the limit, so a long fixture list doesn't flood the card", () => {
    const many = ["Baar", "Cham", "Rotkreuz", "A", "B", "C"].map(fixture);
    expect(previewOpponents(many, TABLE, "FC Zug 94", 3)).toHaveLength(3);
  });
});
