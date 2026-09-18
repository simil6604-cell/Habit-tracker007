/**
 * Rule-based "AI Learning Assistant". This is deliberately honest about its
 * limits: it has no real subject-matter knowledge, so it never invents
 * academic content (a "correct" worked example, a fact about biology, etc).
 * Instead it reasons over data that's actually true — your progress,
 * priority, exam timing, and what you typed — the same way the rest of the
 * app's AI does. Swapping in a real LLM later (see lib/ai/provider.ts)
 * upgrades these to true subject tutoring without changing the UI.
 */

export type TopicContext = {
  topicName: string;
  subjectName: string;
  progressPct: number;
  priority: string;
  examRelevance: string;
  weaknessNote: string | null;
  daysUntilExam: number | null;
};

export function explainApproach(ctx: TopicContext): string {
  const lines: string[] = [];
  lines.push(`I can't give you real subject content for "${ctx.topicName}" — that needs a real subject-matter AI or your notes/textbook. What I can do is help you study it well:`);
  lines.push("");
  lines.push(`• You're at ${ctx.progressPct}% on this topic, marked ${ctx.priority.toLowerCase()} priority and ${ctx.examRelevance.toLowerCase()} exam relevance.`);
  if (ctx.progressPct < 50) {
    lines.push("• That's low enough to start from the basics again — re-read the core definitions before attempting practice questions.");
  } else if (ctx.progressPct < 80) {
    lines.push("• You know the basics — focus on past-paper style questions now rather than re-reading notes.");
  } else {
    lines.push("• You're strong here — light spaced-repetition review is enough; spend your time on weaker topics instead.");
  }
  if (ctx.daysUntilExam !== null) {
    lines.push(`• Your ${ctx.subjectName} exam is in ${ctx.daysUntilExam} day${ctx.daysUntilExam === 1 ? "" : "s"} — plan accordingly.`);
  }
  if (ctx.weaknessNote) {
    lines.push(`• Last time you noted: "${ctx.weaknessNote}" — check whether that's still true.`);
  }
  return lines.join("\n");
}

export function examChecklist(ctx: TopicContext): string {
  const lines: string[] = [];
  if (ctx.daysUntilExam === null) {
    lines.push(`No exam is scheduled yet for ${ctx.subjectName} — add one under School → Upcoming Exams so I can prioritize this properly.`);
    return lines.join("\n");
  }
  lines.push(`${ctx.subjectName} exam in ${ctx.daysUntilExam} day${ctx.daysUntilExam === 1 ? "" : "s"}.`);
  lines.push(`"${ctx.topicName}" is ${ctx.examRelevance.toLowerCase()} exam relevance and you're at ${ctx.progressPct}%.`);
  if (ctx.examRelevance === "HIGH" && ctx.progressPct < 70) {
    lines.push("⚠️ This combination — high relevance, lower progress — makes it a top priority this week.");
  } else if (ctx.examRelevance === "LOW") {
    lines.push("This is lower-relevance for the exam — don't let it crowd out higher-relevance topics.");
  } else {
    lines.push("Keep it in your normal rotation; nothing urgent here.");
  }
  return lines.join("\n");
}

const MISTAKE_PATTERNS: { match: RegExp; advice: string }[] = [
  { match: /sign|negative|positive/i, advice: "Sign errors are usually a working-speed issue, not understanding — slow down on the step where you distribute a negative, and double-check it at the end." },
  { match: /forgot|forget|missed|skip/i, advice: "Forgetting a step is fixed by a checklist, not more practice — write the steps out as a short list and tick them off during the next few attempts." },
  { match: /time|ran out|rushed|slow/i, advice: "A timing problem means the fix isn't \"know it better\" but \"practice it faster\" — redo similar questions under a timer." },
  { match: /confus|mixed up|misread/i, advice: "Mixing up similar concepts usually means they need to be studied side-by-side once, directly contrasting them, rather than separately." },
  { match: /formula|equation|method/i, advice: "If the method itself was wrong, that's a gap worth closing before doing more questions — go back to where this method was introduced and re-derive it once by hand." },
];

export function respondToMistake(ctx: TopicContext, mistakeText: string): string {
  const matched = MISTAKE_PATTERNS.filter((p) => p.match.test(mistakeText));
  const lines: string[] = [];
  lines.push(`Logged against "${ctx.topicName}": "${mistakeText}"`);
  lines.push("");
  if (matched.length > 0) {
    for (const m of matched) lines.push(`• ${m.advice}`);
  } else {
    lines.push("• I can't diagnose the specific content error without a real subject-matter AI — but logging it is still useful: it's now saved as this topic's weakness note, and I've nudged its progress down slightly to reflect it.");
  }
  lines.push("");
  lines.push("For a genuinely detailed, correct explanation of exactly what went wrong, connect a real AI provider in Settings — right now I only reason over your own data, never invented subject content.");
  return lines.join("\n");
}
