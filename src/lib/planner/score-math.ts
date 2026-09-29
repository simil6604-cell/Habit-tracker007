/**
 * How the three domain scores become one number.
 *
 * Kept apart from the queries so the arithmetic can be tested, because it is
 * the arithmetic that was wrong: domains were averaged only while they scored
 * above zero, which sounds like "don't judge someone on a domain they don't
 * do" and behaves like something much worse.
 *
 * A gym score of 0 does not mean "no gym". It means the week's sessions are
 * not done. Dropping it hid exactly the domain that needed attention — and
 * then logging the FIRST workout of the week made the overall score fall,
 * because 0 was being ignored while 33 was being averaged in. Doing more
 * cannot lower the number that is meant to reward doing more.
 *
 * So whether a domain counts is now a fact about whether it is in use at all,
 * decided by the queries, and never about what it scored today.
 */

export type DomainPart = {
  score: number;
  /** Has this domain been set up — subjects, workouts, a football profile? */
  inUse: boolean;
};

/**
 * The overall score, or null when nothing is being tracked yet.
 *
 * Null rather than a number: with no subjects, no workouts and no football
 * profile, recovery alone would have printed "15%" on a brand-new account —
 * a score for a week that has not been described to the app. "—" is the
 * honest answer, and the callers say what to do about it.
 */
export function overallScore(domains: DomainPart[], recovery: number): number | null {
  const tracked = domains.filter((d) => d.inUse);
  if (tracked.length === 0) return null;

  const average = tracked.reduce((sum, d) => sum + d.score, 0) / tracked.length;
  return Math.round(average * 0.85 + recovery * 0.15);
}
