import {
  GOOGLE_AUTH_ENDPOINT,
  GOOGLE_SCOPES,
  GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_USERINFO_ENDPOINT,
} from "./config";

/**
 * The OAuth half of the Google connection: getting a token, keeping it alive,
 * and — the part that actually matters here — saying in plain words why it
 * didn't work.
 *
 * This app is being pointed at a school's Google account, and the single most
 * likely outcome is not a bug in this code: it is a Workspace administrator
 * who does not allow outside apps. Google reports that as `access_denied` or
 * `admin_policy_enforced`, which, left raw, reaches the student as a blank
 * screen and looks like the app is broken. Every failure below is therefore
 * classified into something true and actionable.
 *
 * `fetch` is injected so all of this can be tested against the shapes Google
 * really returns, without a network and without a real school account.
 */

export type Fetcher = typeof fetch;

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string | null;
  /** Absolute, not the "seconds from now" Google sends. */
  expiresAt: Date;
  scope: string;
};

export type GoogleFailure =
  | "ADMIN_BLOCKED"
  | "DECLINED"
  | "NEEDS_RECONNECT"
  | "NOT_A_CLASSROOM_USER"
  | "API_NOT_ENABLED"
  | "MISSING_SCOPE"
  | "RATE_LIMITED"
  | "UNKNOWN";

export class GoogleError extends Error {
  readonly kind: GoogleFailure;
  constructor(kind: GoogleFailure, message: string) {
    super(message);
    this.kind = kind;
    this.name = "GoogleError";
  }
}

/**
 * What to tell the person, per failure.
 *
 * Written to answer "so what do I do now?" — an administrator block is not
 * something they can retry their way out of, and saying so is kinder than a
 * button that keeps failing.
 */
export const GOOGLE_FAILURE_MESSAGE: Record<GoogleFailure, string> = {
  ADMIN_BLOCKED:
    "Your school's Google administrator does not allow outside apps to read this account. That is set at the school, not here — nothing in this app can get around it. Ask whoever manages your school's Google accounts to allow it, or connect a personal Google account instead.",
  // Says both things it can mean, because Google reports both with the same
  // code — and because this text is what the settings card shows, looked up
  // by kind. A richer sentence built at the point of failure never reaches
  // anyone: only the kind survives the redirect.
  DECLINED:
    "Google did not grant access, so nothing was connected. Either it was cancelled on that screen, or your school's administrator does not allow outside apps to read this account.",
  NEEDS_RECONNECT:
    "Google has stopped accepting the saved permission — this happens about every 7 days while the app is still in Google's testing mode, and also if you removed its access. Connect it again to carry on.",
  NOT_A_CLASSROOM_USER:
    "Google says this account has no Classroom. If you have more than one Google account, make sure you picked the one your school uses.",
  API_NOT_ENABLED:
    "The Classroom API is not switched on in your Google Cloud project yet. Enable it there, wait a minute, and try again.",
  MISSING_SCOPE:
    "The permission that was granted does not cover reading your coursework. Disconnect and connect again, and leave all the boxes ticked on Google's screen.",
  RATE_LIMITED: "Google is asking us to slow down. Wait a minute and sync again.",
  UNKNOWN: "Google refused the request and did not say why in a way this app recognises.",
};

/**
 * Where to send someone to grant access.
 *
 * `access_type=offline` with `prompt=consent` is what makes Google hand over a
 * refresh token. Without both, a connection works for an hour and then quietly
 * stops, which is the worst of both worlds.
 */
export function buildAuthUrl({
  clientId,
  redirectUri,
  state,
  loginHint,
}: {
  clientId: string;
  redirectUri: string;
  state: string;
  loginHint?: string;
}): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  if (loginHint) url.searchParams.set("login_hint", loginHint);
  return url.toString();
}

/** Classifies the `error` Google puts on the redirect back from its screen. */
export function classifyRedirectError(error: string | null): GoogleError | null {
  if (!error) return null;
  if (error === "admin_policy_enforced" || error === "org_internal" || error === "disallowed_useragent") {
    return new GoogleError("ADMIN_BLOCKED", GOOGLE_FAILURE_MESSAGE.ADMIN_BLOCKED);
  }
  if (error === "access_denied") {
    // Ambiguous by design on Google's side: the same code covers "you pressed
    // cancel" and "your administrator forbids this", so the shared message
    // above says both rather than guessing and misleading half the time.
    return new GoogleError("DECLINED", GOOGLE_FAILURE_MESSAGE.DECLINED);
  }
  return new GoogleError("UNKNOWN", `${GOOGLE_FAILURE_MESSAGE.UNKNOWN} (${error})`);
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

function classifyTokenError(body: TokenResponse): GoogleError {
  const error = body.error ?? "";
  const description = body.error_description ?? "";
  if (error === "invalid_grant") {
    return new GoogleError("NEEDS_RECONNECT", GOOGLE_FAILURE_MESSAGE.NEEDS_RECONNECT);
  }
  if (error === "admin_policy_enforced" || /admin|policy/i.test(description)) {
    return new GoogleError("ADMIN_BLOCKED", GOOGLE_FAILURE_MESSAGE.ADMIN_BLOCKED);
  }
  return new GoogleError("UNKNOWN", `${GOOGLE_FAILURE_MESSAGE.UNKNOWN} (${error || "no error code"})`);
}

function toTokens(body: TokenResponse, now: Date, previousRefresh?: string | null): GoogleTokens {
  if (!body.access_token) throw new GoogleError("UNKNOWN", "Google's reply contained no access token.");
  // Google only returns a refresh token the first time; a refresh keeps the
  // one already held. Losing it here is how a connection silently becomes
  // hour-long.
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? previousRefresh ?? null,
    expiresAt: new Date(now.getTime() + (body.expires_in ?? 3600) * 1000),
    scope: body.scope ?? GOOGLE_SCOPES.join(" "),
  };
}

async function postToken(params: URLSearchParams, doFetch: Fetcher): Promise<TokenResponse> {
  const response = await doFetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  let body: TokenResponse;
  try {
    body = (await response.json()) as TokenResponse;
  } catch {
    throw new GoogleError("UNKNOWN", `Google replied with ${response.status} and no readable body.`);
  }
  if (!response.ok || body.error) throw classifyTokenError(body);
  return body;
}

export async function exchangeCode(
  code: string,
  options: { clientId: string; clientSecret: string; redirectUri: string; fetch?: Fetcher; now?: Date }
): Promise<GoogleTokens> {
  const body = await postToken(
    new URLSearchParams({
      code,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      redirect_uri: options.redirectUri,
      grant_type: "authorization_code",
    }),
    options.fetch ?? fetch
  );
  return toTokens(body, options.now ?? new Date());
}

export async function refreshAccessToken(
  refreshToken: string,
  options: { clientId: string; clientSecret: string; fetch?: Fetcher; now?: Date }
): Promise<GoogleTokens> {
  const body = await postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: options.clientId,
      client_secret: options.clientSecret,
      grant_type: "refresh_token",
    }),
    options.fetch ?? fetch
  );
  return toTokens(body, options.now ?? new Date(), refreshToken);
}

/** Which Google account this is, so the card can name it. Best effort. */
export async function fetchGoogleEmail(accessToken: string, doFetch: Fetcher = fetch): Promise<string | null> {
  try {
    const response = await doFetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { email?: string };
    return body.email ?? null;
  } catch {
    // Cosmetic: a connection that works but cannot name itself is still a
    // working connection.
    return null;
  }
}
