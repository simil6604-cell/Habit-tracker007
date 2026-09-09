const IMPROVEMENT_PATTERNS: { match: RegExp; advice: string }[] = [
  { match: /first touch|control/i, advice: "First touch improves fastest with high-repetition, low-pressure reps — wall touches or juggling before adding pressure." },
  { match: /weak foot/i, advice: "Weak foot only improves with deliberate reps on it specifically — dedicate a few minutes every session, not just when it comes up naturally." },
  { match: /pass(ing)?/i, advice: "Passing errors under match speed usually mean the technique is fine but decision-making under pressure needs more reps — try passing drills with a defender added." },
  { match: /fitness|tired|gassed|stamina/i, advice: "If fitness is the limiter late in sessions/matches, that's a conditioning gap — add some interval running separate from technical work." },
  { match: /shoot|finish/i, advice: "Finishing improves with shot repetition under realistic angles/speed — quality reps close to match conditions beat quantity from a static ball." },
  { match: /position|decision/i, advice: "Positioning/decision-making is best reviewed by watching footage of the moment, if you have it — pattern recognition builds over many repetitions of seeing the same situation." },
];

export function generateTrainingDiaryTip(training: { toImprove: string | null; completed: boolean; focus: string }): string | null {
  const lines: string[] = [];

  if (!training.completed) {
    lines.push("This session wasn't marked completed — if that's becoming a pattern, the schedule may need lightening rather than pushing through.");
  }

  if (training.toImprove) {
    const matched = IMPROVEMENT_PATTERNS.filter((p) => p.match.test(training.toImprove!));
    for (const m of matched) lines.push(m.advice);
    if (matched.length === 0) lines.push(`Noted for next time: "${training.toImprove}".`);
  }

  return lines.length ? lines.join(" ") : null;
}
