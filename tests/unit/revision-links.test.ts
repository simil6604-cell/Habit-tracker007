import { describe, it, expect } from "vitest";
import {
  detectKind,
  detectProvider,
  flashcardDecks,
  MAX_LINK_TITLE,
  parseLinkInput,
  revisionLinksPrompt,
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
