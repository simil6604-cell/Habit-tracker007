import { Card, CardContent } from "@/components/ui/card";
import { MilestoneFilters } from "./milestone-filters";
import {
  filterMilestones,
  milestoneCounts,
  unitFor,
  type MilestoneTab,
  type ProgressPlan,
  type ScoredMilestone,
} from "@/lib/progress/milestones";

/**
 * One domain's progress plan.
 *
 * Shared markup, three separate plans. Each page passes its OWN plan and its
 * own accent, and nothing on this component adds anything across domains —
 * it never sees more than one plan at a time, which is the structural version
 * of the promise that School, Gym and Football stay apart.
 */

const ACCENT: Record<ProgressPlan["domain"], { bar: string; tint: string; text: string }> = {
  SCHOOL: { bar: "var(--cat-school)", tint: "bg-cat-school/10", text: "text-cat-school" },
  GYM: { bar: "var(--cat-gym)", tint: "bg-cat-gym/10", text: "text-cat-gym" },
  FOOTBALL: { bar: "var(--cat-football)", tint: "bg-cat-football/10", text: "text-cat-football" },
};

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-border">
      {/* Nothing is drawn at 0%: a rounded stub at the left edge reads as "a
          little bit done" when the honest answer is "not started". */}
      {pct > 0 && <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />}
    </div>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-border bg-surface p-4">
      <span className={`text-2xl font-semibold tabular-nums sm:text-3xl ${accent ?? ""}`}>{value}</span>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span>
    </div>
  );
}

function MilestoneRow({ milestone, color }: { milestone: ScoredMilestone; color: string }) {
  return (
    <li
      data-testid={`milestone-${milestone.id}`}
      data-done={milestone.done ? "true" : "false"}
      className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            {milestone.done && <span aria-hidden>✅</span>}
            {milestone.name}
          </p>
          <p className="text-xs text-muted">{milestone.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums">{milestone.pct}%</p>
          <p className="text-[11px] text-muted tabular-nums">
            {Math.min(milestone.value, milestone.target)} / {milestone.target} {unitFor(milestone, milestone.target)}
          </p>
        </div>
      </div>
      <Bar pct={milestone.pct} color={color} />
      <p className="text-[11px] text-muted">
        {milestone.done
          ? `Done · ${milestone.category}`
          : `${milestone.remaining} ${unitFor(milestone, milestone.remaining)} to go · ${milestone.category}`}
      </p>
    </li>
  );
}

export function ProgressPlanPanel({
  plan,
  title,
  tab,
  query,
  basePath,
}: {
  plan: ProgressPlan;
  title: string;
  tab: MilestoneTab;
  query: string;
  /** The page this plan lives on, so the filters keep you there. */
  basePath: string;
}) {
  const accent = ACCENT[plan.domain];
  const counts = milestoneCounts(plan.milestones, query);
  const shown = filterMilestones(plan.milestones, tab, query);

  return (
    <section id={`progress-${plan.domain.toLowerCase()}`} className="scroll-mt-20">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted">Progress · Milestones</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h2>
            <p className="mt-1 text-sm text-muted">Where you stand, and where there is room to be better.</p>
          </div>

          {plan.next ? (
            <div className={`rounded-2xl border border-border p-5 ${accent.tint}`} data-testid="next-up">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-[11px] font-medium uppercase tracking-wider ${accent.text}`}>Next up</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight">{plan.next.name}</p>
                  <p className="text-sm text-muted">{plan.next.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-3xl font-semibold tabular-nums ${accent.text}`}>{plan.next.pct}%</p>
                  <p className="text-xs text-muted tabular-nums">
                    {Math.min(plan.next.value, plan.next.target)} / {plan.next.target} {unitFor(plan.next, plan.next.target)}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <Bar pct={plan.next.pct} color={accent.bar} />
              </div>
            </div>
          ) : (
            <div className={`rounded-2xl border border-border p-5 ${accent.tint}`} data-testid="next-up">
              <p className={`text-[11px] font-medium uppercase tracking-wider ${accent.text}`}>All done</p>
              <p className="mt-1 text-xl font-semibold tracking-tight">
                {plan.milestones.length === 0 ? "Nothing to measure yet" : "Every milestone here is finished"}
              </p>
              <p className="text-sm text-muted">
                {plan.milestones.length === 0
                  ? "Add something in this area and the milestones start counting."
                  : "Nothing left on this list — which is a real answer, not a placeholder."}
              </p>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="progress-stats">
            <Stat value={String(plan.completed)} label="Completed" accent={accent.text} />
            <Stat value={String(plan.remaining)} label="Remaining" />
            <Stat value={`${plan.overallPct}%`} label="Progress" />
            {plan.highlights.map((highlight) => (
              <Stat key={highlight.label} value={highlight.value} label={highlight.label} />
            ))}
          </div>

          {plan.focus.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface-muted p-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">
                Where you can be better
              </p>
              <ul className="flex flex-col gap-2" data-testid="progress-focus">
                {plan.focus.map((line) => (
                  <li key={line} className="flex gap-2 text-sm">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accent.bar }} />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <MilestoneFilters basePath={basePath} counts={counts} tab={tab} query={query} />

          {shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted">
              Nothing on this list matches that.
            </p>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2" data-testid="milestone-list">
              {shown.map((milestone) => (
                <MilestoneRow key={milestone.id} milestone={milestone} color={accent.bar} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
