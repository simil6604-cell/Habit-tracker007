import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/auth.config";

const { auth } = NextAuth(authConfig);

// "/offline" is here because the service worker fetches it while installing,
// with no session in that request — behind the redirect it would cache the
// login page as the offline page instead.
const PUBLIC_PATHS = ["/login", "/register", "/offline"];

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isPublic = PUBLIC_PATHS.some((p) => nextUrl.pathname.startsWith(p));

  if (!isLoggedIn && !isPublic) {
    const loginUrl = new URL("/login", nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  // Signed in, on a sign-in page: go home. Not /offline, which is a message
  // rather than a page you navigate to, and is shown while signed in too.
  if (isLoggedIn && isPublic && nextUrl.pathname !== "/offline") {
    return NextResponse.redirect(new URL("/", nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|sw.js|api/auth).*)"],
};
