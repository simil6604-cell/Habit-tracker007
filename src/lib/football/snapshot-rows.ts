import type { Standing } from "./table-analysis";

/**
 * The top of the table plus your own row, even when you sit outside the top
 * few — the gap is marked with an ellipsis row so the jump is visible rather
 * than looking like a table that just stops.
 */
export function rowsToShow(standings: Standing[], myRank: number | null, topN = 4): (Standing | "gap")[] {
  const sorted = [...standings].sort((a, b) => a.rank - b.rank);
  const top = sorted.slice(0, topN);
  if (myRank === null || top.some((s) => s.rank === myRank)) return top;

  const mineRow = sorted.find((s) => s.rank === myRank);
  if (!mineRow) return top;
  const above = sorted.find((s) => s.rank === myRank - 1);
  const extra = above && !top.includes(above) ? [above, mineRow] : [mineRow];

  // Only mark a gap when rows are actually skipped. Sitting 5th under a top
  // four skips nobody, and an ellipsis there says the table hides something
  // it does not.
  const lastShown = top[top.length - 1];
  const skipsRows = !lastShown || extra[0].rank > lastShown.rank + 1;
  return skipsRows ? [...top, "gap", ...extra] : [...top, ...extra];
}
