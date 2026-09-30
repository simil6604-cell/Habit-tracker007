import { describe, it, expect } from "vitest";
import {
  bestLink,
  detectKind,
  detectProvider,
  flashcardDecks,
  MAX_LINK_TITLE,
  parseLinkInput,
  revisionLinksPrompt,
  parseTopicName,
  stuckLinks,
  type StoredLink,
} from "@/lib/school/revision-links";

const CAROUSEL = "https://app.carousel-learning.com/quiz/58669cfa-9905-450d-a085-e203fda94606/revise";

describe("detectProvider", () => {
  it("names the two services this was built for", () => {
    expect(detectProvider(CAROUSEL)).toBe("Carousel Learning");
    expect(detectProvider("https://www.savemyexams.com/igcse/biology/")).toBe("Save My Exams");
    expect(detectProvider("https://savemyexams.co.uk/igcse/biology/")).toBe("Save My Exams");
  });

  it("falls back to the host for anything else", () => {
    expect(detectProvider("https://www.physicsandmathstutor.com/biology/")).toBe("physicsandmathstutor.com");
  });

  it("does not mistake a lookalike domain for the real one", () => {
    // "carousel-learning.com.evil.test" ends with the evil host, not theirs.
    expect(detectProvider("https://carousel-learning.com.evil.test/quiz/1")).toBe("carousel-learning.com.evil.test");
    expect(detectProvider("https://notsavemyexams.com/x")).toBe("notsavemyexams.com");
  });
});

describe("detectKind", () => {
  it("treats a Carousel deck as flashcards, which is what it is", () => {
    expect(detectKind(CAROUSEL)).toBe("FLASHCARDS");
    expect(detectKind("https://carousel-learning.com/anything")).toBe("FLASHCARDS");
  });

  it("reads the shape of a revision URL", () => {
    expect(detectKind("https://www.savemyexams.com/igcse/biology/past-papers/")).toBe("PAST_PAPERS");
    expect(detectKind("https://www.savemyexams.com/igcse/biology/topic-questions/")).toBe("QUESTIONS");
    expect(detectKind("https://www.savemyexams.com/igcse/biology/revision-notes/")).toBe("NOTES");
  });

  it("says OTHER rather than guessing when the address says nothing", () => {
    expect(detectKind("https://example.com/")).toBe("OTHER");
  });

  it("refuses a link that is not a link", () => {
    expect(detectKind("not a url")).toBe("OTHER");
    expect(detectKind("javascript:alert(1)")).toBe("OTHER");
  });
});

describe("parseLinkInput", () => {
  it("takes a Carousel deck and fills in what it can", () => {
    const result = parseLinkInput({ title: "", url: CAROUSEL, kind: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe("FLASHCARDS");
    // An empty name becomes the service, so a saved link never reads as a
    // bare URL in the list.
    expect(result.value.title).toBe("Carousel Learning");
  });

  it("keeps the name you gave it", () => {
    const result = parseLinkInput({ title: "  Heart   deck  ", url: CAROUSEL, kind: "FLASHCARDS" });
    expect(result.ok && result.value.title).toBe("Heart deck");
  });

  it("lets your choice of kind beat the guess", () => {
    // Guessing and then overriding what someone picked is worse than not
    // guessing at all.
    const result = parseLinkInput({ title: "x", url: CAROUSEL, kind: "NOTES" });
    expect(result.ok && result.value.kind).toBe("NOTES");
  });

  it("refuses a scheme that would run code from an href", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "vbscript:msgbox(1)", "  ", "not a url"]) {
      const result = parseLinkInput({ title: "x", url: bad, kind: "" });
      expect(result.ok, `${bad} must be refused`).toBe(false);
    }
  });

  it("refuses a name longer than the field is meant to hold", () => {
    expect(parseLinkInput({ title: "x".repeat(MAX_LINK_TITLE), url: CAROUSEL, kind: "" }).ok).toBe(true);
    expect(parseLinkInput({ title: "x".repeat(MAX_LINK_TITLE + 1), url: CAROUSEL, kind: "" }).ok).toBe(false);
  });

  it("falls back to a real kind when the one supplied is made up", () => {
    const result = parseLinkInput({ title: "x", url: CAROUSEL, kind: "<script>" });
    expect(result.ok && result.value.kind).toBe("FLASHCARDS");
  });
});

