import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Who is allowed to create an account.
 *
 * This app's AI runs on one person's API key. Every account that exists spends
 * that key, and /register was reachable by anyone who had the link — so the
 * bill and the rate limit were open to strangers. This module is the door.
 *
 * The code is a shared secret in INVITE_CODE, not a row per invitation. That
 * is a deliberate trade: single-use codes would stop an invited friend from
 * passing theirs on, but they need a table, a screen to mint them, and a story
 * for revoking. The owner here wants to hand a word to four people, and a word
 * in an environment variable does that without any of it. If the word gets
 * around, changing it locks everyone out again at once, which is the property
 * that actually matters.
 */

/**
 * Why the door is in the state it is.
 *
 * Carried as a field rather than inferred from `open`/`needsCode`, because two
 * of these are open-to-anyone and mean opposite things: on a laptop that is
 * correct, on a live deployment it is the hole this module exists to close.
 * The Settings check reads this to tell them apart.
 */
export type SignupState =
  /** Open to anyone who reaches the page — no code is asked for. */
  | { open: true; needsCode: false; kind: "open-not-production" | "open-first-account"; reason: string }
  /** Open, but only with the right code. */
  | { open: true; needsCode: true; kind: "invite-only"; reason: string }
  /** Nobody can register at all. */
  | { open: false; needsCode: false; kind: "closed-no-code"; reason: string };

/** A code that is only whitespace is not a code. Treated exactly like unset. */
function normalizeConfigured(code: string | undefined): string | null {
  const trimmed = (code ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The state of the signup door, from the three things that decide it.
 *
 * `accountCount` is there for the one case a closed door would be a trap: a
 * fresh deployment with no accounts yet and no code set. The owner has to be
 * able to claim their own app, so the first account is always allowed. From the
 * second one on, a production deployment with no code set is closed rather
 * than open — the safe end of that choice, because the cost of being wrong is
 * strangers spending the owner's credit, and the fix (set INVITE_CODE) is one
 * environment variable away and named in the message.
 */
export function signupState({
  configuredCode,
  isProduction,
  accountCount,
}: {
  configuredCode: string | undefined;
  isProduction: boolean;
  accountCount: number;
}): SignupState {
  const code = normalizeConfigured(configuredCode);

  if (code) {
    return {
      open: true,
      needsCode: true,
      kind: "invite-only",
      reason: "Registration needs the invite code.",
    };
  }

  if (!isProduction) {
    return {
      open: true,
      needsCode: false,
      kind: "open-not-production",
      reason: "No invite code is set, and this is not a production build, so registration is open.",
    };
  }

  if (accountCount === 0) {
    return {
      open: true,
      needsCode: false,
      kind: "open-first-account",
      reason: "No account exists yet, so the first one — yours — can be created without a code.",
    };
  }

  return {
    open: false,
    needsCode: false,
    kind: "closed-no-code",
    reason:
      "Registration is closed because no invite code is set on this deployment. Set INVITE_CODE where your app's environment variables are kept, then share that code with the people you want to let in.",
  };
}

/**
 * Whether two codes match, without leaking how much of one was right.
 *
 * Both sides are hashed before comparing, for two reasons: timingSafeEqual
 * throws on buffers of different length, and comparing the raw strings would
 * make the reply time depend on the length of the real code. Hashing makes
 * every comparison the same 32 bytes, so neither the length nor a matching
 * prefix is observable.
 *
 * Whether a timing attack is realistic over the internet against an invite
 * code is beside the point: this is three lines and it removes the question.
 */
export function codesMatch(a: string, b: string): boolean {
  const left = createHash("sha256").update(a, "utf8").digest();
  const right = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(left, right);
}

export type InviteResult = { ok: true } | { ok: false; error: string };

/**
 * Check what someone typed into the invite field against the door's state.
 *
 * Surrounding whitespace goes: a code copied out of a chat message arrives with
 * a space or a newline on it often enough that refusing it would be the app's
 * fault, not the person's. Case is NOT ignored — the owner chooses the code and
 * folding case would quietly shrink it.
 */
export function checkInvite(supplied: string | undefined, state: SignupState, configuredCode: string | undefined): InviteResult {
  if (!state.open) return { ok: false, error: state.reason };
  if (!state.needsCode) return { ok: true };

  const code = normalizeConfigured(configuredCode);
  if (!code) {
    // Unreachable through signupState, which only asks for a code when one is
    // set. Kept as a refusal rather than a pass, because the failure mode of
    // the other choice is a door that opens when the lock goes missing.
    return { ok: false, error: "Registration is closed." };
  }

  const typed = (supplied ?? "").trim();
  if (!typed) return { ok: false, error: "Enter the invite code you were given." };
  if (!codesMatch(typed, code)) return { ok: false, error: "That invite code is not right." };

  return { ok: true };
}
