"use client";

const COLORS: Record<string, string> = {
  School: "var(--cat-school)",
  Gym: "var(--cat-gym)",
  Football: "var(--cat-football)",
};

/**
 * One week's split, as a single stacked bar.
 *
 * This was a donut, and the page now has a donut in the overview showing the
 * same three categories over all time. Two rings of the same thing one above
 * the other is the reader's problem, not a design: the eye compares them and
 * gets nothing for it. A bar answers "this week" at a glance, stacks against
 * the ring rather than competing with it, and does not collapse into an odd
 * shape when only one domain has anything in it — which is what the donut did
 * here, leaving the legend stranded at one edge of the card.
 *
 * Each segment is directly labelled underneath. The app's gym orange and
 * football green sit close together for red-green colour blindness, so the
 * labels are what carry identity; the 2px gaps stop two segments melting into
 * one another.
 */
export function WeeklyTimeSplitChart({ data }: { data: { name: string; minutes: number }[] }) {
  const total = data.reduce((sum, entry) => sum + entry.minutes, 0);
  if (total === 0) return null;

  const label = (minutes: number) => (minutes >= 60 ? `${Math.round((minutes / 60) * 10) / 10}h` : `${minutes}m`);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={data.map((d) => `${d.name} ${label(d.minutes)}`).join(", ")}>
        {data.map((entry) => (
          <div
            key={entry.name}
            title={`${entry.name}: ${label(entry.minutes)}`}
            style={{ width: `${(entry.minutes / total) * 100}%`, background: COLORS[entry.name] ?? "var(--muted)" }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2" data-testid="week-split-legend">
        {data.map((entry) => (
          <li key={entry.name} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: COLORS[entry.name] ?? "var(--muted)" }}
            />
            <span className="text-muted">{entry.name}</span>
            <span className="font-medium tabular-nums">{label(entry.minutes)}</span>
            <span className="text-xs tabular-nums text-muted">{Math.round((entry.minutes / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
