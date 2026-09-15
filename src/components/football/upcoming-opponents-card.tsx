import { format } from "date-fns";
import type { OpponentPreview } from "@/lib/football/opponents";
import { Badge } from "@/components/ui/badge";

export function UpcomingOpponentsCard({ previews }: { previews: OpponentPreview[] }) {
  if (previews.length === 0) {
    return (
      <p className="text-sm text-muted">
        No upcoming matches yet — add your fixtures under Matches and each opponent&apos;s league position shows up here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {previews.map(({ match, standing, rankDelta, read }) => (
        <li key={match.id} className="rounded-xl border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {match.isHome ? "vs" : "@"} {match.opponent}
            </p>
            <div className="flex items-center gap-2">
              {standing && <Badge variant={rankDelta !== null && rankDelta < 0 ? "danger" : "default"}>{standing.rank}. in the table</Badge>}
              <span className="text-xs text-muted">{format(match.date, "EEE, MMM d · HH:mm")}</span>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted">{read}</p>
        </li>
      ))}
    </ul>
  );
}
