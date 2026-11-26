/**
 * Which Claude this app talks to, and how hard it is asked to think.
 *
 * In one place because the model name was written out twice — once in the
 * provider that sends the request and once in the diagnostics page that
 * reports what was sent. Two copies of a string like that drift, and the
 * failure is the worst kind: a Settings page confidently naming a model the
 * app is not using.
 *
 * All of it is overridable from the environment, because the right answer
 * depends on whose credit is being spent and that is not a decision this
 * file gets to make for them.
 */

/**
 * Claude Opus 5.5.
 *
 * This app is a tutor. The thing it is for is explaining economics and
 * biology to someone who did not understand it the first time, and that is
 * exactly the kind of work the difference between models shows up in. The
 * previous default was Claude Sonnet 5, a generation behind; ANTHROPIC_MODEL
 * takes anything else, and `claude-sonnet-5-5` is the current Sonnet at
 * roughly half the price per token.
 */
export const DEFAULT_MODEL = "claude-opus-5-5";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/**
 * How much thinking to do before answering.
 *
 * Set rather than left out: on this model the default is "medium", and an
 * unstated default is one that changes under you when the model does.
 * "high" costs more and is worth it for a hard question; ANTHROPIC_EFFORT
 * moves it either way.
 */
export const DEFAULT_EFFORT: Effort = "medium";

/**
 * How long a reply may be.
 *
 * Only what is actually produced is charged, so a generous ceiling costs
 * nothing on a short answer and prevents a long one being cut off mid
 * sentence. 1024 was the old default and it is about 700 words — enough for
 * a chat reply and not enough for ten quiz questions as JSON, which is what
 * several of the callers that pass no limit of their own are asking for.
 */
export const DEFAULT_MAX_TOKENS = 4_000;

/**
 * The least room a request that can call tools is given.
 *
 * max_tokens is not "how long may the answer be". Thinking is counted
 * against it too, and so is every tool call the model writes on the way to
 * the answer — so a ceiling chosen by eye for the size of a reply can be
 * spent entirely before a single word is written. That is not a theory: the
 * school chat asked for 3,000, which was fine when it had six tools and a
 * short prompt, and started coming back as "couldn't reach the AI service"
 * the week it was given the timetable, the plans and two more tools.
 *
 * Only what is produced is charged, so a floor costs nothing on a short
 * answer. A caller's own number still wins when it is larger.
 */
export const TOOL_CALL_FLOOR = 8_000;

/**
 * How far a cut-off reply is stretched before giving up. One retry only:
 * twice in a row is not a limit slightly too low, it is a question this is
 * not going to answer, and a third paid attempt helps nobody.
 */
export const STRETCH_FACTOR = 3;

/**
 * The most this app may ask for in one non-streamed reply.
 *
 * Not a preference — a hard edge. The SDK refuses to send a non-streaming
 * request whose max_tokens implies more than ten minutes of generation, at
 * 128,000 tokens an hour: anything over 21,333 throws "Streaming is
 * required for operations that may take longer than 10 minutes" before a
 * byte leaves the machine, which surfaces in the app as the AI being
 * unreachable. Found by raising a ceiling and watching the retry fail that
 * way rather than on the wire.
 *
 * So every ceiling is clamped here, and the number sits below the edge
 * rather than on it. The longest thing this app asks for is a twenty-minute
 * podcast at 18,000, which fits. A caller that genuinely needs more would
 * need the provider to stream instead, which is a different change.
 */
export const MAX_OUTPUT_TOKENS = 20_000;

export function anthropicModel(env: Record<string, string | undefined> = process.env): string {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Anything that is not one of the five levels falls back rather than being
 * sent: the API refuses an unknown level with a 400, and a typo in an
 * environment variable would take every AI feature in the app down at once
 * with an error that names none of this.
 */
export function anthropicEffort(env: Record<string, string | undefined> = process.env): Effort {
  const raw = env.ANTHROPIC_EFFORT?.trim().toLowerCase();
  return EFFORTS.includes(raw as Effort) ? (raw as Effort) : DEFAULT_EFFORT;
}
