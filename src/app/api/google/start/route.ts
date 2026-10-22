import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/auth";
import { googleClientId, googleRedirectUri, isGoogleConfigured } from "@/lib/google/config";
import { buildAuthUrl } from "@/lib/google/oauth";
import { GOOGLE_STATE_COOKIE } from "@/lib/google/oauth-state";

/**
 * Sends someone to Google to grant access.
 *
 * The state value is the part that matters. It is random, it is kept in an
 * httpOnly cookie on this device, and the callback refuses anything that does
 * not carry it back — without that, a link someone else crafted could walk a
 * signed-in person through connecting an account they do not control.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", process.env.AUTH_URL ?? "http://localhost:3000"));
  }

  const settings = new URL("/settings", googleRedirectUri() ?? "http://localhost:3000");
  if (!isGoogleConfigured()) {
    settings.searchParams.set("google", "unconfigured");
    return NextResponse.redirect(settings);
  }

  const state = randomBytes(32).toString("base64url");
  const store = await cookies();
  store.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // Google's redirect is a top-level GET, which lax allows.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(
    buildAuthUrl({ clientId: googleClientId() as string, redirectUri: googleRedirectUri() as string, state })
  );
}
