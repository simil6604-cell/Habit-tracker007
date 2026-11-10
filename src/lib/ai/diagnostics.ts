"use server";

import { auth } from "@/lib/auth/auth";
import { getAIProvider, isRealAIConfigured } from "./provider";
import { anthropicModel } from "./model-config";
import { objectSchema, requiredString, type ProviderTool } from "./tool-use";

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
 * A tool the test call offers and expects never to be used.
 *
 * It is here because the tutor's requests now carry tool definitions, and
 * the ways that can fail are invisible from the app: a schema keyword the
 * strict mode does not accept, or a field a future model refuses, comes back
 * as one 400 on every message while a plain test call keeps saying the
 * connection is fine. Offering one makes this page test the shape the app
 * actually sends.
 */
const PROBE_TOOL: ProviderTool = {
  name: "connection_probe",
  description:
    "Do not call this tool. It exists only so a connection test can check that tool definitions are accepted.",
  schema: objectSchema({ why: requiredString("Why you called a tool you were told not to call.") }),
  run: async () => ({ ok: true, message: "Nothing to do — this tool does nothing." }),
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
  const model = anthropicModel();
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
      // Room to think before saying two letters. Thinking is always on and
      // its tokens count against this ceiling, so the old 16 was a test that
      // could report "cut off" on a connection that is perfectly healthy.
      maxTokens: 1_000,
      tools: [PROBE_TOOL],
    });
    return {
      ok: true,
      headline: "The AI is connected and answering.",
      detail: `Test call succeeded on model ${model}, with tool definitions attached — so your school AI can act in the app, not just answer. Reply was: "${reply.trim().slice(0, 40)}"`,
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
