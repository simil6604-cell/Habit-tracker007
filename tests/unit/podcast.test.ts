import { describe, it, expect } from "vitest";
import {
  cleanScript,
  describeSource,
  episodeTitle,
  estimateSeconds,
  formatLength,
  hasMaterial,
  MAX_PIECE_CHARS,
  parseScript,
  splitIntoPieces,
  type PodcastSource,
} from "@/lib/school/podcast";

const source = (over: Partial<PodcastSource> = {}): PodcastSource => ({
  subjectId: "s1",
  subjectName: "Biology",
  topics: [],
  flashcards: 0,
  notes: 0,
  confusions: 0,
  ...over,
});

describe("cleanScript", () => {
  it("takes out the markdown a synthesiser would read as words", () => {
    // "asterisk asterisk Nucleus asterisk asterisk" is what the listener
    // actually hears otherwise, and one of them spoils the episode.
    expect(cleanScript("**Nucleus** holds the *DNA*")).toBe("Nucleus holds the DNA");
    expect(cleanScript("## Summary\n- first\n- second")).toBe("Summary\nfirst\nsecond");
    expect(cleanScript("1. one\n2. two")).toBe("one\ntwo");
  });

  it("drops a code block entirely rather than reading it out", () => {
    expect(cleanScript("Before\n```js\nconst x = 1;\n```\nAfter")).toBe("Before\n \nAfter");
  });

  it("leaves ordinary prose alone, hyphens and all", () => {
    const prose = "So — the nucleus. It holds the DNA, and it decides what the cell makes.";
    expect(cleanScript(prose)).toBe(prose);
  });
});

describe("splitIntoPieces", () => {
  it("cuts at sentence ends, never inside one", () => {
    // Grouped up to the limit, and the cut always lands on a full stop,
    // an exclamation or a question mark — a piece is always something a
    // person could say in one go.
    expect(splitIntoPieces("One. Two! Three?", 12)).toEqual(["One. Two!", "Three?"]);
    expect(splitIntoPieces("One. Two! Three?", 4)).toEqual(["One.", "Two!", "Three?"]);
  });

  it("groups short sentences up to the limit rather than one request each", () => {
    // One network round trip per clause would make the first word arrive
    // late and the rest arrive in stutters.
    const pieces = splitIntoPieces("A. B. C. D.", 400);
    expect(pieces).toEqual(["A. B. C. D."]);
  });

  it("keeps a long sentence whole rather than cutting mid-clause", () => {
    const long = `${"word ".repeat(200).trim()}.`;
    const pieces = splitIntoPieces(long);
    expect(pieces).toHaveLength(1);
    expect(pieces[0].length).toBeGreaterThan(MAX_PIECE_CHARS);
  });

  it("treats a paragraph break as a break", () => {
    expect(splitIntoPieces("First part\n\nSecond part", 12)).toEqual(["First part", "Second part"]);
  });

  it("gives back nothing for nothing", () => {
    expect(splitIntoPieces("")).toEqual([]);
    expect(splitIntoPieces("   \n  ")).toEqual([]);
  });

  it("loses no words, whatever the grouping", () => {
    const script = "One. Two. Three. Four. Five.";
    expect(splitIntoPieces(script, 10).join(" ")).toBe(script);
  });
});

describe("how long it takes", () => {
  it("counts from the words, at a speaking pace rather than a reading one", () => {
    // 140 words a minute: a teacher explaining, not a newsreader.
    expect(estimateSeconds("word ".repeat(140))).toBe(60);
    expect(estimateSeconds("word ".repeat(70))).toBe(30);
  });

  it("never says zero for something that has words in it", () => {
    expect(estimateSeconds("one")).toBeGreaterThan(0);
  });

  it("reads as minutes once there are any", () => {
    expect(formatLength(45)).toBe("45 sec");
    expect(formatLength(120)).toBe("2 min");
    expect(formatLength(150)).toBe("2 min 30 sec");
  });
});

describe("parseScript", () => {
  it("refuses something too short to be an episode", () => {
    const result = parseScript("Here you go.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/short/i);
  });

  it("accepts a real one, cleaned, with its length worked out", () => {
    const result = parseScript(`**Right.** ${"word ".repeat(200)}`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.script.startsWith("Right.")).toBe(true);
      expect(result.script).not.toContain("*");
      expect(result.seconds).toBeGreaterThan(60);
    }
  });
});

describe("episodeTitle", () => {
  it("falls back rather than using a whole paragraph as a title", () => {
    expect(episodeTitle("x".repeat(200), "Biology")).toBe("Biology");
    expect(episodeTitle("", "Biology")).toBe("Biology");
  });
});

describe("what an episode can be made from", () => {
  it("knows when there is nothing", () => {
    expect(hasMaterial(source())).toBe(false);
    expect(hasMaterial(source({ flashcards: 3 }))).toBe(true);
    expect(hasMaterial(source({ topics: ["Cells"] }))).toBe(true);
  });

  it("says what it will use, in words", () => {
    const text = describeSource(source({ topics: ["Cells", "Enzymes"], flashcards: 12, confusions: 1 }));
    expect(text).toContain("Biology");
    expect(text).toContain("Cells, Enzymes");
    expect(text).toContain("12 flashcards");
    // Singular where it is one, because "1 things you flagged" is the kind
    // of detail that makes an app feel unfinished.
    expect(text).toContain("1 thing you flagged");
  });

  it("names the subject alone when there is nothing else to say", () => {
    expect(describeSource(source())).toBe("Biology");
  });
});
