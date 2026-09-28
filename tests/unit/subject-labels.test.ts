import { describe, it, expect } from "vitest";
import { shortSubjectName, shortSubjectNames } from "@/lib/analytics/subject-labels";

describe("shortSubjectName", () => {
  it("drops the stream after a dash", () => {
    expect(shortSubjectName("German — First Language")).toBe("German");
    expect(shortSubjectName("German – Second Language")).toBe("German");
    expect(shortSubjectName("German - First Language")).toBe("German");
  });

  it("drops the qualification wherever it sits", () => {
    expect(shortSubjectName("Chemistry IGCSE")).toBe("Chemistry");
    expect(shortSubjectName("IGCSE Chemistry")).toBe("Chemistry");
    expect(shortSubjectName("Economics A-Level")).toBe("Economics");
    expect(shortSubjectName("Economics A Levels")).toBe("Economics");
    expect(shortSubjectName("Biology (HL)")).toBe("Biology");
    expect(shortSubjectName("Physics AS-Level")).toBe("Physics");
  });

  it("takes the longest qualifier first, leaving no fragment", () => {
    // "A-Level" matched before "A-Levels" would leave a stray "s".
    expect(shortSubjectName("History A-Levels")).toBe("History");
    // "Language" matched before "First Language" would leave a stray "First".
    expect(shortSubjectName("German First Language")).toBe("German");
  });

  it("leaves a plain subject alone", () => {
    expect(shortSubjectName("Mathematics")).toBe("Mathematics");
    expect(shortSubjectName("Economics")).toBe("Economics");
  });

  it("never returns an empty label", () => {
    // A subject someone really named "IGCSE" keeps its name rather than
    // becoming a blank axis tick.
    expect(shortSubjectName("IGCSE")).toBe("IGCSE");
    expect(shortSubjectName("A-Level")).toBe("A-Level");
  });

  it("does not eat a qualifier that is part of a real word", () => {
    expect(shortSubjectName("Ibsen Studies")).toBe("Ibsen Studies");
    expect(shortSubjectName("Slavic Languages")).toBe("Slavic Languages");
  });
});

describe("shortSubjectNames", () => {
  it("shortens the real timetable to the subjects themselves", () => {
    expect(shortSubjectNames(["Mathematics", "Biology", "German — First Language", "English Language", "Economics"])).toEqual([
      "Mathematics",
      "Biology",
      "German",
      "English",
      "Economics",
    ]);
  });

  it("refuses a cut that would make two subjects look like one", () => {
    // Two papers, two grades, two sets of revision. Collapsing both to
    // "English" would be a chart quietly merging them.
    expect(shortSubjectNames(["English Language", "English Literature"])).toEqual([
      "English Language",
      "English Literature",
    ]);
  });

  it("still shortens the rows that do not collide", () => {
    expect(shortSubjectNames(["English Language", "English Literature", "German — First Language"])).toEqual([
      "English Language",
      "English Literature",
      "German",
    ]);
  });

  it("treats a collision case-insensitively", () => {
    expect(shortSubjectNames(["english language", "English Literature"])).toEqual([
      "english language",
      "English Literature",
    ]);
  });

  it("keeps the order it was given", () => {
    const input = ["Economics A-Level", "Mathematics", "Biology IGCSE"];
    expect(shortSubjectNames(input)).toEqual(["Economics", "Mathematics", "Biology"]);
  });

  it("handles an empty list and a single subject", () => {
    expect(shortSubjectNames([])).toEqual([]);
    expect(shortSubjectNames(["Literature"])).toEqual(["Literature"]);
  });
});
