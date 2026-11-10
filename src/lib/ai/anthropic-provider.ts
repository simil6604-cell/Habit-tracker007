import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider } from "./provider";
import { recordAIFailure, recordAISuccess } from "./health";
import { describeKeyShape, inspectApiKey } from "./api-key";
import { anthropicEffort, anthropicModel, DEFAULT_MAX_TOKENS, type Effort } from "./model-config";
import {
  collectTools,
  MAX_TOOL_ROUNDS,
  parseToolInput,
  toolDefinitions,
  type ProviderTool,
} from "./tool-use";

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

/**
 * A PDF sent along with the question.
 *
 * Worth its own block type rather than being turned into text first: the
 * model reads the pages, so a past paper keeps its diagrams, its mark
 * allocations and its layout, all of which are the thing being asked about.
 */
export type ProviderDocument = { base64: string; title?: string };

export function collectDocuments(context: Record<string, unknown>): ProviderDocument[] {
  if (!Array.isArray(context.documents)) return [];
  const documents: ProviderDocument[] = [];
  for (const entry of context.documents) {
    if (!entry || typeof entry !== "object") continue;
    const { base64, title } = entry as { base64?: unknown; title?: unknown };
    if (typeof base64 !== "string" || !base64) continue;
    documents.push({ base64, ...(typeof title === "string" && title ? { title } : {}) });
  }
  return documents;
}

/**
 * Runs one tool call and shapes the answer the model gets back.
 *
 * A tool that throws is reported as a failed tool, not as a failed request:
 * the model can read "no subject called Fysics" and try again with the right
 * name, which is the whole point of handing the failure back rather than
 * turning it into an error page.
 */
async function runTool(
  tools: ProviderTool[],
  call: Anthropic.ToolUseBlock
): Promise<Anthropic.ToolResultBlockParam> {
  const base = { type: "tool_result", tool_use_id: call.id } as const;
  const tool = tools.find((candidate) => candidate.name === call.name);
  if (!tool) {
    return { ...base, content: `There is no tool called ${call.name}.`, is_error: true };
  }
  // Always parsed, never read out of the raw text with a pattern.
  const input = parseToolInput(call.input);
  if (!input) {
    return { ...base, content: "Those arguments were not readable as JSON. Send them again.", is_error: true };
  }
  try {
    const outcome = await tool.run(input);
    return { ...base, content: outcome.message, is_error: outcome.ok ? undefined : true };
  } catch (err) {
    return {
      ...base,
      content: err instanceof Error ? err.message : "That did not work.",
      is_error: true,
    };
  }
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

  /**
   * One request. Separate because the tool loop makes several of them, and a
   * try/catch repeated per round is a try/catch that drifts.
   */
  private async send(
    messages: Anthropic.MessageParam[],
    system: Anthropic.MessageCreateParams["system"],
    maxTokens: number,
    tools: ReturnType<typeof toolDefinitions>
  ): Promise<Anthropic.Message> {
    try {
      return await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        // Thinking is always on and cannot be switched off on this model;
        // effort is the dial, and it is set rather than left to a default
        // that moves when the model does.
        output_config: { effort: this.effort },
        system,
        // Omitted rather than sent empty: an empty list is a different
        // request from one with no tools at all.
        ...(tools.length > 0 ? { tools } : {}),
        // tool_choice is deliberately left alone. Forcing a tool is refused
        // outright on this model, and "auto" is what we want anyway: most
        // questions are questions, and answering one is not an action.
        messages,
      });
    } catch (err) {
      const message = friendlyAnthropicError(err);
      recordAIFailure(message);
      throw new Error(message);
    }
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
    const documents = collectDocuments(context);
    // What this app can let Claude actually do, this turn. Empty for every
    // call site that has not been given any, which is most of them.
    const tools = collectTools(context);
    const definitions = toolDefinitions(tools);

    /*
     * Attachments first, then the question.
     *
     * The order is not cosmetic: a document or an image placed after the text
     * is markedly less likely to be used, and a question that ends "...what
     * did I get wrong on question 3" wants the pages already in hand.
     */
    const attachments: Anthropic.ContentBlockParam[] = [
      ...documents.map(
        (document): Anthropic.DocumentBlockParam => ({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: document.base64 },
          ...(document.title ? { title: document.title } : {}),
        })
      ),
      ...images.map(
        (image): Anthropic.ImageBlockParam => ({
          type: "image",
          source: { type: "base64", media_type: image.mediaType, data: image.base64 },
        })
      ),
    ];

    const content: Anthropic.MessageParam["content"] =
      attachments.length > 0 ? [...attachments, { type: "text", text: prompt }] : prompt;

    // The earlier turns, then this one. Everything that passes no turns is
    // unchanged: one user message, exactly as before.
    const conversation: Anthropic.MessageParam[] = [
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

    let message = await this.send(conversation, system, maxTokens, definitions);

    /*
     * The tool loop.
     *
     * Claude asks for a tool, this app runs it, the result goes back as
     * another turn, and it carries on from there — which is what makes "add
     * that exam for me" one sentence rather than a sentence and then four
     * taps on a form. The loop is bounded; MAX_TOOL_ROUNDS says why.
     */
    let rounds = 0;
    while (definitions.length > 0 && message.stop_reason === "tool_use") {
      const calls = message.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );
      if (calls.length === 0) break;

      // The assistant turn goes back exactly as it arrived, thinking blocks
      // and all: a thinking block is only valid in the conversation that
      // produced it, and rebuilding the turn from its text would drop the
      // reasoning that led to the tool call.
      conversation.push({ role: "assistant", content: message.content });

      const exhausted = rounds >= MAX_TOOL_ROUNDS;
      // Every result in ONE user message, in the order they were asked for.
      // Several tool_use blocks can arrive together, and splitting them
      // across messages is rejected.
      const results: Anthropic.ContentBlockParam[] = [];
      for (const call of calls) {
        results.push(
          exhausted
            ? {
                type: "tool_result",
                tool_use_id: call.id,
                content: "Out of steps for this turn — nothing was run. Say what you were about to do and ask them to confirm.",
                is_error: true,
              }
            : await runTool(tools, call)
        );
      }
      if (exhausted) {
        results.push({
          type: "text",
          text: "You have used all the steps available this turn. Answer in words now; do not ask for another tool.",
        });
      }
      conversation.push({ role: "user", content: results });

      message = await this.send(conversation, system, maxTokens, definitions);
      rounds += 1;
      if (exhausted) break;
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
      if (message.stop_reason === "tool_use") {
        throw new Error(
          "The AI kept asking to do more things and never got to an answer. Ask again, one thing at a time."
        );
      }
      throw new Error(`The AI service returned no text (stop reason: ${message.stop_reason ?? "unknown"}).`);
    }
    recordAISuccess();
    return text;
  }
}
