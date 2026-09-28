import { parseRevisionUrl, revisionHost } from "@/lib/utils/revision-url";

/**
 * Revision pages and decks you work from, recognised by their address.
 *
 * This app stores links and never fetches them. Save My Exams is a paid
 * product and a Carousel deck belongs to whoever made it; copying either into
 * this app would be taking someone else's work, and the school AI is told
 * plainly that it has not read what is behind these links.
 *
 * What the two are, from their own screens rather than from reading their
 * sites — both are blocked by this environment's network proxy, so nothing
 * here was scraped or inferred from their markup:
 *
 *  - Carousel Learning: decks of question-and-answer cards, often set by a
 *    teacher, revised by self-marking each card Wrong / Nearly right / Right
 *    with the deck split into "learned" and "coming up". A deck to revise
 *    lives at /quiz/<id>/revise.
 *  - Save My Exams: revision notes, topic questions, past papers and a
 *    "target test" aimed at weak spots, organised by board, subject and topic.
 */

export type RevisionKind = "FLASHCARDS" | "NOTES" | "QUESTIONS" | "PAST_PAPERS" | "OTHER";

export const REVISION_KINDS: { value: RevisionKind; label: string; hint: string }[] = [
  { value: "FLASHCARDS", label: "Flashcards", hint: "A deck to test yourself on — a Carousel quiz, for instance" },
  { value: "NOTES", label: "Revision notes", hint: "The page you read from" },
  { value: "QUESTIONS", label: "Topic questions", hint: "Practice questions for one topic" },
  { value: "PAST_PAPERS", label: "Past papers", hint: "Whole papers to sit" },
  { value: "OTHER", label: "Something else", hint: "Anything else you revise from" },
];

export const CAROUSEL_HOSTS = ["carousel-learning.com", "app.carousel-learning.com"];
export const SAVE_MY_EXAMS_HOSTS = ["savemyexams.com", "www.savemyexams.com", "www.savemyexams.co.uk", "savemyexams.co.uk"];

/** The service behind a link, in the words a person would use for it. */
export function detectProvider(url: string): string | null {
  const host = revisionHost(url);
  if (!host) return null;
  if (CAROUSEL_HOSTS.includes(host) || host.endsWith(".carousel-learning.com")) return "Carousel Learning";
  if (SAVE_MY_EXAMS_HOSTS.includes(host) || host.endsWith(".savemyexams.com") || host.endsWith(".savemyexams.co.uk")) {
    return "Save My Exams";
  }
  return host;
}

/**
 * What a link is for, guessed from its shape so the form starts on the right
 * answer.
 *
 * A guess, and only ever a default: the picker is right there and whatever
 * the person chooses wins. Guessing wrong and then overriding what they
 * picked would be worse than not guessing at all.
 */
