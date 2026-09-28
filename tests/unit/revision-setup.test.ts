import { describe, it, expect } from "vitest";
import { linksForPrompt, needsSetup, setupPrompt, subjectSetup } from "@/lib/school/revision-setup";
import type { StoredLink } from "@/lib/school/revision-links";

const SUBJECTS = [
  { id: "bio", name: "Biology" },
  { id: "maths", name: "Mathematics" },
  { id: "econ", name: "Economics" },
];

function link(over: Partial<StoredLink>): StoredLink {
  return {
    id: "x",
    title: "Link",
    url: "https://example.com/",
    kind: "NOTES",
    subjectId: null,
    topicId: null,
    ...over,
  };
}

describe("subjectSetup", () => {
  it("gives every subject a row, even one with nothing saved", () => {
    const setup = subjectSetup(SUBJECTS, []);
    expect(setup.map((s) => s.name)).toEqual(["Biology", "Mathematics", "Economics"]);
    expect(setup.every((s) => s.lookUp === null && s.deck === null)).toBe(true);
  });

  it("fills the two slots from that subject's own links", () => {
    const links = [
      link({ id: "smx", kind: "NOTES", subjectId: "bio" }),
      link({ id: "deck", kind: "FLASHCARDS", subjectId: "bio" }),
    ];
    const bio = subjectSetup(SUBJECTS, links)[0];
    expect(bio.lookUp?.id).toBe("smx");
    expect(bio.deck?.id).toBe("deck");
  });

  it("never fills a subject's slot from another subject's link", () => {
    // Biology's deck under Mathematics would send you to the wrong cards.
    const links = [link({ id: "biodeck", kind: "FLASHCARDS", subjectId: "bio" })];
    const maths = subjectSetup(SUBJECTS, links)[1];
    expect(maths.deck).toBeNull();
  });

  it("leaves a slot empty rather than filling it with a link saved under no subject", () => {
    // The tutor chat may fall back to a general link — you are in a
    // conversation there and can see what you are being sent to. A slot on
    // the Physics card claiming to be Physics must be Physics: one page saved
    // without a subject would otherwise mark every subject as set up, and the
    // one thing this grid is for is showing which subject is still missing.
    const links = [
      link({ id: "loose-notes", kind: "NOTES", subjectId: null }),
      link({ id: "loose-deck", kind: "FLASHCARDS", subjectId: null }),
    ];
    const setup = subjectSetup(SUBJECTS, links);
    expect(setup.every((s) => s.lookUp === null && s.deck === null)).toBe(true);
    expect(needsSetup(setup)).toHaveLength(3);
  });

  it("prefers the page you read over a pile of past papers", () => {
    const links = [
      link({ id: "papers", kind: "PAST_PAPERS", subjectId: "bio" }),
      link({ id: "notes", kind: "NOTES", subjectId: "bio" }),
    ];
    expect(subjectSetup(SUBJECTS, links)[0].lookUp?.id).toBe("notes");
  });

  it("falls back through the reading kinds when there are no notes", () => {
    const only = (kind: string) => subjectSetup(SUBJECTS, [link({ id: kind, kind, subjectId: "bio" })])[0];
    expect(only("QUESTIONS").lookUp?.id).toBe("QUESTIONS");
    expect(only("PAST_PAPERS").lookUp?.id).toBe("PAST_PAPERS");
    expect(only("OTHER").lookUp?.id).toBe("OTHER");
  });

  it("does not count a deck as somewhere to look things up", () => {
    const links = [link({ id: "deck", kind: "FLASHCARDS", subjectId: "bio" })];
    const bio = subjectSetup(SUBJECTS, links)[0];
    expect(bio.lookUp).toBeNull();
    expect(bio.deck?.id).toBe("deck");
  });
});

