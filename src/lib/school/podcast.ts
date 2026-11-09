/**
 * Something to listen to, made out of your own notes.
 *
 * Asked for next to the flashcards: when there is no time to read, hear it
 * instead. Everything here is pure — what gets spoken, in what pieces, and
 * how long that takes. The action fetches the material and asks Claude; the
 * page plays it.
 */

/** Spoken at a steady, explaining pace rather than a newsreader's. */
export const WORDS_PER_MINUTE = 140;

export const MIN_SCRIPT_CHARS = 120;
export const MAX_SCRIPT_CHARS = 12_000;
export const MAX_TITLE = 80;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function estimateSeconds(script: string): number {
  return Math.max(1, Math.round((wordCount(script) / WORDS_PER_MINUTE) * 60));
}

export function formatLength(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `${rest} sec`;
  return `${minutes} min${rest >= 30 ? " 30 sec" : ""}`;
}

/**
 * The script cut into the pieces that get spoken one at a time.
 *
 * One request per piece, not one for the whole thing: the first sentence
 * starts playing while the rest is still being made, which is the
 * difference between pressing play and waiting. Sentences are grouped up to
 * a comfortable length so it is not one network round trip per clause.
 */
export const MAX_PIECE_CHARS = 420;

export function splitIntoPieces(script: string, limit: number = MAX_PIECE_CHARS): string[] {
  // Split after . ! ? — and after a line break, which is how a paragraph
  // break arrives and is a real pause.
  const sentences = script
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const pieces: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
    } else if (`${current} ${sentence}`.length <= limit) {
      current = `${current} ${sentence}`;
    } else {
      pieces.push(current);
      current = sentence;
    }
    // A single sentence longer than the limit is still one piece: cutting a
    // sentence in half mid-clause is worse to listen to than a long one.
    if (current.length >= limit) {
      pieces.push(current);
      current = "";
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * Strips anything a synthesiser would read out as punctuation.
 *
 * Claude is told not to write markdown here, and mostly does not; one stray
 * asterisk read aloud as "asterisk" is enough to spoil a whole episode, so
 * it is taken out rather than trusted.
 */
export function cleanScript(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_{1,2}(.+?)_{1,2}/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ScriptResult = { ok: true; script: string; seconds: number } | { ok: false; error: string };

export function parseScript(raw: string): ScriptResult {
  const script = cleanScript(raw).slice(0, MAX_SCRIPT_CHARS);
  if (script.length < MIN_SCRIPT_CHARS) {
    return {
      ok: false,
      error: "The episode came back too short to be worth listening to. Try again, or add more material first.",
    };
  }
  return { ok: true, script, seconds: estimateSeconds(script) };
}

export function episodeTitle(raw: string, fallback: string): string {
  const title = cleanScript(raw).split("\n")[0]?.trim() ?? "";
  if (!title || title.length > MAX_TITLE) return fallback;
  return title;
}

/** How much material there is, so the page can say when there is none. */
export type PodcastSource = {
  subjectId: string;
  subjectName: string;
  topics: string[];
  flashcards: number;
  notes: number;
  confusions: number;
};

export function hasMaterial(source: PodcastSource): boolean {
  return source.topics.length > 0 || source.flashcards > 0 || source.notes > 0 || source.confusions > 0;
}

export function describeSource(source: PodcastSource): string {
  const parts: string[] = [];
  if (source.topics.length > 0) parts.push(source.topics.slice(0, 4).join(", "));
  if (source.flashcards > 0) parts.push(`${source.flashcards} flashcard${source.flashcards === 1 ? "" : "s"}`);
  if (source.notes > 0) parts.push(`${source.notes} note${source.notes === 1 ? "" : "s"}`);
  if (source.confusions > 0) parts.push(`${source.confusions} thing${source.confusions === 1 ? "" : "s"} you flagged`);
  return parts.length > 0 ? `${source.subjectName} · ${parts.join(" · ")}` : source.subjectName;
}
