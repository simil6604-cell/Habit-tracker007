import "server-only";
import { prisma } from "@/lib/db/prisma";
import { googleClientId, googleClientSecret, GOOGLE_SCOPES } from "./config";
import { GoogleError, GOOGLE_FAILURE_MESSAGE, refreshAccessToken, type GoogleTokens } from "./oauth";
import { decryptToken, encryptToken } from "./token-crypto";

/**
 * The stored Google connection: writing it, reading it back, and handing out
 * an access token that is actually valid.
 *
 * Tokens are encrypted on the way in and decrypted on the way out, so nothing
 * here or in the database ever holds a usable key to someone's school account
 * in the clear.
 */

/** Refresh this far before expiry, so a sync never starts on a dying token. */
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

export type GoogleConnection = {
  connected: boolean;
  email: string | null;
  connectedAt: Date | null;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  /** True when the saved permission can no longer be used to get a token. */
  needsReconnect: boolean;
};

export const NOT_CONNECTED: GoogleConnection = {
  connected: false,
  email: null,
  connectedAt: null,
  lastSyncAt: null,
  lastSyncError: null,
  needsReconnect: false,
};

export async function getGoogleConnection(userId: string): Promise<GoogleConnection> {
  const row = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!row) return NOT_CONNECTED;

  // A row whose tokens cannot be decrypted is a row from before the host's
  // secret changed. It is not a connection any more, and saying so is the
  // only honest reading — reconnecting repairs it.
  const unreadable = decryptToken(row.accessToken) === null;

  return {
    connected: !unreadable,
    email: row.googleEmail,
    connectedAt: row.connectedAt,
    lastSyncAt: row.lastSyncAt,
    lastSyncError: unreadable ? GOOGLE_FAILURE_MESSAGE.NEEDS_RECONNECT : row.lastSyncError,
    needsReconnect: unreadable || (!row.refreshToken && row.expiresAt.getTime() < Date.now()),
  };
}

export async function saveGoogleTokens(userId: string, tokens: GoogleTokens, email: string | null): Promise<void> {
  const data = {
    googleEmail: email,
    accessToken: encryptToken(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt,
    scope: tokens.scope,
    // A fresh connection starts with a clean slate: an error from the last
    // one would otherwise sit on the card after it has been fixed.
    lastSyncError: null,
  };
  await prisma.googleAccount.upsert({
    where: { userId },
    create: { userId, ...data, connectedAt: new Date() },
    update: data,
  });
}

export async function disconnectGoogle(userId: string): Promise<void> {
  await prisma.googleAccount.deleteMany({ where: { userId } });
}

export async function recordSyncResult(userId: string, error: string | null): Promise<void> {
  await prisma.googleAccount.updateMany({
    where: { userId },
    data: { lastSyncAt: new Date(), lastSyncError: error },
  });
}

/**
 * A usable access token, refreshing first if the stored one is spent.
 *
 * Throws a classified GoogleError rather than returning null, because every
 * caller needs to tell the person which of the several quite different
 * reasons applies.
 */
export async function accessTokenFor(userId: string, now: Date = new Date()): Promise<string> {
  const row = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!row) throw new GoogleError("NEEDS_RECONNECT", "No Google account is connected.");

  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) {
    throw new GoogleError("UNKNOWN", "This app has no Google credentials configured.");
  }

  const current = decryptToken(row.accessToken);
  if (current && row.expiresAt.getTime() - REFRESH_MARGIN_MS > now.getTime()) return current;

  const refresh = row.refreshToken ? decryptToken(row.refreshToken) : null;
  if (!refresh) throw new GoogleError("NEEDS_RECONNECT", GOOGLE_FAILURE_MESSAGE.NEEDS_RECONNECT);

  const refreshed = await refreshAccessToken(refresh, { clientId, clientSecret, now });
  await prisma.googleAccount.update({
    where: { userId },
    data: {
      accessToken: encryptToken(refreshed.accessToken),
      refreshToken: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : row.refreshToken,
      expiresAt: refreshed.expiresAt,
      scope: refreshed.scope || GOOGLE_SCOPES.join(" "),
    },
  });
  return refreshed.accessToken;
}
