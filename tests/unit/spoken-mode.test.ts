import { describe, it, expect } from "vitest";
import { firstNameFor, SPOKEN_STYLE, spokenGreeting, toSpokenText } from "@/lib/ai/spoken-mode";
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
  it("says the name of whoever is signed in, and offers to help", () => {
    // What was asked for: "hallo <name>, wie kann ich dir behilflich sein".
    expect(spokenGreeting("coach", 0, "Marco")).toBe("Hi Marco — how can I help?");
    expect(spokenGreeting("tutor", 0, "Marco")).toBe("Hi Marco — what are we working on?");
  });

  it("uses the first name only", () => {
    // The full name read out loud sounds like a waiting room.
    expect(spokenGreeting("coach", 0, "Marco Rossi")).toBe("Hi Marco — how can I help?");
  });

  it("still opens properly when there is no name to use", () => {
    for (const name of [null, undefined, "", "   ", "someone@example.com"]) {
      const greeting = spokenGreeting("coach", 0, name);
      // No stray gap where the name would have gone.
      expect(greeting, String(name)).toBe("Hi — how can I help?");
    }
  });

  it("varies, so it does not sound like a machine coming online", () => {
    const seen = new Set([0, 1, 2, 3, 4].map((seed) => spokenGreeting("coach", seed, "Marco")));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("never hands the synthesiser nothing", () => {
    for (const seed of [-5, -1, 0, 7, 1e9]) {
      expect(spokenGreeting("tutor", seed, "Marco"), String(seed)).toMatch(/\S/);
    }
  });
});

describe("firstNameFor", () => {
  it("takes the first name when there is a usable one", () => {
    expect(firstNameFor("Marco Rossi")).toBe("Marco");
    expect(firstNameFor("  Anna  ")).toBe("Anna");
  });

  it("refuses what should not be read out loud", () => {
    expect(firstNameFor(null)).toBeNull();
    expect(firstNameFor("")).toBeNull();
    // An account named after its login would be greeted as "Hi svnfvytbzj".
    expect(firstNameFor("svnfvytbzj@privaterelay.appleid.com")).toBeNull();
    expect(firstNameFor("X")).toBeNull();
    expect(firstNameFor("a".repeat(40))).toBeNull();
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
