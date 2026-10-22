import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Google's tokens, encrypted before they touch the database.
 *
 * A refresh token is not like a password hash. A hash is one-way and useless
 * to whoever reads it; a refresh token is a live key to someone's school
 * account, and it has to be stored in a form this app can read back. So the
 * protection is encryption rather than hashing, keyed off AUTH_SECRET, which
 * lives in the host's environment and never in the database file.
 *
 * What that buys: the database file on its own — copied off the disk, pulled
 * out of a stray backup, read by anything that gets at /var/data — does not
 * hand over access to the account. What it does not buy: protection from
 * anyone who already has the environment. That is the honest boundary.
 *
 * AES-256-GCM rather than CBC, so the ciphertext is authenticated: a token
 * altered in the database fails to decrypt instead of decrypting into
 * something else.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
// A fixed salt is fine here: it exists to separate this key from any other
// use of AUTH_SECRET, and the secret itself is the entropy.
const SALT = "momentum:google-token:v1";
const VERSION = "v1";

export class MissingTokenKeyError extends Error {
  constructor() {
    super("AUTH_SECRET is not set, so Google tokens cannot be encrypted or read.");
    this.name = "MissingTokenKeyError";
  }
}

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new MissingTokenKeyError();
  return scryptSync(secret, SALT, KEY_BYTES);
}

/** Stored as `v1.<iv>.<tag>.<ciphertext>`, all base64url. */
export function encryptToken(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

/**
 * Returns null rather than throwing when the stored value cannot be read.
 *
 * The realistic cause is a changed AUTH_SECRET — Render regenerates it if the
 * service is rebuilt — and that must not turn into a crash on every page that
 * checks whether Google is connected. Unreadable is treated exactly like not
 * connected, which is both true and recoverable: reconnecting writes a token
 * the current key can read.
 */
export function decryptToken(stored: string): string | null {
  try {
    const [version, ivPart, tagPart, payload] = stored.split(".");
    if (version !== VERSION || !ivPart || !tagPart || !payload) return null;
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
