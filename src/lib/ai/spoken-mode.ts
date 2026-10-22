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
 * The speech rules themselves, shared by both voice modes.
 *
 * Appended to whichever system prompt is already in force, rather than
 * replacing it: who the student is, which syllabus they are on and what the
 * app knows about their week all still apply. Only the shape of the reply
 * changes.
 */
const SPEECH_RULES = `
YOU ARE BEING SPOKEN ALOUD. Your reply goes straight to a speech synthesiser, so:

- Talk the way a person talks. Contractions, short sentences, no preamble.
- Two or three sentences. If the full answer is longer than that, give the part that matters now and offer the rest — "want me to go through the rest?"
- NO markdown in anything you say: no asterisks, no hashes, no bullet points, no numbered lists. They are read out character by character and ruin the answer.
- No headings, no "Here are three things". If you need to list, say them in a sentence: "two things — first X, then Y".
- Numbers and symbols as you would say them: "about sixty per cent", not "~60%".
- End with a question or an opening, so it stays a conversation rather than a lecture. One question, not three.
- If you did not catch what was said, say so and ask — do not guess at length.`;

/** Voice with nothing on screen: the words are the whole reply. */
export const SPOKEN_STYLE = `${SPEECH_RULES}
- No code blocks and no diagrams. There is nothing to show them on.`;

/**
 * Voice with a board to draw on.
 *
 * Asked for in these words: when I talk to it, it should explain like those
 * YouTube videos where they show it in images. So the reply is no longer only
 * speech — it is a few spoken beats, each with the picture for that beat, and
 * the app puts each picture up as its sentence is being said.
 *
 * The rules below are the ones that went wrong when this was first tried by
 * hand. Each picture must come straight after the sentence it belongs to, or
 * the pairing is nonsense. Every picture needs a <title>, because that is the
 * caption the board shows and a board of untitled drawings explains nothing.
 * And it must still be a conversation: a question explained in eight panels
 * is a lecture, and nothing at all gets drawn for "what shall we do today?".
 */
export const SPOKEN_BOARD_STYLE = `${SPEECH_RULES}

YOU ALSO HAVE A BOARD. They can see pictures while you talk, so when you are explaining something — a process, a structure, a shape, a proportion, how a formula is built, anything with parts or steps — explain it the way a good video does: a sentence, then the picture for that sentence.

- Write it strictly alternating: a sentence or two of speech, then its picture, then the next sentence or two, then its picture. The picture that follows a sentence is the one shown while that sentence is spoken, so they must match.
- Two to four pictures. Four is a lot. One good one beats three vague ones. This replaces any earlier
instruction to include at most one diagram: on the board a short series is the point.
- Each picture is a fenced block starting with \`\`\`svg and ending with \`\`\`, holding one <svg viewBox="0 0 320 220">.
- Every picture starts with a <title> of three to six words. That is the caption written under it, so it names what is being shown ("Two to one by moles"), not what the step is called ("Step 2").
- Basic shapes and text only: rect, circle, ellipse, line, polyline, polygon, path, text, g. Clear <text> labels, around 40 elements at most, no images, no scripts, no external references.
- Draw the thing, not decoration. Label the parts. Assume it is being looked at on a phone, so few words, large and spaced out.
- Do NOT draw for small talk, a yes or no, a correction, or a question about their week — those are just spoken. Most turns need no picture at all; a picture is for when you are explaining.
- The spoken sentences must stand on their own. Someone not looking at the screen still has to understand you, so never say "as you can see here" or "this one".`;

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
 * useful way to say an SVG out loud. With a board that is no longer a
 * fallback but the design: the pictures are meant to be looked at, and this
 * is what keeps them out of the spoken half.
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
