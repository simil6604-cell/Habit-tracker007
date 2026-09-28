/**
 * The progress plan behind School, Gym and Football.
 *
 * Three separate plans, one engine. Each domain brings its own milestones,
 * measured from its own rows, and each renders on its own page — a single
 * combined score across all three would hide exactly what this is for, which
 * is seeing where you stand in ONE thing and what would move it.
 *
 * Everything here is pure. A milestone is a target and a real number, never a
 * grade and never an opinion: "12 of 20 sessions logged" is a fact the person
 * can check against their own memory, and that is what makes the rest of the
 * page worth believing.
 */

export type MilestoneDomain = "SCHOOL" | "GYM" | "FOOTBALL";

export type Milestone = {
  id: string;
  name: string;
  description: string;
  /** Groups milestones and is searchable: "Consistency", "Mastery", … */
  category: string;
  target: number;
  /** The real, measured number. Never an estimate. */
  value: number;
  /** What the numbers are: "sessions", "topics", "days". */
  unit: string;
  /**
   * The singular, when dropping an "s" would not produce it.
   *
   * "1 areas to go" is the kind of small wrongness that makes a page feel
   * machine-written, and the naive fix turns "entries" into "entrie".
   */
  unitOne?: string;
};

export type ScoredMilestone = Milestone & {
  pct: number;
  done: boolean;
  remaining: number;
};

/**
 * The unit, agreeing with the number in front of it.
 *
 * Dropping a trailing "s" is right for sessions, topics, plans, areas, PBs and
 * weigh-ins, and wrong for entries — which is why a milestone can name its own
 * singular and this is only the fallback. "kg" has no "s" and is left alone.
 */
export function unitFor(milestone: Pick<Milestone, "unit" | "unitOne">, count: number): string {
  if (count === 1) return milestone.unitOne ?? milestone.unit.replace(/s$/, "");
  return milestone.unit;
}

export function scoreMilestone(milestone: Milestone): ScoredMilestone {
  // A target of zero is a milestone nobody can fail and nobody can work at, so
  // it counts as done rather than dividing by zero and rendering NaN%.
  const target = Math.max(0, milestone.target);
  const value = Math.max(0, milestone.value);
  if (target === 0) {
    return { ...milestone, pct: 100, done: true, remaining: 0 };
  }
  const done = value >= target;
  return {
    ...milestone,
    // Capped: going past a target is not 140% of a milestone, it is done.
    pct: Math.min(100, Math.round((value / target) * 100)),
    done,
    remaining: done ? 0 : target - value,
  };
}

/**
 * The one worth doing next: the unfinished milestone closest to its target.
 *
 * Closest by proportion rather than by how few are left, because "3 more
 * sessions" out of 5 is nearer done than "3 more" out of 50. Ties go to the
 * one needing fewer, and then to the earlier one in the list so the card does
 * not reshuffle between two equal milestones on every reload.
 */
export function nextUp(milestones: ScoredMilestone[]): ScoredMilestone | null {
  const open = milestones.filter((m) => !m.done);
  if (open.length === 0) return null;
  return open.reduce((best, candidate) => {
    if (candidate.pct !== best.pct) return candidate.pct > best.pct ? candidate : best;
    return candidate.remaining < best.remaining ? candidate : best;
  });
}

export type MilestoneTab = "ALL" | "COMPLETED" | "REMAINING";

export function parseMilestoneTab(value: string | undefined): MilestoneTab {
  return value === "COMPLETED" || value === "REMAINING" ? value : "ALL";
}

export function matchesMilestone(milestone: ScoredMilestone, query: string): boolean {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = `${milestone.name} ${milestone.description} ${milestone.category}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export type ProgressPlan = {
  domain: MilestoneDomain;
  milestones: ScoredMilestone[];
  completed: number;
  remaining: number;
  /** Share of milestones finished — not an average of part-done ones. */
  overallPct: number;
  next: ScoredMilestone | null;
  /**
   * Where there is room to get better, in plain sentences.
   *
   * Separate from the milestone list because a list of targets says what is
   * unfinished, not what is WEAK — and those are different questions. Each
   * domain writes its own from its own data.
   */
  focus: string[];
  /** Two numbers worth showing beside the milestone counts, per domain. */
  highlights: { label: string; value: string; note: string }[];
};

export function buildPlan(
  domain: MilestoneDomain,
  milestones: Milestone[],
  extras: { focus: string[]; highlights: ProgressPlan["highlights"] }
): ProgressPlan {
  const scored = milestones.map(scoreMilestone);
  const completed = scored.filter((m) => m.done).length;
  return {
    domain,
    milestones: scored,
    completed,
    remaining: scored.length - completed,
    // Share of milestones finished. Averaging the part-done ones instead would
    // let a row of barely-started targets read as real progress.
    overallPct: scored.length === 0 ? 0 : Math.round((completed / scored.length) * 100),
    next: nextUp(scored),
    focus: extras.focus,
    highlights: extras.highlights,
  };
}

export function filterMilestones(
  milestones: ScoredMilestone[],
  tab: MilestoneTab,
  query: string
): ScoredMilestone[] {
  const found = milestones.filter((m) => matchesMilestone(m, query));
  if (tab === "COMPLETED") return found.filter((m) => m.done);
  if (tab === "REMAINING") return found.filter((m) => !m.done);
  return found;
}

/** Tab counts, computed after the search so the tabs match what is listed. */
export function milestoneCounts(milestones: ScoredMilestone[], query: string) {
  const found = milestones.filter((m) => matchesMilestone(m, query));
  const completed = found.filter((m) => m.done).length;
  return { ALL: found.length, COMPLETED: completed, REMAINING: found.length - completed };
}
