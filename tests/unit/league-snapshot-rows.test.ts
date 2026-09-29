import { describe, expect, it } from "vitest";
import { rowsToShow } from "@/lib/football/snapshot-rows";
import type { Standing } from "@/lib/football/table-analysis";

const row = (rank: number): Standing => ({
  rank,
  teamName: `Team ${rank}`,
  played: 5,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  points: 0,
});

const TABLE = Array.from({ length: 10 }, (_, i) => row(i + 1));
const ranks = (rows: (Standing | "gap")[]) => rows.map((r) => (r === "gap" ? "gap" : r.rank));

describe("rowsToShow", () => {
  it("shows the top four and nothing else when you are in them", () => {
    expect(ranks(rowsToShow(TABLE, 2))).toEqual([1, 2, 3, 4]);
  });

  it("marks the jump when rows really are skipped", () => {
    // 8th: ranks 5 and 6 are not on screen, so the ellipsis is telling the
    // truth about a table that skips.
    expect(ranks(rowsToShow(TABLE, 8))).toEqual([1, 2, 3, 4, "gap", 7, 8]);
  });

  it("does not mark a jump between two adjacent rows", () => {
    // 5th, directly under the top four. Nothing is hidden, so an ellipsis
    // there claims the table is leaving something out.
    expect(ranks(rowsToShow(TABLE, 5))).toEqual([1, 2, 3, 4, 5]);
    // 6th brings 5th along with it, which again skips nobody.
    expect(ranks(rowsToShow(TABLE, 6))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("falls back to the top when your rank is unknown or not in the table", () => {
    expect(ranks(rowsToShow(TABLE, null))).toEqual([1, 2, 3, 4]);
    expect(ranks(rowsToShow(TABLE, 99))).toEqual([1, 2, 3, 4]);
  });
});
