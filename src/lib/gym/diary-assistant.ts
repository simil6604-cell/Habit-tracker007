/**
 * Rule-based training-diary feedback — same honest approach as the School
 * Learning Assistant: it reasons over what you actually logged (difficulty,
 * completion, PBs, your own words), never invented sports-science content.
 */
const IMPROVEMENT_PATTERNS: { match: RegExp; advice: string }[] = [
  { match: /tired|exhaust|fatigue|low energy/i, advice: "Fatigue during a session is often a recovery/sleep signal, not a strength problem — check your sleep and rest days before adding volume." },
  { match: /form|technique|posture/i, advice: "Form breakdowns are worth fixing before adding weight — drop the load 10-20% next session and rebuild it clean." },
  { match: /time|rushed|short on time/i, advice: "If time is the constraint, prioritize your first 1-2 compound lifts and treat the rest as optional." },
  { match: /weight|heavier|too light|too heavy/i, advice: "Adjust load by small increments (2.5-5%) rather than jumping — consistent small wins beat inconsistent big ones." },
  { match: /motivat|didn't want|skip/i, advice: "Low motivation is normal — a shorter, easier session still beats skipping entirely and keeps the habit alive." },
];

export function generateWorkoutDiaryTip(session: {
  difficulty: string | null;
  completed: boolean;
  toImprove: string | null;
  hasPB: boolean;
}): string | null {
  const lines: string[] = [];

  if (session.hasPB) lines.push("🏆 New personal best this session — that's real, measured progress.");
  if (!session.completed) lines.push("This one wasn't marked completed — that's fine occasionally, but if it keeps happening, the plan may be too ambitious right now.");

  if (session.toImprove) {
    const matched = IMPROVEMENT_PATTERNS.filter((p) => p.match.test(session.toImprove!));
    for (const m of matched) lines.push(m.advice);
    if (matched.length === 0) {
      lines.push(`Noted for next time: "${session.toImprove}".`);
    }
  }

  if (session.difficulty === "HARD" && !session.toImprove) {
    lines.push("Marked as a hard session — make sure recovery (sleep, protein, an easier day after) matches the effort.");
  }

  return lines.length ? lines.join(" ") : null;
}
