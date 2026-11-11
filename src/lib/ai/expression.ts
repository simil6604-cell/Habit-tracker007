/**
 * How much life the AI puts into it — as a setting, not a decision made for
 * you.
 *
 * Asked for in these words: I want to be able to ADJUST it, so it explains
 * and talks to me far more motivated. The right amount of energy is not
 * something this app can know. Someone revising at eleven at night after
 * training wants a different voice from someone who has twenty minutes
 * before an exam and needs pushing, and the same person wants both, on
 * different days.
 *
 * One preset changes three things at once, because expression is all three
 * and changing only one of them is what makes an assistant sound fake:
 *
 *   - the words — what it is told to say and how to say it
 *   - the voice — ElevenLabs' own expression dials, where a key is set
 *   - the delivery — how fast and how high the browser's voice reads
 *
 * Pure, so every preset can be checked without a browser or an API.
 */

export type ExpressionId = "CALM" | "WARM" | "MOTIVATING" | "HYPE";

export type Expression = {
  id: ExpressionId;
  /** What it is called in Settings. */
  label: string;
  /** One line saying when you would want it. */
  hint: string;
  /** Added to the spoken rules: how it talks out loud. */
  speech: string;
  /** Added to written answers, so the two do not feel like two people. */
  writing: string;
  /**
   * ElevenLabs' dials.
   *
   * Stability is badly named: high is flatter, not better. Lower lets the
   * model move pitch and pace the way a person does. Style pushes it
   * further towards performance. Below about 0.15 stability it starts
   * inventing accents, so nothing here goes there.
   */
  voice: { stability: number; style: number };
  /** The browser's own voice, which has only these two dials. */
  browser: { rate: number; pitch: number };
};

export const EXPRESSIONS: Expression[] = [
  {
    id: "CALM",
    label: "Calm",
    hint: "Steady and level. For late at night, or when you are already stressed.",
    speech:
      "Keep it calm and level. Unhurried, quiet, no exclamation and no cheerleading — the steadiness is the point. Leave room after a hard idea instead of filling it. Encouragement, when it comes, is one quiet sentence.",
    writing: "Keep the tone calm and unhurried. No exclamation marks, no cheerleading.",
    voice: { stability: 0.55, style: 0.2 },
    browser: { rate: 0.98, pitch: 1 },
  },
  {
    id: "WARM",
    label: "Warm",
    hint: "Friendly and human, the way a good tutor talks. The usual setting.",
    speech:
      "Warm and human. Talk the way someone does who likes teaching this and likes the person in front of them. React before you explain, notice what they got right, and keep it conversational.",
    writing: "Warm and human — like a tutor who likes teaching this.",
    voice: { stability: 0.35, style: 0.45 },
    browser: { rate: 1.06, pitch: 1.04 },
  },
  {
    id: "MOTIVATING",
    label: "Motivating",
    hint: "A coach. More energy, pushes you, makes a point of what you have cracked.",
    speech:
      "Bring real energy. You are their coach, not a textbook: short punchy sentences, pace, momentum. Name what they have actually cracked and make something of it — 'that is the bit everyone gets wrong and you just did it'. When something is hard, say it is hard and then say they can do it, with the reason you think so. Always end on the next move, something they can go and do right now. Never flattery, never empty: the push has to be about the specific thing in front of them.",
    writing:
      "Bring energy. Short, direct sentences. Name what they got right and why it matters, and end on the next thing to do.",
    voice: { stability: 0.25, style: 0.6 },
    browser: { rate: 1.1, pitch: 1.07 },
  },
  {
    id: "HYPE",
    label: "Full throttle",
    hint: "Maximum energy, like a trainer in your ear. For when you need dragging into it.",
    speech:
      "Maximum energy, like a trainer in their ear on the last set. Short, hard, fast. Big reactions — 'yes, THAT is it', 'no, stop, look at this again'. Make the thing they are learning sound like the most interesting thing you have explained all week, because to them it has to be. Celebrate loudly when they get it. Still never flattery: every bit of it is about what they actually just did, and you still correct a wrong answer immediately and plainly.",
    writing:
      "Maximum energy. Short, hard, fast sentences. Big, specific reactions to what they got right — and correct what is wrong immediately and plainly.",
    voice: { stability: 0.18, style: 0.75 },
    browser: { rate: 1.14, pitch: 1.1 },
  },
];

export const DEFAULT_EXPRESSION: ExpressionId = "WARM";

export function isExpressionId(value: unknown): value is ExpressionId {
  return typeof value === "string" && EXPRESSIONS.some((style) => style.id === value);
}

/** The preset for a stored value, falling back rather than throwing. */
export function expressionFor(value: unknown): Expression {
  const id = isExpressionId(value) ? value : DEFAULT_EXPRESSION;
  return EXPRESSIONS.find((style) => style.id === id)!;
}

/** The line appended to a spoken prompt. Named so the prompt reads as instructions. */
export function speechDirection(value: unknown): string {
  return `HOW TO SOUND (this is set by the student, and it is what they asked for):\n${expressionFor(value).speech}`;
}

export function writingDirection(value: unknown): string {
  return `Tone, set by the student: ${expressionFor(value).writing}`;
}
