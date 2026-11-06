import Link from "next/link";
import { format, isSameMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { DOMAIN_META, KIND_META, dayKey, monthParam, type PlanDomain } from "@/lib/plan/plan";
import { topTracks, type Track, type TrackerData, type TrackState } from "@/lib/plan/tracker";

/**
 * The month as a tracker, the way a wall of ticked boxes shows it.
 *
 * Asked for with photographs of a habit-tracker spreadsheet: a ring with a
 * percentage, a bar per week, a grid of ticks, and a table of which habits
 * are holding up. The difference from the spreadsheet is that nothing here
 * is typed in — the rows are the homework, workouts, trainings and matches
 * the app already knows about, and the ticks are the ones made on Tasks.
 *
 * Colour says which of the three it is, and never on its own: the app's gym
 * orange and football green sit about ΔE 6 apart for the commonest kind of
 * colour blindness, which is inside the band where colour is only allowed to
 * carry meaning alongside something else. So every row is named, every ring
 * is labelled, and a square's state is a shape — a tick, a cross, a dash —
 * before it is a colour.
 */

const STATE_GLYPH: Record<TrackState, string> = {
  DONE: "✓",
  MISSED: "✕",
  OPEN: "·",
  FUTURE: "",
  NONE: "",
};

const STATE_WORD: Record<TrackState, string> = {
  DONE: "done",
  MISSED: "missed",
  OPEN: "not ticked off",
  FUTURE: "still to come",
  NONE: "nothing planned",
};

function Donut({
  pct,
  color,
  label,
  sub,
  size = 112,
}: {
  pct: number | null;
  color: string;
  label: string;
  sub?: string;
  size?: number;
}) {
  const stroke = Math.max(8, Math.round(size / 11));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Null is not zero. An empty ring with no number says "nothing due yet",
  // which is the truth; a ring reading 0% says you failed at something that
  // has not happened.
  const filled = pct === null ? 0 : (Math.min(100, Math.max(0, pct)) / 100) * circumference;

  return (
    <figure className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${pct === null ? "nothing due yet" : `${pct}%`}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-muted)"
          strokeWidth={stroke}
        />
        {pct !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
            // Start at the top rather than at three o'clock, which is where
            // a reader expects a ring to begin.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground text-[15px] font-semibold tabular-nums"
        >
          {pct === null ? "—" : `${pct}%`}
        </text>
      </svg>
      <figcaption className="text-center">
        <span className="block text-xs font-medium">{label}</span>
        {sub && <span className="block text-[11px] text-muted">{sub}</span>}
      </figcaption>
    </figure>
  );
}

function WeeklyBars({ weeks }: { weeks: TrackerData["weeks"] }) {
  const tallest = Math.max(1, ...weeks.map((week) => week.due));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-32 items-end gap-2" role="list" aria-label="Done each week">
        {weeks.map((week) => {
          // Height by how much was DUE, filled by how much was done — one
          // axis, one scale. A busy week and a quiet one are not the same
          // bar at the same height just because both were half finished.
          const height = (week.due / tallest) * 100;
          const fill = week.due === 0 ? 0 : (week.done / week.due) * 100;
          return (
            // h-full on the column, or the percentage heights below have no
            // definite parent to resolve against and every bar collapses to
            // nothing — which is exactly what the first version did.
            <div
              key={week.label}
              role="listitem"
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              title={`${week.label}: ${week.done} of ${week.due} done${week.pct === null ? "" : ` (${week.pct}%)`}`}
            >
              <span className="text-[10px] tabular-nums text-muted">
                {week.pct === null ? "—" : `${week.pct}%`}
              </span>
              <div
                className="flex w-full items-end justify-center rounded-t-[4px] bg-surface-muted"
                style={{ height: `${Math.max(height, week.due === 0 ? 3 : 8)}%` }}
              >
                <div
                  className="w-full rounded-t-[4px] bg-accent"
                  style={{ height: `${fill}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2">
        {weeks.map((week) => (
          <span key={week.label} className="min-w-0 flex-1 text-center text-[10px] text-muted">
            {week.label.replace("Week ", "W")}
          </span>
        ))}
      </div>
    </div>
  );
}

function DomainDot({ domain }: { domain: PlanDomain }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: DOMAIN_META[domain].color }}
    />
  );
}

function TrackerGrid({ data, month }: { data: TrackerData; month: Date }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-left" data-testid="tracker-grid">
        <caption className="sr-only">
          Every day of {format(month, "MMMM yyyy")}, one row per thing you do
        </caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-surface pb-1 pr-2 text-[11px] font-medium text-muted">
              What
            </th>
            {data.days.map((day) => (
              <th
                key={dayKey(day)}
                scope="col"
                className={cn(
                  "pb-1 text-center text-[9px] font-medium tabular-nums",
                  isSameMonth(day, month) ? "text-muted" : "text-muted/40"
                )}
              >
                {/* The day number is the way back to what was actually on
                    that day, which is the question a filled square makes
                    you ask. */}
                <Link
                  href={`/tasks?month=${monthParam(month)}&day=${dayKey(day)}`}
                  title={`What was on ${format(day, "EEEE d MMMM")}`}
                  className="hover:text-accent"
                >
                  {format(day, "d")}
                </Link>
              </th>
            ))}
            <th scope="col" className="pb-1 pl-2 text-right text-[11px] font-medium text-muted">
              %
            </th>
          </tr>
        </thead>
        <tbody>
          {data.tracks.map((track) => (
            <tr key={track.sourceKey} data-testid={`tracker-row-${track.sourceKey}`}>
              <th
                scope="row"
                className="sticky left-0 z-10 max-w-[9rem] truncate bg-surface py-0.5 pr-2 text-xs font-normal"
              >
                <span className="flex items-center gap-1.5">
                  <DomainDot domain={track.domain} />
                  <span className="truncate" title={`${DOMAIN_META[track.domain].label} · ${track.title}`}>
                    {track.title}
                  </span>
                </span>
              </th>
              {track.cells.map((cell) => (
                <td key={dayKey(cell.date)} className="p-[1px]">
                  <span
                    title={`${track.title} — ${format(cell.date, "EEE d MMM")}: ${STATE_WORD[cell.state]}`}
                    className={cn(
                      "flex h-4 w-full min-w-[0.9rem] items-center justify-center rounded-[3px] text-[9px] leading-none",
                      cell.state === "NONE" && "bg-transparent",
                      cell.state === "FUTURE" && "border border-dashed border-border",
                      cell.state === "OPEN" && "border border-border text-muted",
                      cell.state === "MISSED" && "border border-danger text-danger",
                      cell.state === "DONE" && "text-white"
                    )}
                    style={
                      cell.state === "DONE"
                        ? { background: DOMAIN_META[track.domain].color }
                        : undefined
                    }
                  >
                    {STATE_GLYPH[cell.state]}
                  </span>
                </td>
              ))}
              <td className="pl-2 text-right text-xs tabular-nums text-muted">
                {track.pct === null ? "—" : `${track.pct}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopTracks({ tracks }: { tracks: Track[] }) {
  const best = topTracks(tracks);
  if (best.length === 0) return null;

  return (
    <table className="w-full text-left text-sm" data-testid="tracker-top">
      <thead>
        <tr className="text-[11px] font-medium uppercase tracking-wider text-muted">
          <th scope="col" className="pb-2">What</th>
          <th scope="col" className="pb-2">Progress</th>
          <th scope="col" className="pb-2 text-right">Done</th>
          <th scope="col" className="pb-2 text-right">Best run</th>
        </tr>
      </thead>
      <tbody>
        {best.map((track) => (
          <tr key={track.sourceKey} className="border-t border-border">
            <th scope="row" className="py-2 pr-3 font-normal">
              <span className="flex items-center gap-1.5">
                <DomainDot domain={track.domain} />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{track.title}</span>
                  <span className="block text-[11px] text-muted">
                    {DOMAIN_META[track.domain].label}
                    {track.context ? ` · ${track.context}` : ""} · {KIND_META[track.kind].label}
                  </span>
                </span>
              </span>
            </th>
            <td className="w-1/3 py-2 pr-3">
              <span className="flex items-center gap-2">
                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${track.pct ?? 0}%`,
                      background: DOMAIN_META[track.domain].color,
                    }}
                  />
                </span>
                <span className="w-9 shrink-0 text-right text-xs tabular-nums">
                  {track.pct === null ? "—" : `${track.pct}%`}
                </span>
              </span>
            </td>
            <td className="py-2 text-right text-xs tabular-nums text-muted">
              {track.done}/{track.due}
            </td>
            <td className="py-2 text-right text-xs tabular-nums text-muted">{track.longestStreak}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TrackerDashboard({ data, month }: { data: TrackerData; month: Date }) {
  if (data.tracks.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted">
        Nothing planned in {format(month, "MMMM")} yet. Homework, workouts, football training and matches all
        land here on their own — tick them off under Tasks and this fills in.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-wrap items-start justify-center gap-5 rounded-2xl border border-border bg-surface p-5">
          <Donut
            pct={data.pct}
            color="var(--accent)"
            label="Everything"
            sub={`${data.done} of ${data.due} done`}
            size={128}
          />
          {data.domains.map((roll) => (
            <Donut
              key={roll.domain}
              pct={roll.pct}
              color={DOMAIN_META[roll.domain].color}
              label={DOMAIN_META[roll.domain].label}
              sub={`${roll.done} of ${roll.due}`}
              size={88}
            />
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold">Week by week</h3>
          <p className="mb-3 text-xs text-muted">
            How tall the bar is, is how much there was to do. How much is filled in, is how much got done.
          </p>
          <WeeklyBars weeks={data.weeks} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Every day of {format(month, "MMMM")}</h3>
          <Legend />
        </div>
        <div className="mt-3">
          <TrackerGrid data={data} month={month} />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold">What is holding up</h3>
        <p className="mb-3 text-xs text-muted">
          Best run is the most times in a row you have done it, skipping the days it was not on.
        </p>
        <TopTracks tracks={data.tracks} />
      </div>
    </div>
  );
}

function Legend() {
  return (
    <ul data-testid="tracker-legend" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      {(["SCHOOL", "GYM", "FOOTBALL"] as PlanDomain[]).map((domain) => (
        <li key={domain} className="flex items-center gap-1">
          <DomainDot domain={domain} />
          {DOMAIN_META[domain].label}
        </li>
      ))}
      <li className="flex items-center gap-1">
        <span aria-hidden className="inline-block rounded-[3px] bg-foreground/80 px-1 text-[9px] leading-tight text-background">✓</span>
        done
      </li>
      <li className="flex items-center gap-1">
        <span aria-hidden className="inline-block rounded-[3px] border border-danger px-1 text-[9px] leading-tight text-danger">✕</span>
        missed
      </li>
    </ul>
  );
}
