/**
 * What changes when the answer is going to be spoken out loud.
 *
 * The same reply is good writing and bad speech. Everything these two AIs
 * normally produce is shaped for the eye — headings, bullet lists, bold, a
 * numbered plan, sometimes a diagram — and read aloud that becomes "asterisk
 * asterisk Economics asterisk asterisk, one dot" or forty seconds of list with
 * nowhere to interrupt. Spoken, a person wants a sentence or two, in the
 * register someone actually talks in, and then a turn of their own.
 *
 * So voice is not a button that reads the written answer out: it asks for a
 * different answer, and cleans what comes back before the browser speaks it.
 */

/**
 * Appended to whichever system prompt is already in force, rather than
 * replacing it: who the student is, which syllabus they are on and what the
 * app knows about their week all still apply. Only the shape of the reply
 * changes.
 */
export const SPOKEN_STYLE = `
YOU ARE BEING SPOKEN ALOUD. Your reply goes straight to a speech synthesiser, so:

- Talk the way a person talks. Contractions, short sentences, no preamble.
- Two or three sentences. If the full answer is longer than that, give the part that matters now and offer the rest — "want me to go through the rest?"
- NO markdown of any kind: no asterisks, no hashes, no bullet points, no numbered lists, no code blocks, no diagrams. They are read out character by character and ruin the answer.
- No headings, no "Here are three things". If you need to list, say them in a sentence: "two things — first X, then Y".
- Numbers and symbols as you would say them: "about sixty per cent", not "~60%".
- End with a question or an opening, so it stays a conversation rather than a lecture. One question, not three.
- If you did not catch what was said, say so and ask — do not guess at length.`;

/**
 * How it opens when voice is switched on.
 *
 * Varied rather than one fixed line, because the same greeting every time is
 * the thing that makes a voice assistant feel like a machine. Picked from a
 * seed instead of at random so a test can say which one it got.
 */
const COACH_GREETINGS = [
  "Hey — what's up?",
  "I'm listening. What do you need?",
  "Go on, what's on your mind?",
  "Right, what are we doing?",
  "Hey. What do you want to sort out?",
];

const TUTOR_GREETINGS = [
  "Hey — what are we working on?",
  "I'm listening. What's the topic?",
  "Go on, what are you stuck on?",
  "Right, what shall we look at?",
  "Hey. What do you want to go through?",
];

export type VoiceWho = "coach" | "tutor";

export function spokenGreeting(who: VoiceWho, seed: number = Date.now()): string {
  const list = who === "tutor" ? TUTOR_GREETINGS : COACH_GREETINGS;
  // Floor and modulo on a non-negative index: a negative seed would land
  // outside the list and hand the speech synthesiser `undefined`.
  const index = Math.abs(Math.floor(seed)) % list.length;
  return list[index];
}

/**
 * What the browser should actually say.
 *
 * Belt and braces next to the prompt above: a model asked for plain speech
 * still slips in a bullet or a bold word now and then, and one stray asterisk
 * read out as "asterisk" is enough to make the whole thing sound broken.
 *
 * Diagrams and code go entirely rather than being flattened — there is no
 * useful way to say an SVG out loud, and reading the alternative text of a
 * drawing nobody can see is worse than skipping it.
 */
export function toSpokenText(content: string): string {
  return (
    content
      // Fenced blocks first, while their fences are still intact.
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]*)`/g, "$1")
      // Images before links: an image is a link with a bang, and doing links
      // first leaves a stray "!" to be read out.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Headings, quotes and list markers at the start of a line.
      .replace(/^\s{0,3}#{1,6}\s*/gm, "")
      .replace(/^\s{0,3}>\s?/gm, "")
      .replace(/^\s*[-*+]\s+/gm, "")
      .replace(/^\s*\d+[.)]\s+/gm, "")
      // Emphasis markers, keeping the words inside them.
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/(^|[\s(])_([^_]+)_(?=[\s.,!?)]|$)/g, "$1$2")
      // A rule is a pause on the page and nothing at all in speech.
      .replace(/^\s*([-*_])\s*(\1\s*){2,}$/gm, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}
