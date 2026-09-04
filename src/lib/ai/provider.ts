/**
 * Pluggable AI provider interface. The whole app talks to this interface,
 * never to a specific vendor SDK — swapping in a real LLM later means
 * implementing this interface once, nothing else changes.
 *
 * MockAIProvider is fully rule-based and deterministic: it only ever
 * reasons over data actually stored in the database. It never invents
 * facts (syllabus content, league results, medical claims).
 */
export interface AIProvider {
  name: string;
  generate(prompt: string, context: Record<string, unknown>): Promise<string>;
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

let activeProvider: AIProvider = new MockAIProvider();

export function getAIProvider(): AIProvider {
  return activeProvider;
}

export function setAIProvider(provider: AIProvider) {
  activeProvider = provider;
}

export const isRealAIConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
