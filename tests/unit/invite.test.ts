import { describe, it, expect } from "vitest";
import { checkInvite, codesMatch, signupState } from "@/lib/auth/invite";
import { signupCheck } from "@/lib/config/setup-checks";

/**
 * The door on /register.
 *
 * Every one of these is a state somebody's deployment is actually in, so each
 * assertion is about a consequence (can a stranger get an account?) rather than
 * about the shape of the returned object.
 */
describe("signupState", () => {
  it("asks for the code whenever one is set, in production or not", () => {
    for (const isProduction of [true, false]) {
      const state = signupState({ configuredCode: "letmein", isProduction, accountCount: 7 });
      expect(state.open).toBe(true);
      expect(state.needsCode).toBe(true);
      expect(state.kind).toBe("invite-only");
    }
  });

  it("closes production entirely when no code is set and accounts already exist", () => {
    const state = signupState({ configuredCode: undefined, isProduction: true, accountCount: 1 });
    expect(state.open).toBe(false);
    expect(state.kind).toBe("closed-no-code");
    // The message has to name the fix, because the person reading it is the
    // only one who can apply it and they are not reading this file.
    expect(state.reason).toContain("INVITE_CODE");
  });

  it("lets the very first account through on a fresh deployment, so the owner can claim it", () => {
    const state = signupState({ configuredCode: undefined, isProduction: true, accountCount: 0 });
    expect(state.open).toBe(true);
    expect(state.needsCode).toBe(false);
    expect(state.kind).toBe("open-first-account");
  });

  it("stays open with no code outside production, so local work and the e2e suite are not gated", () => {
    const state = signupState({ configuredCode: undefined, isProduction: false, accountCount: 42 });
    expect(state.open).toBe(true);
    expect(state.kind).toBe("open-not-production");
  });

  it("treats a code of only whitespace exactly like no code at all", () => {
    // An env var set to "" or " " is the single most likely way this goes
    // wrong: a variable that exists but holds nothing. Accepting it would make
    // the door ask for a code that nobody can possibly type.
    for (const blank of ["", "   ", "\n", "\t "]) {
      const state = signupState({ configuredCode: blank, isProduction: true, accountCount: 3 });
      expect(state.open, `blank code ${JSON.stringify(blank)} must not open a door`).toBe(false);
    }
  });
});

describe("codesMatch", () => {
  it("accepts the same code and rejects a different one", () => {
    expect(codesMatch("herbst-2026", "herbst-2026")).toBe(true);
    expect(codesMatch("herbst-2026", "herbst-2027")).toBe(false);
  });

  it("does not throw on codes of different length", () => {
    // timingSafeEqual throws on mismatched buffer lengths, which is why both
    // sides are hashed first. Without that this line is an exception, and an
    // exception in a server action is a 500 rather than "wrong code".
    expect(() => codesMatch("a", "a-much-longer-code")).not.toThrow();
    expect(codesMatch("a", "a-much-longer-code")).toBe(false);
  });

  it("is case sensitive, so the owner's choice of code is the whole code", () => {
    expect(codesMatch("Herbst", "herbst")).toBe(false);
  });

  it("does not treat a correct prefix as a match", () => {
    expect(codesMatch("herbst", "herbst-2026")).toBe(false);
    expect(codesMatch("herbst-2026", "herbst")).toBe(false);
  });
});

describe("checkInvite", () => {
  const inviteOnly = signupState({ configuredCode: "herbst-2026", isProduction: true, accountCount: 4 });
  const closed = signupState({ configuredCode: undefined, isProduction: true, accountCount: 4 });
  const openNoCode = signupState({ configuredCode: undefined, isProduction: false, accountCount: 4 });

  it("accepts the right code", () => {
    expect(checkInvite("herbst-2026", inviteOnly, "herbst-2026")).toEqual({ ok: true });
  });

  it("forgives whitespace around a pasted code", () => {
    expect(checkInvite("  herbst-2026\n", inviteOnly, "herbst-2026")).toEqual({ ok: true });
  });

  it("refuses the wrong code, an empty one, and a missing field", () => {
    expect(checkInvite("nope", inviteOnly, "herbst-2026").ok).toBe(false);
    expect(checkInvite("", inviteOnly, "herbst-2026").ok).toBe(false);
    expect(checkInvite("   ", inviteOnly, "herbst-2026").ok).toBe(false);
    expect(checkInvite(undefined, inviteOnly, "herbst-2026").ok).toBe(false);
  });

  it("refuses everything when the door is closed, whatever was typed", () => {
    expect(checkInvite("herbst-2026", closed, "herbst-2026").ok).toBe(false);
    expect(checkInvite("", closed, undefined).ok).toBe(false);
  });

  it("passes without a code when the door does not ask for one", () => {
    expect(checkInvite(undefined, openNoCode, undefined)).toEqual({ ok: true });
  });

  it("refuses rather than passes if the state says to ask but the code has gone missing", () => {
    // Not reachable through signupState. Asserted anyway because the two ways
    // to write this branch are "refuse" and "let everyone in", and a future
    // edit that reorders the reads should fail here rather than on the app.
    expect(checkInvite("anything", inviteOnly, undefined).ok).toBe(false);
    expect(checkInvite("anything", inviteOnly, "  ").ok).toBe(false);
  });
});

describe("signupCheck", () => {
  it("never prints the code, in any state", () => {
    const code = "herbst-2026";
    const states = [
      signupState({ configuredCode: code, isProduction: true, accountCount: 4 }),
      signupState({ configuredCode: undefined, isProduction: true, accountCount: 4 }),
      signupState({ configuredCode: undefined, isProduction: true, accountCount: 0 }),
      signupState({ configuredCode: undefined, isProduction: false, accountCount: 4 }),
    ];
    for (const state of states) {
      const check = signupCheck(state);
      expect(`${check.detail} ${check.fix ?? ""}`, `state ${state.kind} leaked the code`).not.toContain(code);
    }
  });

  it("warns only when registration is open to anyone", () => {
    expect(signupCheck(signupState({ configuredCode: "x", isProduction: true, accountCount: 4 })).status).toBe("ok");
    expect(signupCheck(signupState({ configuredCode: undefined, isProduction: true, accountCount: 4 })).status).toBe("ok");
    expect(signupCheck(signupState({ configuredCode: undefined, isProduction: true, accountCount: 0 })).status).toBe("warn");
    expect(signupCheck(signupState({ configuredCode: undefined, isProduction: false, accountCount: 4 })).status).toBe("warn");
  });

  it("tells the closed and the open states apart even though both have no code set", () => {
    const closed = signupCheck(signupState({ configuredCode: undefined, isProduction: true, accountCount: 4 }));
    const wideOpen = signupCheck(signupState({ configuredCode: undefined, isProduction: true, accountCount: 0 }));
    expect(closed.detail).toMatch(/Nobody can register/);
    expect(wideOpen.detail).toMatch(/open to anyone/);
  });
});