export function detectKind(url: string): RevisionKind {
  const parsed = parseRevisionUrl(url);
  if (!parsed) return "OTHER";
  const host = revisionHost(parsed) ?? "";
  const path = (() => {
    try {
      return new URL(parsed).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();

  if (host.endsWith("carousel-learning.com")) return "FLASHCARDS";
  if (path.includes("past-paper")) return "PAST_PAPERS";
  if (path.includes("topic-question") || path.includes("exam-question") || path.includes("questions")) {
    return "QUESTIONS";
  }
  if (path.includes("revision-note") || path.includes("notes")) return "NOTES";
  if (path.includes("flashcard") || path.includes("deck") || path.includes("quiz")) return "FLASHCARDS";
  return "OTHER";
}

export const MAX_LINK_TITLE = 60;

/**
 * A ceiling on saved links.
 *
 * Lives here rather than beside the action that enforces it because every
 * export of a `"use server"` file must be an async function — a plain
 * constant there fails the build, which is how this was found.
 */
export const MAX_REVISION_LINKS = 60;

export type ParsedLink = { title: string; url: string; kind: RevisionKind };
export type LinkResult = { ok: true; value: ParsedLink } | { ok: false; error: string };

export function parseLinkInput(input: { title: unknown; url: unknown; kind: unknown }): LinkResult {
  const url = parseRevisionUrl(String(input.url ?? ""));
  // parseRevisionUrl already refuses javascript: and data:, which is the whole
  // reason this goes through it: the value ends up in an href.
  if (!url) return { ok: false, error: "Paste a full link starting with https://" };

  const rawKind = String(input.kind ?? "");
  const kind = REVISION_KINDS.some((k) => k.value === rawKind) ? (rawKind as RevisionKind) : detectKind(url);

  let title = String(input.title ?? "").trim().replace(/\s+/g, " ");
  if (title.length > MAX_LINK_TITLE) return { ok: false, error: `Keep the name under ${MAX_LINK_TITLE} characters.` };
  // An empty name becomes the service it points at, so a saved link always
  // reads as something rather than as a bare URL.
  if (!title) title = detectProvider(url) ?? "Revision link";

  return { ok: true, value: { title, url, kind } };
}

export type StoredLink = {
  id: string;
  title: string;
  url: string;
  kind: string;
  subjectId: string | null;
  topicId: string | null;
};

/** The flashcard decks, which is what "when I need flashcards" means. */
export function flashcardDecks(links: StoredLink[]): StoredLink[] {
  return links.filter((link) => link.kind === "FLASHCARDS");
}

export type LinkScope = { subjectId?: string | null; topicId?: string | null };

/**
 * The most specific saved link of one kind.
 *
 * Specificity beats recency, in this order: a link on THIS topic, then one on
 * the subject, then one attached to neither — a link saved as "my Biology
 * deck" with no topic is still the right answer on a topic that has none of
 * its own.
 *
 * Within a tier the first wins, and the query hands these over newest-first,
 * so what comes back is the most recent link of the most specific kind.
 */
export function bestLink(links: StoredLink[], kind: RevisionKind, scope: LinkScope): StoredLink | null {
  const ofKind = links.filter((link) => link.kind === kind);
  if (ofKind.length === 0) return null;

  if (scope.topicId) {
    const onTopic = ofKind.find((link) => link.topicId === scope.topicId);
    if (onTopic) return onTopic;
  }
  if (scope.subjectId) {
    // A link on the right subject but pinned to a DIFFERENT topic is not this
    // topic's link, so it is skipped rather than offered as one.
    const onSubject = ofKind.find(
      (link) => link.subjectId === scope.subjectId && (link.topicId === null || link.topicId === scope.topicId)
    );
    if (onSubject) return onSubject;
  }
  return ofKind.find((link) => link.subjectId === null && link.topicId === null) ?? null;
}

/** Kinds that answer "I don't know this", best first. */
const LOOK_UP_ORDER: RevisionKind[] = ["NOTES", "QUESTIONS", "PAST_PAPERS", "OTHER"];

/**
 * The two links worth putting in front of someone who is stuck: somewhere to
 * read it up, and somewhere to test themselves.
 *
 * Rendered by the app from the stored URL rather than typed by the model into
 * its answer. A link is either exactly right or useless, and a model asked to
 * reproduce a UUID will eventually get one character wrong — at which point
 * the student taps a broken link and blames their own deck.
 */
export function stuckLinks(
  links: StoredLink[],
  scope: LinkScope = {}
): { lookUp: StoredLink | null; testYourself: StoredLink | null } {
  let lookUp: StoredLink | null = null;
  for (const kind of LOOK_UP_ORDER) {
    lookUp = bestLink(links, kind, scope);
    if (lookUp) break;
  }
  return { lookUp, testYourself: bestLink(links, "FLASHCARDS", scope) };
}

/**
 * The lines the school AI is given about these links.
 *
 * Deliberately says the app has not opened them. Without that the model will
 * happily summarise "your Save My Exams notes on osmosis", which it has never
 * seen — the most convincing kind of wrong answer this app could produce.
 */
export function revisionLinksPrompt(
  links: { title: string; url: string; kind: string; subjectName?: string | null; topicName?: string | null }[]
): string {
  if (links.length === 0) {
    return [
      "This student has not saved any revision links yet.",
      'If they ask for flashcards, say they can save a Carousel Learning deck under a subject in School and it will be one tap away — do not invent a link to one.',
    ].join("\n");
  }

  const describe = (link: (typeof links)[number]) => {
    const where = link.topicName ?? link.subjectName;
    return `- ${link.title}${where ? ` (${where})` : ""} — ${link.kind.toLowerCase().replace(/_/g, " ")}: ${link.url}`;
  };

  return [
    "Revision pages and decks this student has saved. You have NOT read any of them — this app stores the",
    "address only and never opens the page. Never summarise, quote or claim to know what is on one. You may",
    "tell them which one to go to, by name.",
    ...links.map(describe),
    "",
    "When they ask for flashcards or want to test themselves, point them at their own flashcard deck above",
    "rather than writing cards into the chat. Only if they have no deck saved should you offer to make cards",
    "inside this app instead.",
  ].join("\n");
}
