import Link from "next/link";
import type { Standing, TableAnalysis } from "@/lib/football/table-analysis";
import { Badge } from "@/components/ui/badge";

/**
 * The top of the table plus your own row, even when you sit outside the top
 * few — the gap is marked with an ellipsis row so the jump is visible rather
 * than looking like a table that just stops.
 */
function rowsToShow(standings: Standing[], myRank: number | null, topN = 4): (Standing | "gap")[] {
  const sorted = [...standings].sort((a, b) => a.rank - b.rank);
  const top = sorted.slice(0, topN);
  if (myRank === null || top.some((s) => s.rank === myRank)) return top;

  const mineRow = sorted.find((s) => s.rank === myRank);
  if (!mineRow) return top;
  const above = sorted.find((s) => s.rank === myRank - 1);
  const extra = above && !top.includes(above) ? [above, mineRow] : [mineRow];
  return [...top, "gap", ...extra];
}

export function LeagueSnapshot({
  standings,
  myTeamName,
  analysis,
}: {
  standings: Standing[];
  myTeamName: string;
  analysis: TableAnalysis | null;
}) {
  if (standings.length === 0) {
    return (
      <p className="text-sm text-muted">
        No table yet. Paste your league&apos;s table link above and hit Fetch table — or enter the rows by hand on the{" "}
        <Link href="/football/team" className="text-accent underline">Team &amp; table</Link> page.
      </p>
    );
  }

  const rows = rowsToShow(standings, analysis?.mine.rank ?? null);

  return (
    <div className="flex flex-col gap-3">
      {/* min-w-0 so the table scrolls inside this box rather than widening the page. */}
      <div className="min-w-0 overflow-x-auto">
        <table className="w-full min-w-[380px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="py-1.5 pr-2">#</th>
              <th className="py-1.5 pr-2">Team</th>
              <th className="py-1.5 pr-2">P</th>
              <th className="py-1.5 pr-2">GF:GA</th>
              <th className="py-1.5 pr-2">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) =>
              r === "gap" ? (
                <tr key={`gap-${i}`}><td colSpan={5} className="py-1 text-center text-xs text-muted">⋯</td></tr>
              ) : (
                <tr
                  key={r.rank}
                  className={`border-b border-border/60 ${r.teamName.toLowerCase() === myTeamName.toLowerCase() ? "bg-accent/10 font-medium" : ""}`}
                >
                  <td className="py-1.5 pr-2">{r.rank}</td>
                  <td className="py-1.5 pr-2">
                    {r.teamName}
                    {r.teamName.toLowerCase() === myTeamName.toLowerCase() && <Badge variant="accent" className="ml-2">You</Badge>}
                  </td>
                  <td className="py-1.5 pr-2">{r.played}</td>
                  <td className="py-1.5 pr-2">{r.goalsFor}:{r.goalsAgainst}</td>
                  <td className="py-1.5 pr-2">{r.points}</td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      {analysis && analysis.mine.rank !== 1 && (
        <p className="text-sm">
          {analysis.stillPossible ? (
            <>
              1st place needs <strong>{analysis.pointsNeeded} points</strong> from your remaining{" "}
              <strong>{analysis.matchesLeft}</strong>
              {analysis.goalDiffGap > 0 && <> and <strong>{analysis.goalDiffGap} goals</strong> of difference on a tie</>}.
            </>
          ) : (
            <>1st is out of reach on points — {analysis.leader.teamName} has {analysis.leader.points} and your ceiling is {analysis.maxPoints}.</>
          )}{" "}
          <Link href="/football/team" className="text-accent underline">Full table &amp; analysis →</Link>
        </p>
      )}
      {analysis?.mine.rank === 1 && (
        <p className="text-sm">
          You&apos;re top of the table.{" "}
          <Link href="/football/team" className="text-accent underline">Full table &amp; analysis →</Link>
        </p>
      )}
      {!analysis && (
        <p className="text-sm text-muted">
          Your team name doesn&apos;t match any row in this table, so there&apos;s no position to analyse — rename it in
          the profile above to match the league table exactly.
        </p>
      )}
    </div>
  );
}
