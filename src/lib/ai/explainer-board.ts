/**
 * Turning a spoken answer into something that looks like it was explained on
 * a board.
 *
 * Asked for directly: when you talk to the school AI, it should explain the
 * way the good explainer videos do — a picture that changes while the voice
 * talks, not a wall of words after the fact.
 *
 * The app could already draw: the tutor writes ```svg blocks and they are
 * sanitised and rendered inline. What it could not do was tie a drawing to
 * what was being said, and voice mode actively forbade pictures, because an
 * SVG read out loud is forty seconds of coordinates.
 *
 * So a spoken reply is now a sequence: a sentence or two, then the picture
 * for it, then the next sentence, then its picture. This splits that back
 * apart, and the pairing is positional — the text before a drawing belongs to
 * that drawing. No new syntax to get wrong: the caption is the SVG's own
 * <title>, which the sanitiser already allows and the inline renderer already
 * ignores, so the same reply still reads correctly as written text.
 */

export type ExplainerStep = {
  /** What is said out loud while this picture is up. May be empty. */
  say: string;
  /** The drawing for this step, exactly as written — null for a closing line. */
  svg: string | null;
  /** The step's heading, from the drawing's <title>. */
  caption: string | null;
};

/**
 * The <title> an SVG carries, as plain text.
 *
 * Entities are decoded because the model writes "&amp;" for an ampersand in
 * XML and a caption reading "Acid &amp; base" is worse than no caption. The
 * result is rendered as a React text node, never as markup.
 */
function captionOf(svg: string): string | null {
  const match = svg.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  const text = match[1]
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    // Last, or an "&amp;lt;" in the source would come out as a real "<".
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

/**
 * Splits a reply into the steps it was written as.
 *
 * A reply with no drawing in it comes back as one step with no picture, which
 * is the ordinary case and what the caller shows when there is no board.
 */
export function parseExplainerSteps(content: string): ExplainerStep[] {
  const steps: ExplainerStep[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Declared here rather than at module level, the same way the inline
  // renderer does it, so there is no shared lastIndex to think about.
  const regex = /```svg\n?([\s\S]*?)```/g;

  while ((match = regex.exec(content)) !== null) {
    const say = content.slice(lastIndex, match.index).trim();
    const svg = match[1].trim();
    steps.push({ say, svg, caption: captionOf(svg) });
    lastIndex = regex.lastIndex;
  }

  const tail = content.slice(lastIndex).trim();
  if (tail) steps.push({ say: tail, svg: null, caption: null });

  // Nothing matched at all: the whole reply is one spoken step.
  if (steps.length === 0) {
    const say = content.trim();
    return say ? [{ say, svg: null, caption: null }] : [];
  }

  return steps;
}

/** Does this reply have anything to put on the board? */
export function hasBoard(steps: ExplainerStep[]): boolean {
  return steps.some((step) => step.svg !== null);
}

/**
 * What to say for a step.
 *
 * A picture with no sentence in front of it would otherwise flash past in
 * silence, so the caption is said instead — reading the heading out is a
 * worse explanation than the model's own sentence, but a far better one than
 * nothing.
 */
export function stepSpeech(step: ExplainerStep): string {
  return step.say || step.caption || "";
}

/**
 * Which picture belongs on screen while piece `index` is being spoken.
 *
 * The last reply usually ends on a line with no drawing — the question that
 * keeps it a conversation. Blanking the board for that would take the picture
 * away at exactly the moment they are being asked about it, so the drawing
 * stays up until another one replaces it.
 *
 * Returns the index into `steps`, or null when nothing has been drawn yet.
 */
export function pictureIndexAt(steps: ExplainerStep[], index: number): number | null {
  let found: number | null = null;
  for (let i = 0; i <= index && i < steps.length; i++) {
    if (steps[i].svg !== null) found = i;
  }
  // Before the first drawing there is nothing to hold over, so fall forward to
  // it rather than showing an empty board while the opening line is spoken.
  if (found === null) {
    const next = steps.findIndex((step) => step.svg !== null);
    return next === -1 ? null : next;
  }
  return found;
}

const MAX_QUERY = 120;

/**
 * A YouTube search for what is on the board.
 *
 * Deliberately a search and not a video. A model asked for a link invents an
 * id that looks exactly like a real one, and a confident link to a video that
 * does not exist is worse than no link — a search for the topic always lands
 * somewhere real.
 */
export function youtubeSearchUrl(topic: string): string | null {
  const query = topic.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
  if (!query) return null;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