describe("needsSetup", () => {
  it("lists a subject missing either half", () => {
    const links = [link({ id: "notes", kind: "NOTES", subjectId: "bio" })];
    const setup = subjectSetup(SUBJECTS, links);
    // Biology has one of two, so it still needs setting up.
    expect(needsSetup(setup).map((s) => s.name)).toEqual(["Biology", "Mathematics", "Economics"]);
  });

  it("drops a subject once both halves are there", () => {
    const links = [
      link({ id: "notes", kind: "NOTES", subjectId: "bio" }),
      link({ id: "deck", kind: "FLASHCARDS", subjectId: "bio" }),
    ];
    expect(needsSetup(subjectSetup(SUBJECTS, links)).map((s) => s.name)).toEqual(["Mathematics", "Economics"]);
  });

});

describe("linksForPrompt", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => link({ id: `filler-${i}`, kind: "NOTES", subjectId: "filler" }));

  it("keeps the links a slot is filled from, even when they are the oldest", () => {
    // Newest-first, so the two that matter sit at the very bottom of a long
    // list — exactly where a cap would cut them.
    const links = [...many(16), link({ id: "deck", kind: "FLASHCARDS", subjectId: "bio" })];
    const setup = subjectSetup([{ id: "bio", name: "Biology" }], links);
    const described = linksForPrompt(links, setup, 16);
    expect(described).toHaveLength(16);
    expect(described.map((l) => l.id)).toContain("deck");
  });

  it("leaves the rest newest-first behind them", () => {
    const links = [...many(3), link({ id: "deck", kind: "FLASHCARDS", subjectId: "bio" })];
    const setup = subjectSetup([{ id: "bio", name: "Biology" }], links);
    expect(linksForPrompt(links, setup, 16).map((l) => l.id)).toEqual([
      "deck",
      "filler-0",
      "filler-1",
      "filler-2",
    ]);
  });

  it("does not grow the list past the cap, or below zero", () => {
    const links = many(5);
    const setup = subjectSetup([{ id: "bio", name: "Biology" }], links);
    expect(linksForPrompt(links, setup, 2)).toHaveLength(2);
    expect(linksForPrompt(links, setup, 0)).toHaveLength(0);
    expect(linksForPrompt(links, setup, -1)).toHaveLength(0);
  });
});

describe("setupPrompt", () => {
  it("says nothing at all when there are no subjects", () => {
    expect(setupPrompt(subjectSetup([], []))).toBe("");
  });

  it("names each gap and what is missing from it", () => {
    const links = [link({ id: "notes", kind: "NOTES", subjectId: "bio" })];
    const lines = setupPrompt(subjectSetup(SUBJECTS, links)).split("\n");

    // Biology has its notes, so only the deck is missing.
    const biology = lines.find((line) => line.startsWith("- Biology"))!;
    expect(biology).toMatch(/flashcard deck/);
    expect(biology).not.toMatch(/look things up/);

    // Mathematics has neither, so the line names both.
    const maths = lines.find((line) => line.startsWith("- Mathematics"))!;
    expect(maths).toMatch(/look things up/);
    expect(maths).toMatch(/flashcard deck/);

    // The examples are named so the student knows what kind of address to
    // fetch, without the app claiming to know the address itself.
    expect(maths).toMatch(/Save My Exams/);
    expect(maths).toMatch(/Carousel/);
  });

  it("tells the tutor to ask only when it is relevant, not in every answer", () => {
    // A tutor that opens every reply by telling you to configure something is
    // a tutor people stop opening.
    const prompt = setupPrompt(subjectSetup(SUBJECTS, []));
    expect(prompt).toMatch(/only when it is relevant/);
    expect(prompt).toMatch(/do not open unrelated/i);
    expect(prompt).toMatch(/ask them once/);
  });

  it("forbids inventing an address, since it has never seen these sites", () => {
    const prompt = setupPrompt(subjectSetup(SUBJECTS, []));
    expect(prompt).toMatch(/Never invent a link or guess an address/);
  });

  it("switches to naming the links once nothing is missing", () => {
    const both = (id: string) => [
      link({ id: `${id}-n`, kind: "NOTES", subjectId: id }),
      link({ id: `${id}-d`, kind: "FLASHCARDS", subjectId: id }),
    ];
    const prompt = setupPrompt(subjectSetup(SUBJECTS, [...both("bio"), ...both("maths"), ...both("econ")]));
    expect(prompt).toMatch(/Every subject has both/);
    expect(prompt).not.toMatch(/still needs/);
  });
});
