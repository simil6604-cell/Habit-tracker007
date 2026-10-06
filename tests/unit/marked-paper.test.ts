import { describe, it, expect } from "vitest";
import {
  cleanGrade,
  cleanOneLine,
  cleanMultiline,
  parseMarks,
  markPercent,
  paperMarks,
  commandWord,
  weakestQuestions,
  matchSubject,
  MAX_GRADE,
  type QuestionInput,
} from "@/lib/school/marked-paper";

const q = (over: Partial<QuestionInput> = {}): QuestionInput => ({
  id: "q1",
  position: 1,
  prompt: "Explain one reason why demand might fall.",
  answer: "Because people have less money.",
  marksScored: 2,
  marksTotal: 4,
  examinerNote: null,
  ...over,
});

describe("cleanGrade", () => {
  it("keeps whatever scale the marker used", () => {
    // Switzerland and Cambridge in the same school: a report says A*, 5.5 or
    // 62% depending on who wrote it, and all three have to survive.
    expect(cleanGrade("A*")).toBe("A*");
    expect(cleanGrade("5.5")).toBe("5.5");
    expect(cleanGrade("62%")).toBe("62%");
  });

  it("uppercases, so a and A are not two different grades", () => {
    expect(cleanGrade("a*")).toBe("A*");
    expect(cleanGrade(" b ")).toBe("B");
  });

  it("is nothing when nothing was typed", () => {
    expect(cleanGrade("")).toBeNull();
    expect(cleanGrade("   ")).toBeNull();
    expect(cleanGrade(null)).toBeNull();
    expect(cleanGrade(7)).toBeNull();
  });

  it("cuts an essay pasted into a grade box", () => {
    expect(cleanGrade("x".repeat(80))).toHaveLength(MAX_GRADE);
  });
});

describe("parseMarks", () => {
  it("takes an ordinary pair", () => {
    expect(parseMarks("12", "20")).toEqual({ ok: true, marks: { scored: 12, total: 20 } });
  });

  it("takes a half-filled pair, because marks come back before totals do", () => {
    expect(parseMarks("", "20")).toEqual({ ok: true, marks: { scored: null, total: 20 } });
    expect(parseMarks(null, null)).toEqual({ ok: true, marks: { scored: null, total: null } });
  });

  it("refuses more marks than the paper was worth", () => {
    // A typo every time, and storing it makes every percentage below it wrong.
    const result = parseMarks("21", "20");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/round the right way/);
  });

  it("refuses anything that is not a whole count of marks", () => {
    expect(parseMarks("12.5", "20").ok).toBe(false);
    expect(parseMarks("-1", "20").ok).toBe(false);
    expect(parseMarks("twelve", "20").ok).toBe(false);
  });

  it("allows full marks", () => {
    expect(parseMarks("20", "20").ok).toBe(true);
  });
});

describe("markPercent", () => {
  it("rounds to a whole percent", () => {
    expect(markPercent({ scored: 12, total: 20 })).toBe(60);
    expect(markPercent({ scored: 2, total: 3 })).toBe(67);
  });

  it("is nothing rather than a crash when a half is missing", () => {
    expect(markPercent({ scored: 12, total: null })).toBeNull();
    expect(markPercent({ scored: null, total: 20 })).toBeNull();
  });

  it("does not divide by zero", () => {
    expect(markPercent({ scored: 0, total: 0 })).toBeNull();
  });
});

describe("paperMarks", () => {
  it("uses the paper's own marks when it was given them", () => {
    const marks = paperMarks({ scored: 48, total: 80 }, [q(), q({ id: "q2" })]);
    expect(marks).toEqual({ scored: 48, total: 80 });
  });

  it("adds the questions up when the paper has none", () => {
    const marks = paperMarks({ scored: null, total: null }, [
      q({ marksScored: 2, marksTotal: 4 }),
      q({ id: "q2", marksScored: 5, marksTotal: 6 }),
    ]);
    expect(marks).toEqual({ scored: 7, total: 10 });
  });

  it("leaves out a question that has not been marked yet", () => {
    // Counting its total but not its score would drag the percentage down and
    // make the paper look worse than it came back.
    const marks = paperMarks({ scored: null, total: null }, [
      q({ marksScored: 2, marksTotal: 4 }),
      q({ id: "q2", marksScored: null, marksTotal: 6 }),
    ]);
    expect(marks).toEqual({ scored: 2, total: 4 });
  });

  it("stays empty when there is nothing to add up", () => {
    expect(paperMarks({ scored: null, total: null }, [])).toEqual({ scored: null, total: null });
    expect(paperMarks({ scored: null, total: null }, [q({ marksScored: null, marksTotal: null })])).toEqual({
      scored: null,
      total: null,
    });
  });
});