describe("flashcardDecks", () => {
  const links: StoredLink[] = [
    { id: "1", title: "Heart deck", url: CAROUSEL, kind: "FLASHCARDS", subjectId: "bio", topicId: null },
    { id: "2", title: "Notes", url: "https://www.savemyexams.com/x", kind: "NOTES", subjectId: "bio", topicId: null },
  ];

  it("is what 'when I need flashcards' means", () => {
    expect(flashcardDecks(links).map((l) => l.id)).toEqual(["1"]);
  });
});

describe("revisionLinksPrompt", () => {
  it("tells the AI it has not read them, in as many words", () => {
    const prompt = revisionLinksPrompt([
      { title: "Heart deck", url: CAROUSEL, kind: "FLASHCARDS", subjectName: "Biology", topicName: null },
    ]);
    // Without this the model will cheerfully summarise notes it has never
    // seen, which is the most convincing kind of wrong answer this app could
    // produce.
    expect(prompt).toMatch(/NOT read/);
    expect(prompt).toMatch(/never opens the page/);
    expect(prompt).toMatch(/Never summarise, quote or claim to know/);
  });

  it("lists each link with where it belongs", () => {
    const prompt = revisionLinksPrompt([
      { title: "Heart deck", url: CAROUSEL, kind: "FLASHCARDS", subjectName: "Biology", topicName: "Circulation" },
    ]);
    expect(prompt).toContain("Heart deck");
    expect(prompt).toContain("Circulation");
    expect(prompt).toContain(CAROUSEL);
  });

  it("sends flashcard requests to the saved deck rather than into the chat", () => {
    const prompt = revisionLinksPrompt([
      { title: "Heart deck", url: CAROUSEL, kind: "FLASHCARDS", subjectName: "Biology", topicName: null },
    ]);
    expect(prompt).toMatch(/point them at their own flashcard deck/);
  });

  it("with nothing saved, says so and forbids inventing one", () => {
    const prompt = revisionLinksPrompt([]);
    expect(prompt).toMatch(/not saved any revision links/);
    expect(prompt).toMatch(/do not invent a link/);
  });
});

