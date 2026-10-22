import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { googleClientId, googleClientSecret, googleRedirectUri } from "@/lib/google/config";
import { saveGoogleTokens } from "@/lib/google/connection";
import { classifyRedirectError, exchangeCode, fetchGoogleEmail, GoogleError } from "@/lib/google/oauth";
import { GOOGLE_STATE_COOKIE } from "@/lib/google/oauth-state";

/**
 * Where Google comes back to.
 *
 * Everything that can go wrong here ends on the settings page with a reason,
 * never on a blank screen: a refusal by the school's administrator, a
 * cancelled consent, a mismatched state, a dead code. The reason travels as a
 * short code and is turned into words by the card that shows it.
 */
function back(reason: string): NextResponse {
  const settings = new URL("/settings", googleRedirectUri() ?? "http://localhost:3000");
  settings.searchParams.set("google", reason);
  return NextResponse.redirect(settings);
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", process.env.AUTH_URL ?? "http://localhost:3000"));
  }

  const params = request.nextUrl.searchParams;
  const store = await cookies();
  const expected = store.get(GOOGLE_STATE_COOKIE)?.value;
  // Single use, whatever happens next.
  store.delete(GOOGLE_STATE_COOKIE);

  const refused = classifyRedirectError(params.get("error"));
  if (refused) return back(refused.kind);

  const state = params.get("state");
  if (!expected || !state || state !== expected) return back("BAD_STATE");

  const code = params.get("code");
  if (!code) return back("UNKNOWN");

  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  const redirectUri = googleRedirectUri();
  if (!clientId || !clientSecret || !redirectUri) return back("unconfigured");

  try {
    const tokens = await exchangeCode(code, { clientId, clientSecret, redirectUri });
    const email = await fetchGoogleEmail(tokens.accessToken);
    await saveGoogleTokens(session.user.id, tokens, email);
    return back("connected");
  } catch (error) {
    // Never log the code or the tokens — only why it failed.
    const kind = error instanceof GoogleError ? error.kind : "UNKNOWN";
    console.error("[google] connecting failed:", kind);
    return back(kind);
  }
}
