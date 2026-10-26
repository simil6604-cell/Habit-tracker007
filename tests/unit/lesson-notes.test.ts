import { describe, expect, it } from "vitest";
import {
  appendChunk,
  AUTO_RESUME_DELAY_MS,
  AUTO_RESUME_WINDOW_MS,
  recentResumes,
  shouldAutoResume,
  buildNotesPrompt,
  formatClock,
  formatLength,
  lessonLabel,
  wordCount,
} from "@/lib/school/lesson-notes";

describe("appendChunk", () => {
  it("joins what was just heard onto what came before", () => {
    expect(appendChunk("The mole", "is a unit")).toBe("The mole is a unit");
  });

  it("does not run two chunks together", () => {
    // Straight concatenation gives "The moleis a unit", which is what a whole
    // lesson of chunks looks like if this is wrong.
    expect(appendChunk("The mole", "is a unit")).not.toContain("moleis");
  });

  it("does not leave double spaces where a chunk had its own", () => {
    expect(appendChunk("The mole ", "  is a unit ")).toBe("The mole is a unit");
  });

  it("keeps punctuation tight against the last word", () => {
    expect(appendChunk("That is the method", ", more or less")).toBe("That is the method, more or less");
  });

  it("starts cleanly, and ignores silence", () => {
    expect(appendChunk("", "First words")).toBe("First words");
    expect(appendChunk("Something", "   ")).toBe("Something");
    expect(appendChunk("", "")).toBe("");
  });
});

describe("wordCount", () => {
  it("counts what was said, not the whitespace", () => {
    expect(wordCount("  one   two\nthree  ")).toBe(3);
    expect(wordCount("")).toBe(0);
    expect(wordCount("   ")).toBe(0);
  });
});

describe("formatClock", () => {
  it("runs like a stopwatch", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(9)).toBe("00:09");
    expect(formatClock(754)).toBe("12:34");
    // A double lesson goes past the hour.
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("never shows a negative clock", () => {
    expect(formatClock(-5)).toBe("00:00");
  });
});

describe("formatLength", () => {
  it("says how long a saved lesson was", () => {
    expect(formatLength(2520)).toBe("42 min");
    expect(formatLength(30)).toBe("under a minute");
    expect(formatLength(3600)).toBe("1 h");
    expect(formatLength(5400)).toBe("1 h 30 min");
  });

  it("says nothing when there is nothing to say", () => {
    expect(formatLength(null)).toBeNull();
    expect(formatLength(undefined)).toBeNull();
    expect(formatLength(0)).toBeNull();
  });
});

describe("lessonLabel", () => {
  const now = new Date("2026-10-23T12:00:00Z");

  it("uses what the student called it", () => {
    expect(
      lessonLabel({ title: "Titration practical", subjectName: "Chemistry", createdAt: now }, now)
    ).toBe("Titration practical");
  });

  it("falls back to the subject and when it was", () => {
    expect(lessonLabel({ title: null, subjectName: "Chemistry", createdAt: now }, now)).toBe(
      "Chemistry lesson, today"
    );
  });

  it("still names a lesson with no subject at all", () => {
    expect(lessonLabel({ title: "   ", subjectName: null, createdAt: now }, now)).toBe("Lesson, today");
  });
});

describe("buildNotesPrompt", () => {
  const prompt = buildNotesPrompt({
    transcript: "Right, settle down. The mole is the amount of substance...",
    subjectName: "Chemistry",
    title: "Moles intro",
  });

  it("carries the transcript and what is known about the lesson", () => {
    expect(prompt).toContain("Subject: Chemistry");
    expect(prompt).toContain("Moles intro");
    expect(prompt).toContain("The mole is the amount of substance");
  });

  it("says to drop the parts of a lesson that are not teaching", () => {
    expect(prompt).toMatch(/register/i);
    expect(prompt).toMatch(/chat between students/i);
  });

  it("keeps homework and dates said out loud, which is the point of recording", () => {
    // These are usually announced and never written down anywhere else. A
    // filter that threw out "organisational" talk would lose exactly them.
    expect(prompt).toMatch(/homework/i);
    expect(prompt).toMatch(/deadlines|tests/i);
  });

  it("forbids guessing at a mishearing, and forbids adding knowledge", () => {
    // Speech-to-text mangles technical words constantly, and a confident
    // wrong definition in revision notes is worse than a gap.
    expect(prompt).toMatch(/garbled/i);
    expect(prompt).toMatch(/rather than guessing/i);
    expect(prompt).toMatch(/not in the transcript/i);
  });

  it("works for a lesson with nothing known about it", () => {
    const bare = buildNotesPrompt({ transcript: "Only this." });
    expect(bare).toContain("Only this.");
    expect(bare).not.toContain("Subject:");
    expect(bare.startsWith("Below is a transcript")).toBe(true);
  });
});

describe("picking a dropped recording back up", () => {
  const now = 1_000_000;

  it("resumes a lesson the browser dropped", () => {
    expect(shouldAutoResume([], now)).toBe(true);
    expect(shouldAutoResume([now - 1000], now)).toBe(true);
    expect(shouldAutoResume([now - 1000, now - 2000], now)).toBe(true);
  });

  it("stops trying when the browser plainly cannot do it", () => {
    // Three failures inside two minutes is not a hiccup. Retrying for the
    // rest of the lesson would spin and still record nothing.
    expect(shouldAutoResume([now - 1000, now - 2000, now - 3000], now)).toBe(false);
  });

  it("forgets attempts once the lesson has been running fine again", () => {
    // A hiccup at the start must not use up the budget for one an hour later.
    const old = now - (AUTO_RESUME_WINDOW_MS + 1000);
    expect(shouldAutoResume([old, old, old], now)).toBe(true);
    expect(recentResumes([old, now - 500], now)).toEqual([now - 500]);
  });

  it("waits before trying, rather than hammering", () => {
    expect(AUTO_RESUME_DELAY_MS).toBeGreaterThanOrEqual(2000);
  });
});
