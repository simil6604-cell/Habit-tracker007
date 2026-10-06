import { commandWord, markPercent, paperMarks, type PaperInput, type QuestionInput } from "./marked-paper";

/**
 * Asking the AI to read a marked paper, and reading what comes back.
 *
 * What is being asked for is unusual enough to be worth stating: not "is this
 * right", which the marker has already answered, but what the question was
 * asking, what the answer appears to have taken it to mean, and what the gap
 * between those two is. That gap is where almost all the marks go at IGCSE and
 * A Level — an answer that describes where it was told to evaluate feels
 * complete while losing most of the marks, and nothing in a mark scheme says
 * so out loud.
 *
 * Split from the call itself so the prompt and the parsing are both testable
 * without a network, a key, or a model that answers differently every run.
 */

export type QuestionAnalysis = {
  questionId: string;
  /** What the question was actually asking for. */
  asked: string;
  /** What the answer appears to have taken it to mean. */
  understood: string;
  /** The gap, said plainly. */
  gap: string;
  /** How to say it instead — the rewritten answer, or the shape of one. */
  better: string;
};

export type PaperAnalysis = {
  overall: string;
  questions: QuestionAnalysis[];
};

export type AnalysisResult = { ok: true; analysis: PaperAnalysis } | { ok: false; error: string };

/** How much of a paper is worth sending. Beyond this it is a textbook. */
export const MAX_PROMPT_CHARS = 24_000;

function marksLine(scored: number | null, total: number | null): string {
  if (scored === null || total === null) return "not given";
  const pct = markPercent({ scored, total });
  return `${scored}/${total}${pct === null ? "" : ` (${pct}%)`}`;
}

/**
 * The paper, written out for the model.
 *
 * The command word is pulled out per question rather than left for the model
 * to notice, because it is the thing the whole analysis turns on.
 */
export function buildAnalysisPrompt(
  paper: PaperInput,
  questions: QuestionInput[],
  systemPrompt: string
): string {
  const totals = paperMarks({ scored: paper.marksScored, total: paper.marksTotal }, questions);

  const header = [
    `Paper: ${paper.title}`,
    paper.subjectName ? `Subject: ${paper.subjectName}` : null,
    `Marks: ${marksLine(totals.scored, totals.total)}`,
    paper.gradeAwarded ? `Grade awarded: ${paper.gradeAwarded}` : null,
    paper.gradeTarget ? `Grade the student is aiming for: ${paper.gradeTarget}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const body = questions
    .map((q, i) => {
      const cw = commandWord(q.prompt);
      return [
        `### Question ${i + 1} (id: ${q.id})`,
        cw ? `Command word: ${cw}` : null,
        `Marks: ${marksLine(q.marksScored, q.marksTotal)}`,
        `QUESTION AS PRINTED:\n${q.prompt}`,
        `WHAT THE STUDENT WROTE:\n${q.answer}`,
        q.examinerNote ? `MARKER'S COMMENT:\n${q.examinerNote}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const task = `You are looking at a paper this student has already had marked. Do NOT re-mark it and do not argue with the marker.

For EVERY question above, work out four things:
- "asked": what the question was actually asking for. Name the command word and say what that word demands at this level.
- "understood": what the student's answer appears to have taken the question to mean. Read their words charitably — say what they seem to have been going for, even where it is not what was wanted.
- "gap": the difference between those two, in one or two plain sentences. If there is no gap and the marks were lost on content rather than on reading the question, say that instead.
- "better": how to say it instead. Where it is short enough, rewrite their answer properly. Where it is long, give the structure the answer needed, with the specific phrases that earn the marks.

Then "overall": what to do to get from the awarded grade to the grade they are aiming for. Be specific to THIS paper — the patterns across the questions, the habits that cost marks more than once. Say how many marks the gap is worth if the marks allow it. Never invent a mark scheme or claim to know their syllabus by heart.

Respond with ONLY a JSON object, no markdown fences:
{"overall": "...", "questions": [{"questionId": "<the id given above>", "asked": "...", "understood": "...", "gap": "...", "better": "..."}]}

If there is not enough here to say anything useful, respond with exactly: NONE`;

  const full = `${systemPrompt}\n\n---\n\n${header}\n\n${body}\n\n---\n\n${task}`;
  return full.length > MAX_PROMPT_CHARS ? `${full.slice(0, MAX_PROMPT_CHARS)}\n\n[paper truncated]` : full;
}

/**
 * The model's reply, turned into an analysis — or into a reason there is none.
 *
 * `known` is the set of question ids that were actually sent. A reply naming
 * anything else is a hallucinated question, and attaching its advice to a real
 * one would put words under a question they were never about.
 */
export function parseAnalysisReply(raw: string, known: string[]): AnalysisResult {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "NONE") {
    return {
      ok: false,
      error: "There wasn't enough in that paper to say anything useful. Add the questions and what you wrote for them.",
    };
  }

  let data: unknown;
  try {
    const match = trimmed.match(/\{[\s\S]*\}/);
    data = JSON.parse(match ? match[0] : trimmed);
  } catch {
    return { ok: false, error: "The AI's answer came back in a shape this couldn't read. Try again." };
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "The AI's answer came back in a shape this couldn't read. Try again." };
  }

  const obj = data as Record<string, unknown>;
  const overall = typeof obj.overall === "string" ? obj.overall.trim() : "";

  const allowed = new Set(known);
  const seen = new Set<string>();
  const questions: QuestionAnalysis[] = [];

  for (const entry of Array.isArray(obj.questions) ? obj.questions : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const q = entry as Record<string, unknown>;
    const questionId = typeof q.questionId === "string" ? q.questionId : "";
    if (!allowed.has(questionId) || seen.has(questionId)) continue;

    const asked = typeof q.asked === "string" ? q.asked.trim() : "";
    const understood = typeof q.understood === "string" ? q.understood.trim() : "";
    const gap = typeof q.gap === "string" ? q.gap.trim() : "";
    const better = typeof q.better === "string" ? q.better.trim() : "";
    // A row with nothing in it is not an analysis of anything.
    if (!asked && !understood && !gap && !better) continue;

    seen.add(questionId);
    questions.push({ questionId, asked, understood, gap, better });
  }

  if (!overall && questions.length === 0) {
    return { ok: false, error: "The AI came back with nothing to say about that paper. Try again." };
  }

  return { ok: true, analysis: { overall, questions } };
}
