import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider } from "./provider";
import { recordAIFailure, recordAISuccess } from "./health";
import { describeKeyShape, inspectApiKey } from "./api-key";
import { anthropicEffort, anthropicModel, DEFAULT_MAX_TOKENS, type Effort } from "./model-config";

function friendlyAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    // Wording stays host-agnostic: this message is shown to someone whose app
    // may be running on Render, not next to a .env file they can open.
    if (err.status === 401) {
      // The shape goes with it: a 401 is most often a key that arrived in
      // pieces, and "re-paste it" is advice someone has usually just followed.
      return `the API key was rejected as invalid (${describeKeyShape(process.env.ANTHROPIC_API_KEY)}). Re-paste ANTHROPIC_API_KEY where your app's environment variables are set, or make a new key if it is complete and still refused`;
    }
    if (err.status === 403) return "the API key was refused (403) — it may be disabled, or restricted to a different workspace";
    if (err.status === 429) return "the AI service is rate-limited or out of credit right now — check your Anthropic account's usage and billing";
    if (err.status && err.status >= 500) return "the AI service is temporarily unavailable — this one is at their end, try again shortly";
    return `the AI service returned an error (${err.status ?? "unknown"})`;
  }
  return err instanceof Error ? err.message : "the AI service could not be reached";
}

export type ProviderImage = { base64: string; mediaType: ImageMediaType };

/**
 * One turn of a real conversation, as the Messages API wants it.
 *
 * The school AI used to flatten its history into a single user message with
 * "Student:" and "Tutor:" written in front of each line. That is the shape
 * you use when the API only takes one string, and this one does not: it
 * takes a list of turns, and told which words were its own, Claude follows a
 * thread far better than it does reading a transcript of itself.
 */
export type ProviderTurn = { role: "user" | "assistant"; content: string };

function collectTurns(context: Record<string, unknown>): ProviderTurn[] {
  if (!Array.isArray(context.turns)) return [];
  const turns: ProviderTurn[] = [];
  for (const entry of context.turns) {
    if (!entry || typeof entry !== "object") continue;
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const text = content.trim();
    if (!text) continue;
    // Two of the same role in a row are legal, but a leading assistant turn
    // is not: the API refuses a conversation that does not start with the
    // person. A history that has been trimmed can easily begin that way.
    if (turns.length === 0 && role === "assistant") continue;
    turns.push({ role, content: text });
  }
  return turns;
}

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const MEDIA_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function asMediaType(value: unknown): ImageMediaType {
  return MEDIA_TYPES.includes(value as ImageMediaType) ? (value as ImageMediaType) : "image/jpeg";
}

/**
 * Both shapes a caller can attach pictures in: `imageBase64`/`imageMediaType`
 * for a single one, or `images` for several.
 *
 * The single-image form came first and a dozen call sites still use it, so it
 * keeps working exactly as before; asking a question about six photos of the
 * same worksheet needs the plural one. Anything malformed is dropped rather
 * than sent — a half-built image block is rejected by the API with an error
 * that says nothing about which caller built it.
 */
export function collectImages(context: Record<string, unknown>): ProviderImage[] {
  const images: ProviderImage[] = [];

  if (typeof context.imageBase64 === "string" && context.imageBase64) {
    images.push({ base64: context.imageBase64, mediaType: asMediaType(context.imageMediaType) });
  }

  if (Array.isArray(context.images)) {
    for (const entry of context.images) {
      if (!entry || typeof entry !== "object") continue;
      const { base64, mediaType } = entry as { base64?: unknown; mediaType?: unknown };
      if (typeof base64 !== "string" || !base64) continue;
      images.push({ base64, mediaType: asMediaType(mediaType) });
    }
  }

  return images;
}

export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  private client: Anthropic;
  private model: string;
  private effort: Effort;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = anthropicModel();
    this.effort = anthropicEffort();
  }

  async generate(prompt: string, context: Record<string, unknown> = {}): Promise<string> {
    /*
     * Checked before the request, not after it fails. A key with a lookalike
     * character in it never reaches the API at all: the SDK puts it in an HTTP
     * header, headers are Latin-1 only, and what surfaces in the chat is
     * "Cannot convert argument to a ByteString because the character at index
     * 7 has a value of 1072" — which names no key and reads like a bug in this
     * app. Saying it plainly here is the difference between a fixable problem
     * and an evening lost.
     */
    const keyProblem = inspectApiKey(process.env.ANTHROPIC_API_KEY);
    if (keyProblem) {
      recordAIFailure(keyProblem.problem);
      throw new Error(`${keyProblem.problem} ${keyProblem.fix}`);
    }

    const systemText = typeof context.system === "string" ? context.system : undefined;
    const maxTokens = typeof context.maxTokens === "number" ? context.maxTokens : DEFAULT_MAX_TOKENS;
    const images = collectImages(context);

    const content: Anthropic.MessageParam["content"] =
      images.length > 0
        ? [
            ...images.map(
              (image): Anthropic.ImageBlockParam => ({
                type: "image",
                source: { type: "base64", media_type: image.mediaType, data: image.base64 },
              })
            ),
            { type: "text", text: prompt },
          ]
        : prompt;

    // The earlier turns, then this one. Everything that passes no turns is
    // unchanged: one user message, exactly as before.
    const messages: Anthropic.MessageParam[] = [
      ...collectTurns(context),
      { role: "user", content },
    ];

    /*
     * The system prompt is marked cacheable.
     *
     * It is the long, unchanging half of every request — which syllabus,
     * which subjects, what is due — repeated on every message of a
     * conversation. Cached, the repeat costs about a tenth as much and comes
     * back sooner. Nothing else is marked: the question changes every time,
     * and a breakpoint after something volatile caches nothing.
     *
     * A prefix shorter than the model's minimum simply is not cached. That
     * is not an error and needs no handling here.
     */
    const system: Anthropic.MessageCreateParams["system"] = systemText
      ? [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }]
      : undefined;

    let message;
    try {
      message = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        // Thinking is always on and cannot be switched off on this model;
        // effort is the dial, and it is set rather than left to a default
        // that moves when the model does.
        output_config: { effort: this.effort },
        system,
        messages,
      });
    } catch (err) {
      const message = friendlyAnthropicError(err);
      recordAIFailure(message);
      throw new Error(message);
    }

    // Join every text block rather than taking the first: a reply can arrive
    // as several, and non-text blocks (thinking, tool use) sit among them.
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) {
      // No text at all usually means the reply was cut off before any was
      // produced — worth saying, because the fix is a bigger max_tokens, not
      // a retry. Naming the limit makes that diagnosable from the message.
      if (message.stop_reason === "max_tokens") {
        // A truncated reply means the connection is fine, so it isn't recorded
        // as an outage — the fix is a bigger limit, not a key.
        throw new Error(
          `The AI's reply was cut off before it produced any text (max_tokens ${maxTokens}). Ask for something shorter, or raise the limit for this feature.`
        );
      }
      throw new Error(`The AI service returned no text (stop reason: ${message.stop_reason ?? "unknown"}).`);
    }
    recordAISuccess();
    return text;
  }
}
