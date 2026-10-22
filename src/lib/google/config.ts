/**
 * What this app asks Google for, and where Google sends the answer.
 *
 * Every scope here is read-only, and all four are the "me" variants: this
 * reads the student's own courses, their own work and their own submissions.
 * Nothing in the app writes to Classroom, and nothing can see another
 * student's work. That is a deliberate ceiling, not a current limitation —
 * a wider scope would be refused by more school administrators and would let
 * a bug do damage in a system this app does not own.
 */
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
  "https://www.googleapis.com/auth/classroom.student-submissions.me.readonly",
  "https://www.googleapis.com/auth/classroom.announcements.readonly",
] as const;

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
export const CLASSROOM_API = "https://classroom.googleapis.com/v1";

/** The path Google is told to come back to. One place, so it cannot drift. */
export const GOOGLE_CALLBACK_PATH = "/api/google/callback";

export function googleClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID?.trim() || null;
}

export function googleClientSecret(): string | null {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || null;
}

/**
 * The redirect URI, built from the app's own public URL.
 *
 * Google matches this string exactly against what is registered in the Cloud
 * console — a trailing slash or http instead of https is a hard failure with
 * an unhelpful message, so it is derived in one place from the same variable
 * sign-in redirects already use.
 */
export function googleRedirectUri(): string | null {
  const base = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || "").trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}${GOOGLE_CALLBACK_PATH}`;
}

/** Everything needed to start the flow is present. */
export function isGoogleConfigured(): boolean {
  return Boolean(googleClientId() && googleClientSecret() && googleRedirectUri());
}

/**
 * What is missing, in the words of the thing the person has to go and set.
 * Shown in Settings so a dead Connect button is never the only feedback.
 */
export function googleConfigProblem(): string | null {
  if (!googleClientId()) return "GOOGLE_CLIENT_ID is not set.";
  if (!googleClientSecret()) return "GOOGLE_CLIENT_SECRET is not set.";
  if (!googleRedirectUri()) return "AUTH_URL is not set, so Google has no address to send you back to.";
  return null;
}
