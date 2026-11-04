/**
 * Pluggable AI provider interface. The whole app talks to this interface,
 * never to a specific vendor SDK — swapping in a real LLM later means
 * implementing this interface once, nothing else changes.
 *
 * MockAIProvider is fully rule-based and deterministic: it only ever
 * reasons over data actually stored in the database. It never invents
 * facts (syllabus content, league results, medical claims).
 *
 * Setting ANTHROPIC_API_KEY switches the active provider to a real
 * Claude-backed one (see anthropic-provider.ts) — call sites that want a
 * real answer check isRealAIConfigured and fall back to their own
 * rule-based logic when it's false, exactly as they did before.
 */
import { AnthropicProvider } from "./anthropic-provider";

export interface AIProvider {
  name: string;
  generate(prompt: string, context?: Record<string, unknown>): Promise<string>;
}

export class MockAIProvider implements AIProvider {
  name = "mock-rule-based";

  async generate(prompt: string): Promise<string> {
    // The real reasoning lives in lib/ai/chat-engine.ts and
    // lib/ai/balance-engine.ts, which operate directly on Prisma data.
    // This method exists so a real LLM provider can be dropped in without
    // touching any calling code.
    return prompt;
  }
}

export const isRealAIConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

let activeProvider: AIProvider | null = null;

/**
 * Built on first use rather than when this file loads.
 *
 * It used to be constructed at module level, and that made the app depend
 * on which of three files happened to be imported first: anthropic-provider
 * imports health, health imports this, and this imported anthropic-provider.
 * Entered from the wrong end, the class is still undefined when the
 * `new` runs and the whole app dies at startup with "AnthropicProvider is
 * not a constructor" — a message that names nothing you could act on. It
 * resolved the right way only because every call site happens to import
 * this file first, which is not a thing to rely on.
 *
 * Reading the key at first use rather than at import is the second reason:
 * a host that populates the environment a moment after the module graph
 * loads would otherwise be stuck with the mock for the life of the process.
 */
export function getAIProvider(): AIProvider {
  if (!activeProvider) {
    activeProvider = process.env.ANTHROPIC_API_KEY ? new AnthropicProvider() : new MockAIProvider();
  }
  return activeProvider;
}

export function setAIProvider(provider: AIProvider) {
  activeProvider = provider;
}
