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

let activeProvider: AIProvider = isRealAIConfigured ? new AnthropicProvider() : new MockAIProvider();

export function getAIProvider(): AIProvider {
  return activeProvider;
}

export function setAIProvider(provider: AIProvider) {
  activeProvider = provider;
}
