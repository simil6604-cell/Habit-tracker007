import { ordinal, type TableAnalysis } from "@/lib/football/table-analysis";
import { Badge } from "@/components/ui/badge";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-muted px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-lg font-semibold leading-tight">{value}</p>
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function RaceToFirstCard({ analysis }: { analysis: TableAnalysis }) {
  const a = analysis;
  const top = a.mine.rank === 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Position" value={ordinal(a.mine.rank)} hint={`of ${a.teamsInLeague}`} />
        <Stat label="Points" value={String(a.mine.points)} hint={top ? "leading" : `${a.gap} behind 1st`} />
        <Stat
          label="Goal difference"
          value={`${a.goalDiff >= 0 ? "+" : ""}${a.goalDiff}`}
          hint={a.goalDiffGap > 0 ? `${a.goalDiffGap} behind the leader` : "level or better"}
        />
        <Stat label="Matches left" value={String(a.matchesLeft)} hint={`max ${a.maxPoints} pts`} />
      </div>

      {!top && (
        <div className="rounded-xl border border-border p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">What 1st place takes</span>
            {a.stillPossible ? (
              <Badge variant="accent">Still reachable</Badge>
            ) : (
              <Badge variant="danger">Out of reach on points</Badge>
            )}
          </div>
          {a.stillPossible ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Points needed" value={String(a.pointsNeeded)} hint={`from ${a.matchesLeft} matches`} />
              <Stat label="That's about" value={`${a.winsNeeded} win${a.winsNeeded === 1 ? "" : "s"}`} hint={a.pointsPerMatchNeeded !== null ? `${a.pointsPerMatchNeeded} pts per match` : undefined} />
              <Stat label="Goals of difference" value={a.goalDiffGap > 0 ? `+${a.goalDiffGap}` : "—"} hint={a.goalDiffGap > 0 ? "to win a tie on GD" : "not the deciding factor"} />
            </div>
          ) : (
            <p className="text-sm text-muted">
              Winning every remaining match reaches {a.maxPoints} points; {a.leader.teamName} already has {a.leader.points}.
            </p>
          )}
        </div>
      )}

      <ul className="flex flex-col gap-1.5 text-sm text-muted">
        {a.insights.map((i) => (
          <li key={i}>• {i}</li>
        ))}
      </ul>

      <p className="text-xs text-muted">{a.seasonNote} Every figure is arithmetic on the table you synced — nothing here is invented.</p>
    </div>
  );
}
