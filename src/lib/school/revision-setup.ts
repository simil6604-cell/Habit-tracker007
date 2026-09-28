import { bestLink, type StoredLink } from "./revision-links";

/**
 * Which subjects still need their two links, and what the AI should do about it.
 *
 * Each subject has exactly two slots worth filling:
 *
 *  - somewhere to LOOK IT UP when the tutor cannot help (Save My Exams, a
 *    school portal, anything you read from);
 *  - somewhere to TEST YOURSELF (a Carousel deck).
 *
 * The app cannot fill either for you. It has never opened those sites — they
 * are blocked from this environment and they are somebody else's product — so
 * it does not know the address of your Biology page any more than it knows
 * your password. Guessing one would produce a link that 404s, and a link that
 * 404s is worse than no link: you tap it and conclude your own account is
 * broken.
 *
 * What it can do is know exactly which slot is empty, put that in front of you
 * at the moment it matters, and tell the tutor to ask.
 */

export type SubjectSetup = {
  id: string;
  name: string;
  /** The saved place to read it up, if there is one. */
  lookUp: StoredLink | null;
  /** The saved deck to test yourself on, if there is one. */
  deck: StoredLink | null;
};

export function subjectSetup(
  subjects: { id: string; name: string }[],
  links: StoredLink[]
): SubjectSetup[] {
  return subjects.map((subject) => {
    // This subject's own links and nothing else — not the ones saved without
    // a subject either. A Save My Exams page is written for one subject, and
    // showing the Biology one under Physics is the precise mistake this grid
    // exists to prevent. (The tutor chat still falls back to a general link:
    // there you are already in a conversation and can see what it is.)
    const own = links.filter((link) => link.subjectId === subject.id);
    const scope = { subjectId: subject.id };
    // Notes first, then the other reading kinds, so "look it up" prefers the
    // page you actually read over a pile of past papers.
    const lookUp =
      bestLink(own, "NOTES", scope) ??
      bestLink(own, "QUESTIONS", scope) ??
      bestLink(own, "PAST_PAPERS", scope) ??
      bestLink(own, "OTHER", scope);
    return { id: subject.id, name: subject.name, lookUp, deck: bestLink(own, "FLASHCARDS", scope) };
  });
}

/** Subjects missing at least one of the two, in the order they were given. */
export function needsSetup(setup: SubjectSetup[]): SubjectSetup[] {
  return setup.filter((subject) => !subject.lookUp || !subject.deck);
}

export function isFullySetUp(setup: SubjectSetup[]): boolean {
  return setup.length > 0 && needsSetup(setup).length === 0;
}

/**
 * What the tutor is told about the gaps.
 *
 * The instruction is deliberately narrow: ask about the subject in front of
 * you, once, when it is relevant. A tutor that opens every answer with a
 * request to go and configure something is a tutor people stop opening.
 */
export function setupPrompt(setup: SubjectSetup[]): string {
  if (setup.length === 0) return "";

  const missing = needsSetup(setup);
  if (missing.length === 0) {
    return [
      "Every subject has both a place to look things up and a deck to test on.",
      "When you cannot answer something, or when they want to test themselves, name the one for that",
      "subject and tell them the buttons for it are under this chat.",
    ].join("\n");
  }

  const describe = (subject: SubjectSetup) => {
    const gaps: string[] = [];
    if (!subject.lookUp) gaps.push("somewhere to look things up (e.g. their Save My Exams page for it)");
    if (!subject.deck) gaps.push("a flashcard deck (e.g. a Carousel Learning deck)");
    return `- ${subject.name}: still needs ${gaps.join(" and ")}`;
  };

  return [
    "These subjects have not had their revision links set up yet:",
    ...missing.map(describe),
    "",
    "If the student is working on one of those subjects AND you cannot answer their question properly, or",
    "they ask to test themselves, then ask them once for that subject's link: tell them to open the page",
    'in their own account, copy the address, and paste it into "Where you revise from" on the School page.',
    "Ask about the subject in front of you only, and only when it is relevant — do not open unrelated",
    "answers by telling them to go and configure something. Never invent a link or guess an address.",
  ].join("\n");
}
