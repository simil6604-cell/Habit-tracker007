import { describe, expect, it } from "vitest";
import { analyzeTable, ordinal, type Standing } from "@/lib/football/table-analysis";

function row(rank: number, teamName: string, played: number, won: number, drawn: number, lost: number, goalsFor: number, goalsAgainst: number): Standing {
  return { rank, teamName, played, won, drawn, lost, goalsFor, goalsAgainst, points: won * 3 + drawn };
}

/** Ten teams, five games in, us third. Numbers chosen so every figure below is checkable by hand. */
const MID_SEASON: Standing[] = [
  row(1, "FC Leader", 5, 4, 1, 0, 14, 4), // 13 pts, GD +10
  row(2, "SC Second", 5, 4, 0, 1, 11, 6), // 12 pts
  row(3, "Zug 94", 5, 2, 2, 1, 9, 8), //      8 pts, GD +1
  row(4, "D", 5, 2, 1, 2, 7, 7),
  row(5, "E", 5, 2, 1, 2, 6, 7),
  row(6, "F", 5, 1, 3, 1, 5, 6),
  row(7, "G", 5, 1, 2, 2, 5, 8),
  row(8, "H", 5, 1, 1, 3, 4, 9),
  row(9, "I", 5, 1, 0, 4, 3, 10),
  row(10, "J", 5, 0, 1, 4, 2, 11),
];

describe("analyzeTable", () => {
  it("reads the gap to first off the table", () => {
    const a = analyzeTable(MID_SEASON, "Zug 94", [])!;
    expect(a.mine.rank).toBe(3);
    expect(a.gap).toBe(13 - 8);
    expect(a.goalDiff).toBe(9 - 8);
    expect(a.goalDiffGap).toBe(10 - 1);
  });

  it("works out what is left to play and the ceiling that follows", () => {
    const a = analyzeTable(MID_SEASON, "Zug 94", [])!;
    expect(a.seasonMatches).toBe(9); // 10 teams, nobody past 9 games yet
    expect(a.matchesLeft).toBe(9 - 5);
    expect(a.maxPoints).toBe(8 + 4 * 3);
  });

  it("turns the leader's current pace into points needed", () => {
    const a = analyzeTable(MID_SEASON, "Zug 94", [])!;
    // 13 points from 5 = 2.6 a game; four left puts them on ~23.
    expect(a.leaderProjected).toBe(23);
    expect(a.pointsNeeded).toBe(23 + 1 - 8);
    expect(a.pointsPerMatchNeeded).toBe(16 / 4);
    expect(a.winsNeeded).toBe(Math.ceil(16 / 3));
  });

  it("says when the points it needs exceed the points still available", () => {
    const a = analyzeTable(MID_SEASON, "Zug 94", [])!;
    expect(a.insights.some((i) => i.includes("still available to you"))).toBe(true);
  });

  it("names the student's own weaknesses when they gave some", () => {
    const a = analyzeTable(MID_SEASON, "Zug 94", ["Finishing", "Weak foot"])!;
    expect(a.insights.some((i) => i.includes("Finishing, Weak foot"))).toBe(true);
  });

  it("returns nothing rather than guessing when the team isn't in the table", () => {
    expect(analyzeTable(MID_SEASON, "Not A Real Team", [])).toBeNull();
    expect(analyzeTable([], "Zug 94", [])).toBeNull();
  });

  // The regression that matters most: a title race written off while it was
  // still wide open. Early in a home-and-away season nobody has played more
  // than (teams - 1) games yet, so inferring the season length from the table
  // says "one round" and halves what is left to play.
  describe("declaring first place impossible", () => {
    // Eight of a possible eighteen games played. Nobody has passed nine yet, so
    // the season reads as a single round — which leaves one match and a ceiling
    // of 3 points against a leader on 24, and declares the title gone. Ten
    // matches actually remain.
    const EARLY: Standing[] = [
      row(1, "Runaway FC", 8, 8, 0, 0, 24, 2), // 24 pts
      ...Array.from({ length: 8 }, (_, i) => row(i + 2, `Mid ${i}`, 8, 3, 2, 3, 10, 10)),
      row(10, "Us", 8, 0, 0, 8, 2, 24), // 0 pts
    ];

    it("does not write off a race that a home-and-away season could still swing", () => {
      const a = analyzeTable(EARLY, "Us", [])!;
      // The single-round reading would give 9 - 8 = 1 match and a 3-point
      // ceiling, well short of the leader. That must not decide it.
      expect(a.matchesLeft).toBe(1);
      expect(a.maxPoints).toBeLessThan(a.leader.points);
      expect(a.stillPossible).toBe(true);
      expect(a.insights.some((i) => i.includes("out of reach"))).toBe(false);
    });

    it("measures the best case over the longest season the table could be", () => {
      const a = analyzeTable(EARLY, "Us", [])!;
      expect(a.bestCasePoints).toBe(0 + (18 - 8) * 3);
      expect(a.bestCasePoints).toBeGreaterThan(a.leader.points);
    });

    it("still calls a genuinely finished race finished", () => {
      const FINISHED: Standing[] = [
        row(1, "Champions", 17, 17, 0, 0, 50, 5), // 51 pts
        ...Array.from({ length: 8 }, (_, i) => row(i + 2, `Mid ${i}`, 17, 8, 2, 7, 20, 20)),
        row(10, "Us", 17, 0, 1, 16, 5, 50), // 1 pt, one game left
      ];
      const a = analyzeTable(FINISHED, "Us", [])!;
      expect(a.stillPossible).toBe(false);
      expect(a.insights.some((i) => i.includes("out of reach"))).toBe(true);
    });
  });

  it("recognises a double round-robin once someone has played past a single one", () => {
    const doubled = MID_SEASON.map((s) => ({ ...s, played: 12 }));
    const a = analyzeTable(doubled, "Zug 94", [])!;
    expect(a.seasonMatches).toBe(18);
    expect(a.matchesLeft).toBe(6);
  });

  it("greets the leader differently from the chasers", () => {
    const top = [
      { ...MID_SEASON[2], rank: 1, points: 15 },
      { ...MID_SEASON[0], rank: 2 },
    ];
    const a = analyzeTable(top, "Zug 94", [])!;
    expect(a.gap).toBe(0);
    expect(a.insights[0]).toContain("cushion");
  });
});

describe("ordinal", () => {
  // "2th" in a headline stat reads like a bug, which is how this was found.
  it("uses the right suffix", () => {
    expect([1, 2, 3, 4, 5, 10].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "5th", "10th"]);
  });

  it("handles the teens, which take 'th' despite ending in 1, 2 and 3", () => {
    expect([11, 12, 13].map(ordinal)).toEqual(["11th", "12th", "13th"]);
  });

  it("keeps working past twenty", () => {
    expect([21, 22, 23, 101, 111].map(ordinal)).toEqual(["21st", "22nd", "23rd", "101st", "111th"]);
  });
});
