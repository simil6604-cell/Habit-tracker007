import { describe, it, expect } from "vitest";
import {
  EPISODE_LENGTHS,
  DEFAULT_LENGTH,
  episodeLength,
  EPISODE_STYLES,
  DEFAULT_STYLE,
  NEW_EPISODE_STYLE,
  episodeStyle,
  styleLabel,
  MAX_SCRIPT_CHARS,
  WORDS_PER_MINUTE,
  parseDialogue,
  isDialogue,
  splitIntoSpokenPieces,
  cleanScript,
  describeSource,
  episodeTitle,
  estimateSeconds,
  formatLength,
  hasMaterial,
  MAX_PIECE_CHARS,
  parseScript,
  splitIntoPieces,
  pieceTimeline,
  totalSpokenSeconds,
  pieceAtSecond,
  skipTo,
  formatClock,
  resumeIndex,
  type PodcastSource,
} from "@/lib/school/podcast";

const source = (over: Partial<PodcastSource> = {}): PodcastSource => ({
  subjectId: "s1",
  subjectName: "Biology",
  topics: [],
  flashcards: 0,
  notes: 0,
  confusions: 0,
  lessons: 0,
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

  it("counts a recorded lesson as material", () => {
    // A lesson recorded from the school AI is filed under the subject and
    // no topic. Before it was counted here, someone could have an hour of
    // their own lesson notes in a subject and be told on the podcast page
    // that there was nothing to make an episode from.
    expect(hasMaterial(source({ lessons: 1 }))).toBe(true);
    expect(describeSource(source({ lessons: 2 }))).toContain("2 lessons");
    expect(describeSource(source({ lessons: 1 }))).toContain("1 lesson");
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

describe("an episode as two voices", () => {
  const script = [
    "A: Right — what happens to total revenue if they cut the price?",
    "B: It goes down, surely. Less money per unit.",
    "A: That is the trap. It depends on elasticity.",
  ].join("\n");

  it("reads who is speaking on each line", () => {
    expect(parseDialogue(script)).toEqual([
      { speaker: "A", text: "Right — what happens to total revenue if they cut the price?" },
      { speaker: "B", text: "It goes down, surely. Less money per unit." },
      { speaker: "A", text: "That is the trap. It depends on elasticity." },
    ]);
  });

  it("takes the tag however the model wrote it", () => {
    const loose = ["[A]: one", "B - two", " a: three"].join("\n");
    expect(parseDialogue(loose).map((l) => l.speaker)).toEqual(["A", "B", "A"]);
  });

  it("keeps a paragraph that ran on under the speaker who started it", () => {
    const wrapped = "A: first part\nstill the same person\nB: now me";
    expect(parseDialogue(wrapped)).toEqual([
      { speaker: "A", text: "first part still the same person" },
      { speaker: "B", text: "now me" },
    ]);
  });

  it("still plays an episode written before there were two voices", () => {
    // Every episode already saved has no tags at all. It was one voice,
    // and it comes back as one voice rather than as nothing.
    const old = "The mole is the amount of substance. It contains Avogadro's number of particles.";
    expect(parseDialogue(old)).toEqual([{ speaker: "A", text: old }]);
    expect(isDialogue(old)).toBe(false);
    expect(isDialogue(script)).toBe(true);
  });

  it("never puts two speakers in one spoken piece", () => {
    const pieces = splitIntoSpokenPieces(script);
    expect(pieces.length).toBeGreaterThanOrEqual(3);
    for (const piece of pieces) {
      expect(piece.text).not.toContain("A:");
      expect(piece.text).not.toContain("B:");
    }
    expect(pieces[0].speaker).toBe("A");
    expect(pieces.some((p) => p.speaker === "B")).toBe(true);
  });

  it("splits a long turn without changing who is saying it", () => {
    const long = `A: ${"This is a long explanation that keeps going. ".repeat(20)}`;
    const pieces = splitIntoSpokenPieces(long);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((p) => p.speaker === "A")).toBe(true);
  });

  it("keeps the tags through the cleaner, which eats bullet markers", () => {
    // A model that writes "- A: ..." must not have the tag stripped with
    // the bullet, or the whole episode collapses into one voice.
    expect(cleanScript("- A: one\n- B: two")).toBe("A: one\nB: two");
    expect(cleanScript("- a plain bullet")).toBe("a plain bullet");
  });
});

describe("how long an episode may be", () => {
  it("offers something for a walk and something for a session at the gym", () => {
    expect(EPISODE_LENGTHS).toContain(3);
    expect(EPISODE_LENGTHS).toContain(20);
    expect(Math.max(...EPISODE_LENGTHS)).toBe(20);
  });

  it("takes one of the offered lengths and nothing else", () => {
    expect(episodeLength(20)).toBe(20);
    expect(episodeLength("15")).toBe(15);
    // Not on the list, so it falls back rather than being sent as-is.
    expect(episodeLength(7)).toBe(DEFAULT_LENGTH);
    expect(episodeLength("an hour")).toBe(DEFAULT_LENGTH);
    expect(episodeLength(undefined)).toBe(DEFAULT_LENGTH);
    expect(episodeLength(-5)).toBe(DEFAULT_LENGTH);
  });

  it("keeps the whole of the longest episode", () => {
    // The cap is a guard against a runaway reply, not a length limit. At
    // 12,000 characters it quietly cut a twenty-minute episode off after
    // eight — the episode played, ended mid-thought, and nothing said why.
    const longest = Math.max(...EPISODE_LENGTHS);
    const words = longest * WORDS_PER_MINUTE;
    // Six characters a word is generous for English and German both, and
    // the speaker tags add a little on top.
    expect(MAX_SCRIPT_CHARS).toBeGreaterThan(words * 6 * 1.2);
  });

  it("estimates the length of a script it is given", () => {
    const twentyMinutes = "word ".repeat(20 * WORDS_PER_MINUTE);
    expect(Math.round(estimateSeconds(twentyMinutes) / 60)).toBe(20);
  });
});

describe("which kind of episode", () => {
  it("offers the one that reads your notes and the one that teaches them", () => {
    expect(EPISODE_STYLES).toContain("READING");
    expect(EPISODE_STYLES).toContain("CONVERSATION");
  });

  it("reads back anything it does not know as the two-voice kind", () => {
    // An episode written before the reading kind existed has no style
    // stored at all, and it was a conversation — so that, and not a crash
    // or a blank label, is what an unknown value has to mean.
    expect(episodeStyle("READING")).toBe("READING");
    expect(episodeStyle("reading")).toBe("READING");
    expect(episodeStyle(" Reading ")).toBe("READING");
    expect(episodeStyle(undefined)).toBe(DEFAULT_STYLE);
    expect(episodeStyle("")).toBe(DEFAULT_STYLE);
    expect(episodeStyle("PODCAST")).toBe(DEFAULT_STYLE);
    expect(episodeStyle(7)).toBe(DEFAULT_STYLE);
    expect(DEFAULT_STYLE).toBe("CONVERSATION");
  });

  it("starts a new one on the reading kind, and reads an old one as a conversation", () => {
    // Two different facts that look like one. What a new episode is when
    // nobody chose: the reading, because that is what was asked for. What
    // a missing style on a stored row means: a conversation, because every
    // episode written before this existed was one.
    expect(NEW_EPISODE_STYLE).toBe("READING");
    expect(DEFAULT_STYLE).toBe("CONVERSATION");
  });

  it("has a name for each that says what you will hear", () => {
    expect(styleLabel("READING")).toBe("Read to me");
    expect(styleLabel("CONVERSATION")).toBe("Two voices");
  });
});

describe("playing an episode like a recording", () => {
  // A minute of speech, split so the arithmetic is checkable by eye.
  const minute = (count: number) => ({ text: "word ".repeat(count).trim() });

  it("lays the pieces out on a clock", () => {
    const timeline = pieceTimeline([minute(WORDS_PER_MINUTE), minute(WORDS_PER_MINUTE / 2)]);
    expect(timeline[0]).toEqual({ start: 0, seconds: 60 });
    expect(timeline[1]).toEqual({ start: 60, seconds: 30 });
    expect(totalSpokenSeconds(timeline)).toBe(90);
    expect(totalSpokenSeconds([])).toBe(0);
  });

  it("gives even the shortest piece a second of its own", () => {
    // Otherwise it rounds to zero: a point on the bar you can never land
    // on, and two pieces that start at the same moment.
    const timeline = pieceTimeline([{ text: "Right." }, { text: "So." }]);
    expect(timeline[0].seconds).toBeGreaterThanOrEqual(1);
    expect(timeline[1].start).toBeGreaterThan(timeline[0].start);
  });

  it("finds the piece under the point you dragged to", () => {
    const timeline = pieceTimeline([minute(WORDS_PER_MINUTE), minute(WORDS_PER_MINUTE), minute(WORDS_PER_MINUTE)]);
    expect(pieceAtSecond(timeline, 0)).toBe(0);
    expect(pieceAtSecond(timeline, 59)).toBe(0);
    expect(pieceAtSecond(timeline, 60)).toBe(1);
    expect(pieceAtSecond(timeline, 150)).toBe(2);
    // Dragged past the end, or to somewhere before the start.
    expect(pieceAtSecond(timeline, 9_999)).toBe(2);
    expect(pieceAtSecond(timeline, -20)).toBe(0);
    expect(pieceAtSecond([], 30)).toBe(0);
  });

  it("always lands somewhere else when you press skip", () => {
    // Each piece here takes about thirty seconds to say, which is also
    // what the skip button jumps. Measured from the start of the piece
    // that is playing, thirty seconds on is still inside it — so the
    // button does nothing, twice, and reads as broken.
    const halfMinute = minute(WORDS_PER_MINUTE / 2);
    const timeline = pieceTimeline([halfMinute, halfMinute, halfMinute, halfMinute]);
    expect(skipTo(timeline, 0, 30)).toBe(1);
    expect(skipTo(timeline, 1, 30)).toBe(2);
    expect(skipTo(timeline, 2, -30)).toBe(1);

    // A bigger jump still goes as far as it was asked to.
    expect(skipTo(timeline, 0, 90)).toBe(3);
    expect(skipTo(timeline, 3, -90)).toBe(0);

    // And it stops at the ends rather than running off them.
    expect(skipTo(timeline, 3, 30)).toBe(3);
    expect(skipTo(timeline, 0, -30)).toBe(0);
    expect(skipTo([], 0, 30)).toBe(0);
  });

  it("shows a clock, not a rounded number of minutes", () => {
    // formatLength says "4 min", which is right on a card and useless on a
    // bar you are dragging.
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(7)).toBe("0:07");
    expect(formatClock(272)).toBe("4:32");
    expect(formatClock(1_085)).toBe("18:05");
    expect(formatClock(-5)).toBe("0:00");
  });

  it("only carries on from a place this episode actually has", () => {
    expect(resumeIndex("12", 41)).toBe(12);
    expect(resumeIndex(0, 41)).toBe(0);
    // Left over from an episode that was longer, or was deleted and the
    // key reused — start again rather than jump to nowhere.
    expect(resumeIndex("99", 41)).toBe(0);
    expect(resumeIndex("-1", 41)).toBe(0);
    expect(resumeIndex("3.5", 41)).toBe(0);
    expect(resumeIndex("half way", 41)).toBe(0);
    expect(resumeIndex(null, 41)).toBe(0);
    expect(resumeIndex("0", 0)).toBe(0);
  });
});