describe("commandWord", () => {
  it("finds the word the question turns on", () => {
    expect(commandWord("Evaluate the impact of a minimum wage.")).toBe("evaluate");
    expect(commandWord("Describe two features of a monopoly.")).toBe("describe");
    expect(commandWord("4(b) Calculate the price elasticity of demand.")).toBe("calculate");
  });

  it("takes the first one, because that is what sets the structure", () => {
    // "Explain and evaluate" is an explain question with an evaluation on the
    // end; answering it as a pure evaluation loses the explanation marks.
    expect(commandWord("Explain and then evaluate the effect.")).toBe("explain");
  });

  it("does not match a word buried inside another", () => {
    expect(commandWord("The liststructure of the market")).toBeNull();
    expect(commandWord("Statement of account")).toBeNull();
  });

  it("is nothing when the question has no command word", () => {
    expect(commandWord("Why does this happen?")).toBeNull();
    expect(commandWord("")).toBeNull();
  });

  it("does not care about case", () => {
    expect(commandWord("EVALUATE the claim.")).toBe("evaluate");
  });
});

describe("weakestQuestions", () => {
  it("puts the biggest proportion of marks lost first", () => {
    const list = weakestQuestions([
      q({ id: "a", marksScored: 9, marksTotal: 10 }),
      q({ id: "b", marksScored: 1, marksTotal: 10 }),
      q({ id: "c", marksScored: 5, marksTotal: 10 }),
    ]);
    expect(list.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("leaves out a question that lost nothing", () => {
    // Under a heading reading "Where the marks went", a line saying
    // "lost 0 of 2" is noise — and reads as a criticism of the one answer
    // that went perfectly. Rendering the page is what showed this.
    const list = weakestQuestions([
      q({ id: "perfect", marksScored: 2, marksTotal: 2 }),
      q({ id: "lost-some", marksScored: 3, marksTotal: 12 }),
    ]);
    expect(list.map((x) => x.id)).toEqual(["lost-some"]);
  });

  it("is empty when the whole paper was full marks", () => {
    expect(weakestQuestions([q({ marksScored: 5, marksTotal: 5 })])).toEqual([]);
  });

  it("breaks a tie towards the bigger question", () => {
    const list = weakestQuestions([
      q({ id: "small", marksScored: 1, marksTotal: 2 }),
      q({ id: "big", marksScored: 10, marksTotal: 20 }),
    ]);
    expect(list[0].id).toBe("big");
  });

  it("ignores questions with no marks on them", () => {
    const list = weakestQuestions([
      q({ id: "marked", marksScored: 1, marksTotal: 10 }),
      q({ id: "unmarked", marksScored: null, marksTotal: null }),
    ]);
    expect(list.map((x) => x.id)).toEqual(["marked"]);
  });

  it("does not reorder the caller's array", () => {
    const given = [q({ id: "a", marksScored: 9, marksTotal: 10 }), q({ id: "b", marksScored: 1, marksTotal: 10 })];
    weakestQuestions(given);
    expect(given.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("cleanOneLine and cleanMultiline", () => {
  it("flattens a title but keeps the shape of an answer", () => {
    expect(cleanOneLine("Economics\nPaper 1", 100)).toBe("Economics Paper 1");
    expect(cleanMultiline("Point one\n\nPoint two", 100)).toBe("Point one\n\nPoint two");
  });

  it("tidies runaway blank lines without joining the paragraphs", () => {
    expect(cleanMultiline("a\n\n\n\n\nb", 100)).toBe("a\n\nb");
  });

  it("is nothing when only whitespace was given", () => {
    expect(cleanOneLine("   ", 100)).toBeNull();
    expect(cleanMultiline("\n\n  \n", 100)).toBeNull();
  });
});

describe("matchSubject", () => {
  const subjects = [
    { id: "s1", name: "Economics" },
    { id: "s2", name: "German" },
  ];

  it("links a typed subject to the real one", () => {
    expect(matchSubject("Economics", subjects)?.id).toBe("s1");
  });

  it("ignores case and surrounding space", () => {
    // Failing to match these would quietly split one subject's papers into
    // two piles, which nothing on screen would explain.
    expect(matchSubject("economics", subjects)?.id).toBe("s1");
    expect(matchSubject("  ECONOMICS  ", subjects)?.id).toBe("s1");
  });

  it("is nothing for a subject you do not keep in the app", () => {
    // Not an error: a paper can be for General Paper, or for a class that was
    // never set up as a subject here.
    expect(matchSubject("General Paper", subjects)).toBeNull();
  });

  it("is nothing when nothing was typed", () => {
    expect(matchSubject("", subjects)).toBeNull();
    expect(matchSubject("   ", subjects)).toBeNull();
    expect(matchSubject(null, subjects)).toBeNull();
  });

  it("does not half-match a longer name", () => {
    expect(matchSubject("Econ", subjects)).toBeNull();
    expect(matchSubject("Economics Paper 1", subjects)).toBeNull();
  });

  it("copes with an account that has no subjects yet", () => {
    expect(matchSubject("Economics", [])).toBeNull();
  });
});
