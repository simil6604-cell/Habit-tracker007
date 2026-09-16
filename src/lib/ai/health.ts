import { isRealAIConfigured } from "./provider";

/**
 * What the AI is actually doing, learned from the calls the app already makes.
 *
 * The problem this solves is silence. Most AI features degrade to their
 * rule-based fallback when a call fails, which is the right behaviour but
 * indistinguishable from "the AI is rubbish" — so a dead key looks like a
 * broken app, and the only way to find out was a button in Settings you had to
 * know about. Recording each call's outcome costs nothing and lets the app
 * volunteer the real reason.
 *
 * Deliberately in-memory: it describes this running server, resets on deploy,
 * and there is nothing here worth a database write.
 */
type Outcome = { at: Date; reason: string };

/**
 * One failed call is not an outage. A single 429 or a one-off 400 from one
 * request would otherwise latch the banner on every page until the next
 * success — the app claiming to be broken while it works. Two in a row, or one
 * that is still the last thing that happened after a few minutes, is a
 * different matter.
 */
const FAILURES_BEFORE_ALARM = 2;
const STALE_FAILURE_MS = 5 * 60 * 1000;

let lastSuccess: Date | null = null;
let lastFailure: Outcome | null = null;
let failuresSinceSuccess = 0;

export function recordAISuccess() {
  lastSuccess = new Date();
  lastFailure = null;
  failuresSinceSuccess = 0;
}

export function recordAIFailure(reason: string) {
  lastFailure = { at: new Date(), reason };
  failuresSinceSuccess += 1;
}

export type AIHealth = {
  /** False when the app cannot currently get a real answer out of the AI. */
  ok: boolean;
  /** One line naming the actual problem — never a generic "unavailable". */
  problem: string | null;
  /** What to do about it. */
  fix: string | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  failuresSinceSuccess: number;
};

/**
 * Two things are knowable for free and worth separating, because the fix is
 * different: a key that never arrived (an environment problem) and a key that
 * arrives but is rejected (a key or billing problem).
 */
export function getAIHealth(): AIHealth {
  const raw = process.env.ANTHROPIC_API_KEY ?? "";

  if (!isRealAIConfigured) {
    return {
      ok: false,
      problem: "No AI key reached the app, so every AI feature is running on its built-in fallback.",
      fix: "Add ANTHROPIC_API_KEY in your host's environment settings (on Render: Environment → Add Environment Variable), then let it redeploy.",
      lastSuccessAt: null,
      lastFailureAt: null,
      failuresSinceSuccess: 0,
    };
  }

  // A key pasted with a stray space or newline is configured but always
  // rejected — worth calling out by name, because the error it causes ("401")
  // points at the key rather than at the whitespace around it.
  if (raw !== raw.trim()) {
    return {
      ok: false,
      problem: "The AI key has a space or line break around it, so it is rejected on every call.",
      fix: "Re-paste ANTHROPIC_API_KEY with no spaces, quotes or newlines around the value, then redeploy.",
      lastSuccessAt: lastSuccess,
      lastFailureAt: lastFailure?.at ?? null,
      failuresSinceSuccess,
    };
  }

  const failureIsMeaningful =
    lastFailure !== null &&
    (failuresSinceSuccess >= FAILURES_BEFORE_ALARM || Date.now() - lastFailure.at.getTime() > STALE_FAILURE_MS);

  if (lastFailure && failureIsMeaningful) {
    return {
      ok: false,
      problem: `The last AI call failed: ${lastFailure.reason}`,
      fix: "Open Settings and use Test AI connection for the full diagnosis. If it mentions credit or billing, top up your Anthropic account; if it mentions the key, re-paste it.",
      lastSuccessAt: lastSuccess,
      lastFailureAt: lastFailure.at,
      failuresSinceSuccess,
    };
  }

  return { ok: true, problem: null, fix: null, lastSuccessAt: lastSuccess, lastFailureAt: null, failuresSinceSuccess: 0 };
}
