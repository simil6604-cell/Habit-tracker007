import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider } from "./provider";
import { recordAIFailure, recordAISuccess } from "./health";

const DEFAULT_MODEL = "claude-sonnet-5";

function friendlyAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    // Wording stays host-agnostic: this message is shown to someone whose app
    // may be running on Render, not next to a .env file they can open.
    if (err.status === 401) return "the API key was rejected as invalid — re-paste ANTHROPIC_API_KEY where your app's environment variables are set";
    if (err.status === 403) return "the API key was refused (403) — it may be disabled, or restricted to a different workspace";
    if (err.status === 429) return "the AI service is rate-limited or out of credit right now — check your Anthropic account's usage and billing";
    if (err.status && err.status >= 500) return "the AI service is temporarily unavailable — this one is at their end, try again shortly";
    return `the AI service returned an error (${err.status ?? "unknown"})`;
  }
  return err instanceof Error ? err.message : "the AI service could not be reached";
}

export type ProviderImage = { base64: string; mediaType: ImageMediaType };

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

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  }

  async generate(prompt: string, context: Record<string, unknown> = {}): Promise<string> {
    const system = typeof context.system === "string" ? context.system : undefined;
    const maxTokens = typeof context.maxTokens === "number" ? context.maxTokens : 1024;
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

    let message;
    try {
      message = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content }],
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
