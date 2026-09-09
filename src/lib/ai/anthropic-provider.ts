import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider } from "./provider";

const DEFAULT_MODEL = "claude-sonnet-5";

function friendlyAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 401) return "The configured ANTHROPIC_API_KEY is invalid — check it in your .env.";
    if (err.status === 429) return "The AI service is rate-limited right now — try again shortly.";
    if (err.status && err.status >= 500) return "The AI service is temporarily unavailable — try again shortly.";
    return `The AI service returned an error (${err.status ?? "unknown"}).`;
  }
  return err instanceof Error ? err.message : "Couldn't reach the AI service.";
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
    const imageBase64 = typeof context.imageBase64 === "string" ? context.imageBase64 : undefined;
    const imageMediaType =
      typeof context.imageMediaType === "string"
        ? (context.imageMediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp")
        : "image/jpeg";

    const content: Anthropic.MessageParam["content"] = imageBase64
      ? [
          { type: "image", source: { type: "base64", media_type: imageMediaType, data: imageBase64 } },
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
      throw new Error(friendlyAnthropicError(err));
    }

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("The AI service returned an empty response.");
    }
    return textBlock.text;
  }
}
