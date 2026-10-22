import { describe, expect, it } from "vitest";
import {
  hasBoard,
  parseExplainerSteps,
  pictureIndexAt,
  stepSpeech,
  youtubeSearchUrl,
  type ExplainerStep,
} from "@/lib/ai/explainer-board";

const reply = `Right, a mole ratio is just the numbers in front of the formulas.

\`\`\`svg
<svg viewBox="0 0 320 220"><title>The balanced equation</title><text x="10" y="20">2H2 + O2</text></svg>
\`\`\`

So two of hydrogen for every one of oxygen.

\`\`\`svg
<svg viewBox="0 0 320 220"><title>Two to one</title><circle cx="50" cy="50" r="10"/></svg>
\`\`\`

Want to try one yourself?`;

describe("parseExplainerSteps", () => {
  it("pairs each sentence with the picture that follows it", () => {
    const steps = parseExplainerSteps(reply);
    expect(steps).toHaveLength(3);

    expect(steps[0].say).toBe("Right, a mole ratio is just the numbers in front of the formulas.");
    expect(steps[0].caption).toBe("The balanced equation");
    expect(steps[0].svg).toContain("2H2 + O2");

    expect(steps[1].say).toBe("So two of hydrogen for every one of oxygen.");
    expect(steps[1].caption).toBe("Two to one");

    // The closing line has no picture, and must not be dropped — it is the
    // question that keeps it a conversation.
    expect(steps[2]).toEqual({ say: "Want to try one yourself?", svg: null, caption: null });
  });

  it("treats a reply with no drawing as one spoken step", () => {
    const steps = parseExplainerSteps("Hey — what are we working on?");
    expect(steps).toEqual([{ say: "Hey — what are we working on?", svg: null, caption: null }]);
    expect(hasBoard(steps)).toBe(false);
  });

  it("knows when there is something to put on the board", () => {
    expect(hasBoard(parseExplainerSteps(reply))).toBe(true);
  });

  it("keeps a picture that arrives with no sentence in front of it", () => {
    const steps = parseExplainerSteps("```svg\n<svg><title>Just this</title></svg>\n```");
    expect(steps).toHaveLength(1);
    expect(steps[0].say).toBe("");
    expect(steps[0].caption).toBe("Just this");
    // Said out loud it falls back to the caption, so it doesn't flash past in
    // silence.
    expect(stepSpeech(steps[0])).toBe("Just this");
  });

  it("has no steps for an empty reply", () => {
    expect(parseExplainerSteps("")).toEqual([]);
    expect(parseExplainerSteps("   \n  ")).toEqual([]);
  });

  it("survives a drawing with no title, and an unclosed block", () => {
    const noTitle = parseExplainerSteps("Look:\n```svg\n<svg><rect/></svg>\n```");
    expect(noTitle[0].caption).toBeNull();
    expect(noTitle[0].svg).toBe("<svg><rect/></svg>");

    // Cut off mid-reply by a token limit: there is no closing fence, so there
    // is no step to draw, and the words that did arrive must still be spoken.
    const cut = parseExplainerSteps("Here's the idea:\n```svg\n<svg><rect/>");
    expect(cut).toHaveLength(1);
    expect(cut[0].svg).toBeNull();
    expect(cut[0].say).toContain("Here's the idea:");
  });

  it("reads a caption as text, entities and all", () => {
    const steps = parseExplainerSteps(
      "```svg\n<svg><title>Acid &amp; base, &lt;7 is acidic</title></svg>\n```"
    );
    expect(steps[0].caption).toBe("Acid & base, <7 is acidic");
  });

  it("does not let a caption carry markup", () => {
    // The caption is rendered as a React text node, so this is belt and
    // braces — but a caption is model output and must arrive as words only.
    const steps = parseExplainerSteps(
      "```svg\n<svg><title>Safe<script>alert(1)</script></title></svg>\n```"
    );
    expect(steps[0].caption).toBe("Safealert(1)");
    expect(steps[0].caption).not.toContain("<");
  });
});

describe("stepSpeech", () => {
  it("prefers the sentence, falls back to the caption, else says nothing", () => {
    expect(stepSpeech({ say: "Sentence", svg: null, caption: "Caption" })).toBe("Sentence");
    expect(stepSpeech({ say: "", svg: "<svg/>", caption: "Caption" })).toBe("Caption");
    expect(stepSpeech({ say: "", svg: "<svg/>", caption: null })).toBe("");
  });
});

describe("youtubeSearchUrl", () => {
  it("builds a search, never a video id", () => {
    const url = youtubeSearchUrl("mole ratios IGCSE");
    // A link to a made-up video id looks real and goes nowhere; a search for
    // the topic always lands on something.
    expect(url).toBe("https://www.youtube.com/results?search_query=mole%20ratios%20IGCSE");
    expect(url).not.toMatch(/\/watch\?v=|youtu\.be/);
  });

  it("escapes what would otherwise change the URL", () => {
    const url = youtubeSearchUrl("a&b=c #2 ?x");
    expect(url).toBe("https://www.youtube.com/results?search_query=a%26b%3Dc%20%232%20%3Fx");
  });

  it("has no link for an empty topic", () => {
    expect(youtubeSearchUrl("")).toBeNull();
    expect(youtubeSearchUrl("   ")).toBeNull();
  });

  it("caps a runaway topic", () => {
    const url = youtubeSearchUrl("x".repeat(500));
    expect(url).toBe(`https://www.youtube.com/results?search_query=${"x".repeat(120)}`);
  });
});

describe("pictureIndexAt", () => {
  // say/picture/say/picture/say — the shape the prompt asks for, ending on a
  // question with nothing drawn for it.
  const steps = parseExplainerSteps(reply);

  it("shows each step's own drawing while its sentence is spoken", () => {
    expect(pictureIndexAt(steps, 0)).toBe(0);
    expect(pictureIndexAt(steps, 1)).toBe(1);
  });

  it("holds the last drawing through a closing line that has none", () => {
    // Blanking the board here would take the picture away exactly when they
    // are being asked whether they want to try one.
    expect(pictureIndexAt(steps, 2)).toBe(1);
  });

  it("falls forward to the first drawing when the opening line precedes it", () => {
    const opening = parseExplainerSteps("Let me show you.\n\n```svg\n<svg><title>A</title></svg>\n```");
    // The text comes first in the reply but is step 0 with the picture, so
    // this is really about a reply that opens with words and no drawing yet.
    expect(pictureIndexAt(opening, 0)).toBe(0);

    const noneYet: ExplainerStep[] = [
      { say: "Hello", svg: null, caption: null },
      { say: "Here", svg: "<svg/>", caption: "A" },
    ];
    expect(pictureIndexAt(noneYet, 0)).toBe(1);
  });

  it("has nothing to show when nothing was drawn", () => {
    expect(pictureIndexAt(parseExplainerSteps("Just talking."), 0)).toBeNull();
    expect(pictureIndexAt([], 0)).toBeNull();
  });

  it("does not run off the end when the index is past the last step", () => {
    expect(pictureIndexAt(steps, 99)).toBe(1);
  });
});
