/**
 * Reading a marked paper: the grade, the marks, and the question that was
 * actually asked.
 *
 * Kept pure and apart from the database and the AI call, because almost
 * everything that can go wrong here is a parsing decision — a grade typed as
 * "b+", marks given as 7 out of 5, a model that answered in prose when it was
 * asked for JSON. Each of those is one test rather than one careful look in
 * the browser.
 */

export const MAX_PAPER_TITLE = 100;
export const MAX_GRADE = 12;
export const MAX_QUESTION = 2000;
export const MAX_ANSWER = 6000;
export const MAX_EXAMINER_NOTE = 1000;
export const MAX_QUESTIONS_PER_PAPER = 40;

export type QuestionInput = {
  id: string;
  position: number;
  prompt: string;
  answer: string;
  marksScored: number | null;
  marksTotal: number | null;
  examinerNote: string | null;
};

export type PaperInput = {
  title: string;
  subjectName: string | null;
  gradeAwarded: string | null;
  gradeTarget: string | null;
  marksScored: number | null;
  marksTotal: number | null;
};

/**
 * A grade as the marker wrote it, tidied but not translated.
 *
 * Uppercased because "a*" and "A*" are the same grade and nothing downstream
 * should have to know that; otherwise left alone. Translating 5.5 into a
 * letter, or a letter into a percentage, needs a scale this app has not been
 * told — and guessing it would put a wrong number in front of someone making
 * decisions about their own work.
 */
export function cleanGrade(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text.slice(0, MAX_GRADE).toUpperCase();
}

/** One line of text, trimmed, with pasted line breaks flattened. */
export function cleanOneLine(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, max) : null;
}

/** Several lines kept as lines — a question and an answer are both shaped. */
export function cleanMultiline(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const text = raw
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text.slice(0, max) : null;
}

export type MarkPair = { scored: number | null; total: number | null };

/**
 * A pair of marks, or nothing.
 *
 * Scoring more than the paper was worth is a typo every time, and storing it
 * would make every percentage below it wrong — so the pair is refused rather
 * than kept, and the caller says so.
 */
export type MarksResult = { ok: true; marks: MarkPair } | { ok: false; error: string };

export function parseMarks(rawScored: unknown, rawTotal: unknown): MarksResult {
  const scored = parseMarkNumber(rawScored);
  const total = parseMarkNumber(rawTotal);

  if (scored === "bad" || total === "bad") {
    return { ok: false, error: "Marks have to be whole numbers, 0 or more." };
  }
  if (scored !== null && total !== null && scored > total) {
    return { ok: false, error: `${scored} out of ${total} — check those two round the right way.` };
  }
  return { ok: true, marks: { scored, total } };
}

function parseMarkNumber(raw: unknown): number | null | "bad" {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0 || value > 10_000) return "bad";
  return value;
}

/** The percentage a mark pair comes to, or null when it cannot be worked out. */
export function markPercent(marks: MarkPair): number | null {
  if (marks.scored === null || marks.total === null || marks.total === 0) return null;
  return Math.round((marks.scored / marks.total) * 100);
}

/**
 * The paper's marks: its own if it was given them, otherwise the questions
 * added up.
 *
 * Only questions that carry both halves count towards the total. Adding a
 * question worth 6 that has no score yet would quietly drag the percentage
 * down and make the paper look worse than it was marked.
 */
export function paperMarks(paper: MarkPair, questions: Pick<QuestionInput, "marksScored" | "marksTotal">[]): MarkPair {
  if (paper.scored !== null && paper.total !== null) return paper;

  let scored = 0;
  let total = 0;
  let counted = 0;
  for (const q of questions) {
    if (q.marksScored === null || q.marksTotal === null) continue;
    scored += q.marksScored;
    total += q.marksTotal;
    counted += 1;
  }
  if (counted === 0) return paper;
  return { scored, total };
}

/**
 * The command word — the single biggest source of lost marks at this level.
 *
 * "Describe the effect" and "evaluate the effect" are different questions
 * about the same thing, and answering the first when the second was asked
 * loses most of the marks while feeling like a complete answer. Pulling it out
 * here means the analysis is always pointed at it, rather than hoping the
 * model notices.
 */
const COMMAND_WORDS = [
  "evaluate",
  "discuss",
  "assess",
  "analyse",
  "analyze",
  "justify",
  "compare",
  "contrast",
  "explain",
  "describe",
  "outline",
  "suggest",
  "calculate",
  "define",
  "identify",
  "state",
  "list",
  "name",
];

export function commandWord(prompt: string): string | null {
  const text = prompt.toLowerCase();
  // The earliest one wins: "Explain and evaluate" is an explain question with
  // an evaluation on the end, and the opening verb is what sets the structure.
  let best: { word: string; at: number } | null = null;
  for (const word of COMMAND_WORDS) {
    const at = text.search(new RegExp(`\\b${word}\\b`));
    if (at === -1) continue;
    if (!best || at < best.at) best = { word, at };
  }
  return best ? best.word : null;
}

/**
 * Questions where marks were actually lost, worst first.
 *
 * A question that scored full marks is left out entirely. It was in the list
 * at first, and rendering it showed why that is wrong: under a heading reading
 * "Where the marks went", a line saying "lost 0 of 2" is noise at best and at
 * worst reads as a criticism of the one answer that went perfectly.
 */
export function weakestQuestions(questions: QuestionInput[], limit = 5): QuestionInput[] {
  return [...questions]
    .filter(
      (q) => q.marksScored !== null && q.marksTotal !== null && q.marksTotal > 0 && q.marksScored < q.marksTotal
    )
    .sort((a, b) => {
      const lostA = (a.marksTotal! - a.marksScored!) / a.marksTotal!;
      const lostB = (b.marksTotal! - b.marksScored!) / b.marksTotal!;
      if (lostB !== lostA) return lostB - lostA;
      // Same proportion lost: the bigger question matters more.
      return b.marksTotal! - a.marksTotal!;
    })
    .slice(0, limit);
}