describe("bestLink and stuckLinks", () => {
  const link = (over: Partial<StoredLink>): StoredLink => ({
    id: "x",
    title: "Link",
    url: "https://example.com/",
    kind: "NOTES",
    subjectId: null,
    topicId: null,
    ...over,
  });

  it("prefers this topic's link over the subject's", () => {
    const links = [
      link({ id: "subject", kind: "FLASHCARDS", subjectId: "bio" }),
      link({ id: "topic", kind: "FLASHCARDS", subjectId: "bio", topicId: "circulation" }),
    ];
    expect(bestLink(links, "FLASHCARDS", { subjectId: "bio", topicId: "circulation" })?.id).toBe("topic");
  });

  it("falls back to the subject's link when the topic has none", () => {
    const links = [link({ id: "subject", kind: "FLASHCARDS", subjectId: "bio" })];
    expect(bestLink(links, "FLASHCARDS", { subjectId: "bio", topicId: "circulation" })?.id).toBe("subject");
  });

  it("falls back to a link saved for no subject at all", () => {
    // "My Carousel account", attached to nothing, is still the right answer
    // when this subject has nothing of its own.
    const links = [link({ id: "loose", kind: "FLASHCARDS" })];
    expect(bestLink(links, "FLASHCARDS", { subjectId: "bio", topicId: "circulation" })?.id).toBe("loose");
  });

  it("never offers another topic's link as this topic's", () => {
    // A deck pinned to Photosynthesis is not the Circulation deck, and showing
    // it under Circulation would send you to the wrong cards.
    const links = [link({ id: "other", kind: "FLASHCARDS", subjectId: "bio", topicId: "photosynthesis" })];
    expect(bestLink(links, "FLASHCARDS", { subjectId: "bio", topicId: "circulation" })).toBeNull();
  });

  it("never offers another subject's link", () => {
    const links = [link({ id: "chem", kind: "FLASHCARDS", subjectId: "chemistry" })];
    expect(bestLink(links, "FLASHCARDS", { subjectId: "bio" })).toBeNull();
  });

  it("takes the newest within a tier, since the query hands them over newest first", () => {
    const links = [
      link({ id: "newer", kind: "FLASHCARDS", subjectId: "bio" }),
      link({ id: "older", kind: "FLASHCARDS", subjectId: "bio" }),
    ];
    expect(bestLink(links, "FLASHCARDS", { subjectId: "bio" })?.id).toBe("newer");
  });

  it("is null when nothing of that kind is saved", () => {
    expect(bestLink([link({ kind: "NOTES" })], "FLASHCARDS", {})).toBeNull();
    expect(bestLink([], "NOTES", {})).toBeNull();
  });

  it("gives one place to read and one to test yourself", () => {
    const links = [
      link({ id: "notes", kind: "NOTES", subjectId: "bio" }),
      link({ id: "deck", kind: "FLASHCARDS", subjectId: "bio" }),
      link({ id: "papers", kind: "PAST_PAPERS", subjectId: "bio" }),
    ];
    const picked = stuckLinks(links, { subjectId: "bio" });
    expect(picked.lookUp?.id).toBe("notes");
    expect(picked.testYourself?.id).toBe("deck");
  });

  it("works down the kinds when there are no notes", () => {
    const only = (kind: string) => [link({ id: kind, kind, subjectId: "bio" })];
    expect(stuckLinks(only("QUESTIONS"), { subjectId: "bio" }).lookUp?.id).toBe("QUESTIONS");
    expect(stuckLinks(only("PAST_PAPERS"), { subjectId: "bio" }).lookUp?.id).toBe("PAST_PAPERS");
    expect(stuckLinks(only("OTHER"), { subjectId: "bio" }).lookUp?.id).toBe("OTHER");
  });

  it("never offers a flashcard deck as somewhere to read it up", () => {
    // They answer different questions, and a deck of questions is no use when
    // the whole problem is that you do not know the answer.
    const picked = stuckLinks([link({ id: "deck", kind: "FLASHCARDS", subjectId: "bio" })], { subjectId: "bio" });
    expect(picked.lookUp).toBeNull();
    expect(picked.testYourself?.id).toBe("deck");
  });

  it("counts a link pinned to one of the subject's topics as that subject's link", () => {
    // With no topic in view there is no such thing as the wrong topic. This
    // went the other way: the Biology deck was skipped for being pinned to a
    // Biology topic, and a deck saved under nothing was offered instead — so
    // the subject page opened the wrong deck and the grid reported the right
    // one missing.
    const links = [
      link({ id: "generic-deck", kind: "FLASHCARDS" }),
      link({ id: "bio-topic-deck", kind: "FLASHCARDS", subjectId: "bio", topicId: "circulation" }),
    ];
    expect(bestLink(links, "FLASHCARDS", { subjectId: "bio" })?.id).toBe("bio-topic-deck");
  });

  it("still refuses another topic's link when a topic IS in view", () => {
    const links = [link({ id: "other-topic", kind: "FLASHCARDS", subjectId: "bio", topicId: "genetics" })];
    expect(bestLink(links, "FLASHCARDS", { subjectId: "bio", topicId: "circulation" })).toBeNull();
  });

  it("puts whose link it is above what kind it is", () => {
    // Notes are the better kind for "look it up" — but a general notes page
    // saved under no subject is not better than this subject's own questions.
    const links = [
      link({ id: "generic-notes", kind: "NOTES" }),
      link({ id: "bio-questions", kind: "QUESTIONS", subjectId: "bio" }),
    ];
    expect(stuckLinks(links, { subjectId: "bio" }).lookUp?.id).toBe("bio-questions");
  });

  it("still ranks kinds within one tier", () => {
    const links = [
      link({ id: "bio-papers", kind: "PAST_PAPERS", subjectId: "bio" }),
      link({ id: "bio-notes", kind: "NOTES", subjectId: "bio" }),
    ];
    expect(stuckLinks(links, { subjectId: "bio" }).lookUp?.id).toBe("bio-notes");
  });

  it("gives back nothing at all when nothing is saved", () => {
    expect(stuckLinks([], { subjectId: "bio" })).toEqual({ lookUp: null, testYourself: null });
  });

  it("does not reach into another subject's links for a subject that has none", () => {
    // On Physics, the Biology deck is the wrong deck. Saying nothing is saved
    // is the honest answer, and the empty state tells you what to paste.
    const links = [
      link({ id: "bio-notes", kind: "NOTES", subjectId: "bio" }),
      link({ id: "bio-deck", kind: "FLASHCARDS", subjectId: "bio" }),
    ];
    expect(stuckLinks(links, { subjectId: "physics" })).toEqual({ lookUp: null, testYourself: null });
  });

  it("falls back across subjects only where there is no subject in view", () => {
    // The tutor chat. Without this, a student who files every link under its
    // subject — the tidy way — is told to go and save what they have saved.
    const links = [
      link({ id: "deck", kind: "FLASHCARDS", subjectId: "bio" }),
      link({ id: "notes", kind: "NOTES", subjectId: "maths" }),
    ];
    expect(stuckLinks(links, {})).toEqual({ lookUp: null, testYourself: null });

    const picked = stuckLinks(links, {}, { anySubject: true });
    expect(picked.lookUp?.id).toBe("notes");
    expect(picked.testYourself?.id).toBe("deck");
  });

  it("still prefers the scoped link over the fallback — both halves", () => {
    // Newest-first order puts the wrong subject's links first, so a fallback
    // that runs before the scope check would return them. Both halves are
    // asserted: the deck alone left the "look it up" half unguarded.
    const links = [
      link({ id: "other-deck", kind: "FLASHCARDS", subjectId: "maths" }),
      link({ id: "other-notes", kind: "NOTES", subjectId: "maths" }),
      link({ id: "own-deck", kind: "FLASHCARDS", subjectId: "bio" }),
      link({ id: "own-notes", kind: "NOTES", subjectId: "bio" }),
    ];
    const picked = stuckLinks(links, { subjectId: "bio" }, { anySubject: true });
    expect(picked.testYourself?.id).toBe("own-deck");
    expect(picked.lookUp?.id).toBe("own-notes");
  });

  it("keeps the kinds apart when it falls back", () => {
    // A deck is not somewhere to read it up, whichever subject it came from.
    const links = [link({ id: "deck", kind: "FLASHCARDS", subjectId: "bio" })];
    const picked = stuckLinks(links, {}, { anySubject: true });
    expect(picked.lookUp).toBeNull();
    expect(picked.testYourself?.id).toBe("deck");
  });
});

describe("parseTopicName", () => {
  it("takes whatever you typed, tidied", () => {
    expect(parseTopicName("  Cell   Biology ", true)).toEqual({ ok: true, name: "Cell Biology" });
  });

  it("treats an empty box as no topic, which is the normal case", () => {
    expect(parseTopicName("", true)).toEqual({ ok: true, name: null });
    expect(parseTopicName("   ", true)).toEqual({ ok: true, name: null });
    expect(parseTopicName(null, true)).toEqual({ ok: true, name: null });
  });

  it("refuses a topic with no subject rather than dropping it silently", () => {
    // You typed it, so you expect it to end up somewhere. A topic belongs to
    // a subject, so without one there is nowhere for it to go.
    const result = parseTopicName("Genetics", false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/subject first/i);
  });

  it("does not mind an empty box when no subject is chosen either", () => {
    expect(parseTopicName("", false)).toEqual({ ok: true, name: null });
  });

  it("refuses a name too long to read in a list", () => {
    const result = parseTopicName("x".repeat(81), true);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/80/);
  });

  it("allows one exactly at the limit", () => {
    expect(parseTopicName("x".repeat(80), true)).toEqual({ ok: true, name: "x".repeat(80) });
  });
});
