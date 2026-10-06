import { describe, it, expect } from "vitest";
import { buildAnalysisPrompt, parseAnalysisReply, MAX_PROMPT_CHARS } from "@/lib/school/paper-analysis";
import type { PaperInput, QuestionInput } from "@/lib/school/marked-paper";

const paper: PaperInput = {
  title: "Economics Paper 1 mock",
  subjectName: "Economics",
  gradeAwarded: "C",
  gradeTarget: "A",
  marksScored: 32,
  marksTotal: 60,
};

const questions: QuestionInput[] = [
  {
    id: "qa",
    position: 1,
    prompt: "Evaluate the likely impact of a minimum wage on unemployment.",
    answer: "A minimum wage means firms pay more so they hire fewer people.",
    marksScored: 3,
    marksTotal: 12,
    examinerNote: "One side only.",
  },
  {
    id: "qb",
    position: 2,
    prompt: "Define opportunity cost.",
    answer: "The next best alternative given up.",
    marksScored: 2,
    marksTotal: 2,
    examinerNote: null,
  },
];

describe("buildAnalysisPrompt", () => {
  const prompt = buildAnalysisPrompt(paper, questions, "SYSTEM PROMPT HERE");

  it("carries the paper, the grade awarded and the grade wanted", () => {
    expect(prompt).toContain("Economics Paper 1 mock");
    expect(prompt).toContain("Grade awarded: C");
    expect(prompt).toContain("aiming for: A");
  });

  it("carries both halves of every question, which is the whole point", () => {
    // Without the question text there is no way to see that the answer
    // answered a different question from the one asked.
    expect(prompt).toContain("Evaluate the likely impact");
    expect(prompt).toContain("firms pay more so they hire fewer people");
    expect(prompt).toContain("Define opportunity cost");
  });

  it("names the command word rather than hoping the model notices it", () => {
    expect(prompt).toContain("Command word: evaluate");
    expect(prompt).toContain("Command word: define");
  });

  it("gives each question the id the reply has to come back with", () => {
    expect(prompt).toContain("id: qa");
    expect(prompt).toContain("id: qb");
  });

  it("passes on what the marker said", () => {
    expect(prompt).toContain("One side only.");
  });

  it("works out the percentage so the model does not have to", () => {
    expect(prompt).toContain("32/60 (53%)");
    expect(prompt).toContain("3/12 (25%)");
  });

  it("says marks are not given rather than printing null", () => {
    const bare = buildAnalysisPrompt(
      { ...paper, marksScored: null, marksTotal: null, gradeAwarded: null, gradeTarget: null },
      [{ ...questions[0], marksScored: null, marksTotal: null }],
      "S"
    );
    expect(bare).toContain("not given");
    expect(bare).not.toContain("null");
  });

  it("tells it not to re-mark the paper, which the marker already did", () => {
    expect(prompt).toMatch(/do NOT re-mark/i);
  });

  it("keeps the system prompt, so the answer is pitched at the right level", () => {
    expect(prompt).toContain("SYSTEM PROMPT HERE");
  });

  it("cuts a paper too long to send, rather than sending it anyway", () => {
    const huge = [{ ...questions[0], answer: "x".repeat(60_000) }];
    const out = buildAnalysisPrompt(paper, huge, "S");
    expect(out.length).toBeLessThanOrEqual(MAX_PROMPT_CHARS + 20);
    expect(out).toContain("[paper truncated]");
  });
});

describe("parseAnalysisReply", () => {
  const known = ["qa", "qb"];
  const good = {
    overall: "You lose marks on evaluation, not on knowledge.",
    questions: [
      { questionId: "qa", asked: "A two-sided judgement.", understood: "One mechanism.", gap: "No other side.", better: "Add a counter-case, then judge." },
    ],
  };

  it("reads a clean reply", () => {
    const result = parseAnalysisReply(JSON.stringify(good), known);
    expect(result.ok).toBe(true);
    expect(result.ok && result.analysis.overall).toContain("evaluation");
    expect(result.ok && result.analysis.questions).toHaveLength(1);
  });

  it("digs the object out of a code fence, which models add unasked", () => {
    const result = parseAnalysisReply("```json\n" + JSON.stringify(good) + "\n```", known);
    expect(result.ok && result.analysis.questions[0].questionId).toBe("qa");
  });

  it("digs it out of a sentence wrapped around it", () => {
    const result = parseAnalysisReply(`Here you go:\n${JSON.stringify(good)}\nHope that helps.`, known);
    expect(result.ok).toBe(true);
  });

  it("drops advice about a question that was never sent", () => {
    // A hallucinated question id, attached to a real question, would put words
    // under a question they were never about.
    const reply = { ...good, questions: [...good.questions, { questionId: "ghost", asked: "x", understood: "x", gap: "x", better: "x" }] };
    const result = parseAnalysisReply(JSON.stringify(reply), known);
    expect(result.ok && result.analysis.questions.map((q) => q.questionId)).toEqual(["qa"]);
  });

  it("keeps the first of two answers for the same question", () => {
    const reply = { ...good, questions: [...good.questions, { ...good.questions[0], gap: "second opinion" }] };
    const result = parseAnalysisReply(JSON.stringify(reply), known);
    expect(result.ok && result.analysis.questions).toHaveLength(1);
    expect(result.ok && result.analysis.questions[0].gap).toBe("No other side.");
  });

  it("drops an entry with nothing in it", () => {
    const reply = { overall: "Fine.", questions: [{ questionId: "qa", asked: "", understood: "", gap: "", better: "" }] };
    const result = parseAnalysisReply(JSON.stringify(reply), known);
    expect(result.ok && result.analysis.questions).toHaveLength(0);
  });

  it("keeps a partly filled entry, because three of four is still worth reading", () => {
    const reply = { overall: "Fine.", questions: [{ questionId: "qa", asked: "A judgement.", understood: "", gap: "", better: "Add the other side." }] };
    const result = parseAnalysisReply(JSON.stringify(reply), known);
    expect(result.ok && result.analysis.questions).toHaveLength(1);
  });

  it("says so when the model says there is nothing to work with", () => {
    const result = parseAnalysisReply("NONE", known);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/what you wrote/i);
  });

  it("refuses an answer that is not JSON at all", () => {
    const result = parseAnalysisReply("I'm afraid I can't help with that.", known);
    expect(result.ok).toBe(false);
  });

  it("finds the object inside an array rather than giving up on it", () => {
    // Asked for a bare object, models sometimes wrap it in a list. The
    // analysis is right there, so it is taken rather than thrown away.
    const result = parseAnalysisReply(JSON.stringify([good]), known);
    expect(result.ok && result.analysis.questions[0].questionId).toBe("qa");
  });

  it("refuses a reply with neither an overall nor a usable question", () => {
    const result = parseAnalysisReply(JSON.stringify({ overall: "", questions: [] }), known);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/nothing to say/i);
  });

  it("keeps an overall even when every question entry was unusable", () => {
    const reply = { overall: "You are close on content, far on structure.", questions: [{ questionId: "ghost", asked: "x" }] };
    const result = parseAnalysisReply(JSON.stringify(reply), known);
    expect(result.ok && result.analysis.overall).toContain("structure");
    expect(result.ok && result.analysis.questions).toHaveLength(0);
  });

  it("survives questions arriving as something other than a list", () => {
    const result = parseAnalysisReply(JSON.stringify({ overall: "Something.", questions: "lots" }), known);
    expect(result.ok && result.analysis.questions).toEqual([]);
  });
});
