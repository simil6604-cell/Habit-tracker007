import { describe, it, expect } from "vitest";
import { SPOKEN_STYLE, spokenGreeting, toSpokenText } from "@/lib/ai/spoken-mode";
import {
  speechWatchdogMs,
  SPEECH_WATCHDOG_FLOOR_MS,
  SPEECH_WATCHDOG_CEILING_MS,
} from "@/lib/hooks/use-voice-conversation";

describe("SPOKEN_STYLE", () => {
  it("forbids the markdown that a speech synthesiser reads out character by character", () => {
    for (const banned of ["markdown", "bullet", "asterisk", "numbered"]) {
      expect(SPOKEN_STYLE.toLowerCase(), banned).toContain(banned);
    }
  });

  it("asks for a short turn and a question back, which is what makes it a conversation", () => {
    expect(SPOKEN_STYLE).toMatch(/two or three sentences/i);
    expect(SPOKEN_STYLE).toMatch(/question/i);
  });

  it("says to ask rather than guess when it did not catch something", () => {
    expect(SPOKEN_STYLE).toMatch(/did not catch/i);
  });
});

describe("spokenGreeting", () => {
  it("opens like a person, not like a form", () => {
    expect(spokenGreeting("coach", 0)).toBe("Hey — what's up?");
    expect(spokenGreeting("tutor", 0)).toBe("Hey — what are we working on?");
  });

  it("says something different next time, which is what stops it feeling like a machine", () => {
    const heard = new Set([0, 1, 2, 3, 4].map((seed) => spokenGreeting("coach", seed)));
    expect(heard.size).toBeGreaterThan(3);
  });

  it("asks the tutor about work and the coach about you", () => {
    const tutor = [0, 1, 2, 3, 4].map((s) => spokenGreeting("tutor", s)).join(" ");
    expect(tutor).toMatch(/topic|working on|stuck|go through|look at/i);
  });

  it("always has something to say, whatever the seed is", () => {
    for (const seed of [0, 1, 7, 12345, -3, -1, 1.9, Number.MAX_SAFE_INTEGER]) {
      const greeting = spokenGreeting("coach", seed);
      expect(typeof greeting, String(seed)).toBe("string");
      expect(greeting.length, String(seed)).toBeGreaterThan(0);
    }
  });
});

describe("toSpokenText", () => {
  it("leaves an ordinary spoken sentence alone", () => {
    expect(toSpokenText("You're about sixty per cent through. Want to start with the weak topic?")).toBe(
      "You're about sixty per cent through. Want to start with the weak topic?"
    );
  });

  it("drops the asterisks rather than saying them", () => {
    // One stray asterisk read out as "asterisk" is enough to make the whole
    // answer sound broken.
    expect(toSpokenText("That is **really** important")).toBe("That is really important");
    expect(toSpokenText("That is *really* important")).toBe("That is really important");
    expect(toSpokenText("That is __really__ important")).toBe("That is really important");
    expect(toSpokenText("That is _really_ important")).toBe("That is really important");
  });

  it("turns a bullet list into a sentence rather than reading the dashes", () => {
    expect(toSpokenText("- First thing\n- Second thing")).toBe("First thing Second thing");
    expect(toSpokenText("* First\n+ Second")).toBe("First Second");
  });

  it("drops the numbers from a numbered list, which are heard as part of the words", () => {
    expect(toSpokenText("1. Revise\n2) Practise")).toBe("Revise Practise");
  });

  it("drops headings and quote markers", () => {
    expect(toSpokenText("## Economics\nYou are fine here")).toBe("Economics You are fine here");
    expect(toSpokenText("> A quote")).toBe("A quote");
  });

  it("drops a diagram entirely instead of spelling it out", () => {
    // There is no useful way to say an SVG, and reading the alt text of a
    // drawing nobody can see is worse than skipping it.
    const spoken = toSpokenText("Look at this:\n```svg\n<svg><rect/></svg>\n```\nSee?");
    expect(spoken).toBe("Look at this: See?");
    expect(spoken).not.toContain("svg");
  });

  it("drops a code block but keeps inline code as words", () => {
    expect(toSpokenText("Try ```js\nconst x = 1;\n``` now")).toBe("Try now");
    expect(toSpokenText("The `demand` curve")).toBe("The demand curve");
  });

  it("keeps a link's words and drops its address", () => {
    expect(toSpokenText("See [the notes](https://example.com/very/long)")).toBe("See the notes");
  });

  it("drops an image without leaving its bang behind", () => {
    expect(toSpokenText("Here ![a graph](https://example.com/g.png) is it")).toBe("Here is it");
  });

  it("drops a horizontal rule, which is a pause on the page and nothing in speech", () => {
    expect(toSpokenText("One\n\n---\n\nTwo")).toBe("One Two");
  });

  it("does not eat an ordinary hyphen or a minus sign", () => {
    expect(toSpokenText("A well-known trade-off")).toBe("A well-known trade-off");
    expect(toSpokenText("It fell by -5 points")).toBe("It fell by -5 points");
  });

  it("does not strip an underscore in the middle of a word", () => {
    expect(toSpokenText("the max_marks column")).toBe("the max_marks column");
    // Two of them in one sentence is the case that matters: a naive pair rule
    // treats everything between the first and the last as emphasis and runs
    // the words together as "maxmarks and minmarks".
    expect(toSpokenText("compare max_marks and min_marks")).toBe("compare max_marks and min_marks");
  });

  it("copes with nothing to say", () => {
    expect(toSpokenText("")).toBe("");
    expect(toSpokenText("   \n\n  ")).toBe("");
  });
});

describe("speechWatchdogMs", () => {
  it("waits longer for a longer answer", () => {
    const short = speechWatchdogMs("Hey, what's up?");
    const long = speechWatchdogMs("word ".repeat(60));
    expect(long).toBeGreaterThan(short);
  });

  it("never waits less than the floor, so a short reply is not cut off", () => {
    expect(speechWatchdogMs("Yes.")).toBe(SPEECH_WATCHDOG_FLOOR_MS);
    expect(speechWatchdogMs("")).toBe(SPEECH_WATCHDOG_FLOOR_MS);
  });

  it("is capped, so a runaway reply cannot wedge the microphone shut for ever", () => {
    expect(speechWatchdogMs("word ".repeat(5000))).toBe(SPEECH_WATCHDOG_CEILING_MS);
  });

  it("allows far more time than anyone actually takes to say the words", () => {
    // Cutting a real sentence short is worse than waiting a moment longer, so
    // the allowance is about three times slower than natural speech.
    const words = 20;
    expect(speechWatchdogMs("word ".repeat(words))).toBeGreaterThan(words * 300);
  });
});
