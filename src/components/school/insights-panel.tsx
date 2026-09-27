import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MemoryStrengthMeter } from "@/components/charts/memory-strength-meter";
import { DueForecastChart, type ForecastPoint } from "@/components/charts/due-forecast-chart";
import type { SchoolInsights } from "@/lib/school/insights";

/**
 * A stat tile. The number is the mark, so it is the biggest thing in the box.
 *
 * `value` is a string rather than a number on purpose: the honest answer is
 * sometimes "Not measured", and a tile that had to print a number would print
 * a zero instead — which is a different and untrue claim.
 */
function Stat({
  label,
  value,
  note,
  icon,
  muted,
}: {
  label: string;
  value: string;
  note: string;
  icon: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span>
        <span aria-hidden className="text-base">{icon}</span>
      </div>
      <span
        className={`text-3xl font-semibold tabular-nums sm:text-4xl ${muted ? "text-muted" : "text-foreground"}`}
      >
        {value}
      </span>
      <span className="text-xs text-muted">{note}</span>
    </div>
  );
}

export function InsightsPanel({ insights }: { insights: SchoolInsights }) {
  const forecast: ForecastPoint[] = insights.forecast.map((day, i) => ({
    label: format(day.date, "d"),
    full: i === 0 ? `Today, ${format(day.date, "EEE d MMM")}` : format(day.date, "EEE d MMM"),
    count: day.count,
    isToday: i === 0,
    todayLabel: i === 0 ? "today" : "",
  }));

  const hasForecast = insights.forecast.some((day) => day.count > 0);

  return (
    <section id="school-insights" className="mt-4 scroll-mt-20">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Your learning</p>
              <h2 className="text-2xl font-semibold tracking-tight">Insights</h2>
            </div>
            {insights.due > 0 && (
              <Link href="/school/flashcards">
                <Button size="sm">Review {insights.due} due →</Button>
              </Link>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface-muted p-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted">📍 Where you stand</p>
              <ul className="flex flex-col gap-2" data-testid="where-you-stand">
                {insights.stand.map((line) => (
                  <li key={line} className="flex gap-2 text-sm">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border bg-surface-muted p-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted">✅ Do this next</p>
              <div className="flex flex-col gap-2" data-testid="do-this-next">
                {insights.next.map((action) => (
                  <Link
                    key={action.title}
                    href={action.href}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 transition hover:border-accent"
                  >
                    <span aria-hidden className="text-lg">{action.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{action.title}</span>
                      <span className="block text-xs text-muted">{action.detail}</span>
                    </span>
                    <span aria-hidden className="text-muted">›</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="insight-stats">
            <Stat
              label="Due now"
              icon="🎯"
              value={String(insights.due)}
              note={
                insights.due === 0
                  ? "nothing waiting"
                  : insights.due === insights.buckets.neverOpened
                    ? "all never opened"
                    : "ready to review"
              }
            />
            <Stat
              label="Recall"
              icon="🧠"
              value={insights.recall.measured ? `${insights.recall.pct}%` : "Not measured"}
              muted={!insights.recall.measured}
              note={
                insights.recall.measured
                  ? `${insights.recall.right} of ${insights.recall.answered} right last time`
                  : "no card answered yet"
              }
            />
            <Stat
              label="Time studied"
              icon="⏱️"
              value={`${insights.study.minutes}m`}
              note={`${insights.study.sessions} ${insights.study.sessions === 1 ? "session" : "sessions"} ticked off`}
            />
            <Stat
              label="Study streak"
              icon="🔥"
              value={String(insights.streak)}
              note={insights.streak === 1 ? "day in a row" : "days in a row"}
            />
          </div>

          <p className="text-xs text-muted">
            Recall is how many cards you got right the last time you saw them — this app keeps only your most recent
            answer per card, not a full history, so it is not a lifetime accuracy. Time studied and the streak count
            study blocks you ticked off in the planner; anything you did without writing it down is missing here rather
            than zero.
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-surface-muted p-4">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted">🧠 Memory strength</p>
              <MemoryStrengthMeter buckets={insights.buckets} />
            </div>

            <div className="rounded-2xl border border-border bg-surface-muted p-4">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted">
                📅 Due in the next 14 days
              </p>
              {hasForecast ? (
                <>
                  <p className="mb-2 text-sm">
                    {insights.heaviestDay
                      ? `Heaviest day is ${
                          insights.heaviestDay === insights.forecast[0]
                            ? "today"
                            : format(insights.heaviestDay.date, "EEE d MMM")
                        } with ${insights.heaviestDay.count} ${insights.heaviestDay.count === 1 ? "card" : "cards"}.`
                      : null}
                  </p>
                  <DueForecastChart data={forecast} />
                </>
              ) : (
                <p className="text-sm text-muted">
                  {insights.total === 0
                    ? "No flashcards yet, so nothing is scheduled."
                    : "Nothing falls due in the next fortnight."}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
