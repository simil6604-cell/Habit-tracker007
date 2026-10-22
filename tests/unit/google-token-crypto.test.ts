import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptToken, encryptToken, MissingTokenKeyError } from "@/lib/google/token-crypto";

const SECRET = "test-auth-secret-not-a-real-one";

describe("google token storage", () => {
  const original = process.env.AUTH_SECRET;
  beforeEach(() => {
    process.env.AUTH_SECRET = SECRET;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = original;
  });

  it("round-trips a token", () => {
    const token = "1//0gRefreshTokenLooksLikeThis-abcDEF_123";
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it("never stores the token in a readable form", () => {
    const token = "1//0gSecretValue";
    const stored = encryptToken(token);
    // The whole point: a database file on its own must not hand over the
    // account. The token must not appear in plain, nor as plain base64.
    expect(stored).not.toContain(token);
    expect(stored).not.toContain(Buffer.from(token).toString("base64"));
    expect(stored).not.toContain(Buffer.from(token).toString("base64url"));
  });

  it("encrypts the same token differently every time", () => {
    // A fixed IV would make identical tokens produce identical ciphertext,
    // which leaks that two rows hold the same value.
    expect(encryptToken("same")).not.toBe(encryptToken("same"));
  });

  it("refuses a token that has been tampered with", () => {
    const stored = encryptToken("1//0gRealToken");
    const [v, iv, tag, payload] = stored.split(".");
    const flipped = Buffer.from(payload, "base64url");
    flipped[0] ^= 0xff;
    // Authenticated encryption: an altered payload fails rather than
    // decrypting into something else.
    expect(decryptToken([v, iv, tag, flipped.toString("base64url")].join("."))).toBeNull();
  });

  it("refuses a token encrypted under a different secret", () => {
    const stored = encryptToken("1//0gRealToken");
    process.env.AUTH_SECRET = "a-completely-different-secret";
    // Which is what happens when the host regenerates AUTH_SECRET: it reads
    // as "not connected", and reconnecting fixes it.
    expect(decryptToken(stored)).toBeNull();
  });

  it("treats anything malformed as not connected rather than throwing", () => {
    for (const bad of ["", "not-a-token", "v1.only.two", "v2.a.b.c", "v1...", "....."]) {
      expect(decryptToken(bad), bad).toBeNull();
    }
  });

  it("says plainly when there is no key at all", () => {
    delete process.env.AUTH_SECRET;
    // Encrypting without a key must never silently store plaintext.
    expect(() => encryptToken("1//0gRealToken")).toThrow(MissingTokenKeyError);
    expect(decryptToken("v1.a.b.c")).toBeNull();
  });
});
