/**
 * Is this string usable as an API key at all, before anything tries to send it?
 *
 * Written after a real failure that cost an evening. A key pasted into the
 * host's environment had a Cyrillic "а" (U+0430) where the Latin "a" of
 * "sk-ant-api03" belongs — invisible on screen, identical in every font. The
 * SDK puts the key in an HTTP header, headers may only hold Latin-1, and the
 * browser-level error that reached the chat was:
 *
 *   Cannot convert argument to a ByteString because the character at index 7
 *   has a value of 1072 which is greater than 255.
 *
 * Which is true, and useless. It names no key, no fix, and reads like a bug in
 * the app. Catching it here turns it into a sentence naming the character and
 * where it is, so the person can see what to retype.
 *
 * Pure on purpose: every branch is a test rather than an environment someone
 * has to reproduce by hand.
 */

export type KeyProblem = { problem: string; fix: string };

/** The highest code point an HTTP header value can carry. */
const MAX_HEADER_CHAR = 255;

/**
 * The first character an API key has no business containing, with where it is.
 *
 * Printable ASCII, not Latin-1. A non-breaking space is 160 — inside what a
 * header can carry, so it causes no crash, but it is still not the space-less
 * key the API issued and every call comes back 401 with nothing to point at.
 * Both kinds are wrong; only the wording of the reason differs.
 *
 * Index counted over code units, which is what the SDK's own error reports —
 * so the two numbers agree for whoever reads both.
 */
function firstBadChar(key: string): { index: number; code: number; sendable: boolean } | null {
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    if (code >= 0x20 && code <= 0x7e) continue;
    return { index, code, sendable: code <= MAX_HEADER_CHAR };
  }
  return null;
}

/** A name for the handful of lookalikes that actually cause this. */
function describeChar(code: number): string {
  if (code >= 0x0400 && code <= 0x04ff) return "a Cyrillic letter";
  if (code >= 0x0370 && code <= 0x03ff) return "a Greek letter";
  if (code === 0x2013 || code === 0x2014) return "a long dash";
  if (code === 0x2018 || code === 0x2019 || code === 0x201c || code === 0x201d) return "a curly quote";
  if (code === 0x00a0 || code === 0x200b || code === 0x202f) return "an invisible space";
  if (code === 0x0a || code === 0x0d) return "a line break";
  if (code === 0x09) return "a tab";
  return "a character that is not a plain letter";
}

/**
 * What is wrong with this key, or null if nothing visible is.
 *
 * It cannot tell a valid key from a revoked one — only the API can do that.
 * It catches the kinds that fail before any request is made, where the error
 * that comes back says nothing about the key.
 */
export function inspectApiKey(raw: string | undefined | null): KeyProblem | null {
  const key = raw ?? "";
  if (!key) return null;

  if (key !== key.trim()) {
    return {
      problem: "The AI key has a space or line break around it, so it is rejected on every call.",
      fix: "Re-paste ANTHROPIC_API_KEY with no spaces, quotes or newlines around the value, then redeploy.",
    };
  }

  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    return {
      problem: "The AI key is wrapped in quotation marks, which are part of the value here and make it wrong.",
      fix: "Re-paste ANTHROPIC_API_KEY without the quotes around it, then redeploy.",
    };
  }

  const bad = firstBadChar(key);
  if (bad) {
    const consequence = bad.sendable
      ? "which is not part of the key the API issued, so every call comes back rejected"
      : "which cannot be sent in a web request at all";
    return {
      problem:
        `The AI key contains ${describeChar(bad.code)} at position ${bad.index + 1}, ${consequence}. ` +
        "It looks right on screen but is not the character it appears to be — this happens when a key is retyped, or copied through something that changed the characters.",
      fix: "Copy ANTHROPIC_API_KEY again straight from console.anthropic.com, paste it over the old value without retyping any of it, and redeploy.",
    };
  }

  /*
   * An ordinary space in the middle. Last, because every stranger character
   * above has a more precise name than "a space" — a non-breaking space is
   * worth calling invisible, and a line break is worth calling a line break.
   * This one survives trim(), is invisible in a masked field, and comes back
   * as a flat 401, which sends you to look at the key in the console where it
   * is perfectly fine.
   */
  if (key.includes(" ")) {
    return {
      problem: "The AI key has a space inside it, so the API rejects it as a key it has never issued.",
      fix: "Copy ANTHROPIC_API_KEY again from console.anthropic.com in one go and paste it over the old value — a space in the middle usually means it was copied in two pieces.",
    };
  }

  return null;
}

/**
 * What to put on screen when an AI call failed.
 *
 * "Couldn't reach the AI service right now — try again in a moment" is true of
 * a timeout and a lie about a key with a wrong character in it: trying again
 * produces the same failure for ever, and the sentence tells you to do exactly
 * that. A problem the person has to fix says so instead, and drops the
 * invitation to retry.
 */
export function aiFailureMessage(err: unknown, apiKey = process.env.ANTHROPIC_API_KEY): string {
  const keyProblem = inspectApiKey(apiKey);
  if (keyProblem) return `${keyProblem.problem} ${keyProblem.fix}`;
  const detail = err instanceof Error ? err.message : "unknown error";
  return `Couldn't reach the AI service right now (${detail}) — try again in a moment.`;
}

/**
 * Enough of the key to tell whether the right thing arrived, and nothing that
 * could be used.
 *
 * A key rejected as invalid is most often a key that arrived in pieces: a
 * partial copy, or a paste into a field that was not empty. Neither is visible
 * in a masked value, and the API's answer for all of them is the same flat
 * 401 — which sends you to look at the key in the console, where it is
 * perfectly fine. Its length says in one glance which of those happened.
 *
 * The first seven characters are the public prefix every Anthropic key shares,
 * and a length is not a secret.
 */
export function describeKeyShape(raw: string | undefined | null): string {
  const key = (raw ?? "").trim();
  if (!key) return "no key is set";
  return `the key here is ${key.length} characters and starts "${key.slice(0, 7)}" — a complete Anthropic key is about 100 characters`;
}
