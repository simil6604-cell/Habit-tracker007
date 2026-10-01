import { format } from "date-fns";
import type { OpponentPreview } from "@/lib/football/opponents";
import { Badge } from "@/components/ui/badge";
import { matchWhereLine } from "@/lib/football/match-details";

export function UpcomingOpponentsCard({ previews }: { previews: OpponentPreview[] }) {
  if (previews.length === 0) {
    return (
      <p className="text-sm text-muted" data-testid="upcoming-opponents">
        No upcoming matches yet — add one under Matches, with the day, the kick-off time and where it is played.
        Each opponent&apos;s league position shows up here next to it.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2" data-testid="upcoming-opponents">
      {previews.map(({ match, standing, rankDelta, read }) => (
        <li key={match.id} className="rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {match.isHome ? "vs" : "@"} {match.opponent}
            </p>
            <div className="flex items-center gap-2">
              {standing && <Badge variant={rankDelta !== null && rankDelta < 0 ? "danger" : "default"}>{standing.rank}. in the table</Badge>}
              <span className="text-xs text-muted">
                {format(match.date, "EEE, d MMM · HH:mm")} · {matchWhereLine({ isHome: match.isHome, location: match.location ?? null })}
              </span>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted">{read}</p>
        </li>
      ))}
    </ul>
  );
}
