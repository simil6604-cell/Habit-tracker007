"use server";

import { auth } from "@/lib/auth/auth";
import { getAIProvider, isRealAIConfigured } from "./provider";

export type AIDiagnosis = {
  ok: boolean;
  /** Short verdict shown in bold. */
  headline: string;
  /** What to actually do about it. */
  detail: string;
  /** Masked so the key itself never reaches the browser. */
  keyHint: string;
  model: string;
};

/**
 * Makes one real, tiny call to the AI so a dead connection reports the actual
 * reason — "no key", "invalid key", "out of credit" — instead of every feature
 * silently degrading and leaving the user to guess.
 */
export async function runAIDiagnostics(): Promise<AIDiagnosis> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const raw = process.env.ANTHROPIC_API_KEY ?? "";
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
  const keyHint = raw
    ? `set — ${raw.length} characters, starts "${raw.slice(0, 7)}…", ends "…${raw.slice(-4)}"`
    : "not set";

  if (!isRealAIConfigured) {
    return {
      ok: false,
      headline: "No API key reached the app.",
      detail:
        "ANTHROPIC_API_KEY is empty here. On Render: Environment → check the key name is spelled exactly ANTHROPIC_API_KEY, that the value has no quotes or spaces around it, and that you saved and let it redeploy.",
      keyHint,
      model,
    };
  }

  // Trailing whitespace pasted along with a key is a common and invisible cause.
  if (raw !== raw.trim()) {
    return {
      ok: false,
      headline: "The API key has stray spaces around it.",
      detail: "Re-paste the key without leading/trailing spaces or newlines, then save.",
      keyHint,
      model,
    };
  }

  try {
    const reply = await getAIProvider().generate("Reply with exactly: OK", {
      system: "You are a connection test. Reply with exactly the two letters OK and nothing else.",
      maxTokens: 16,
    });
    return {
      ok: true,
      headline: "The AI is connected and answering.",
      detail: `Test call succeeded on model ${model}. Reply was: "${reply.trim().slice(0, 40)}"`,
      keyHint,
      model,
    };
  } catch (err) {
    return {
      ok: false,
      headline: "The key is set, but the call failed.",
      detail: err instanceof Error ? err.message : "Unknown error reaching the AI service.",
      keyHint,
      model,
    };
  }
}
