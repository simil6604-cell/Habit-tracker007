import { prisma } from "@/lib/db/prisma";
import { signupState, type SignupState } from "./invite";

/**
 * The signup door's current state, read fresh rather than cached.
 *
 * Deliberately NOT in actions.ts: every export of a `"use server"` file becomes
 * a callable endpoint, and a plain read like this has no business being one.
 *
 * The account count is only needed to let the very first account through, so it
 * is only counted when no code is set — on a normal deployment with a code this
 * is two env reads and no query.
 */
export async function getSignupState(): Promise<SignupState> {
  const configuredCode = process.env.INVITE_CODE;
  const isProduction = process.env.NODE_ENV === "production";
  const hasCode = (configuredCode ?? "").trim().length > 0;
  const accountCount = hasCode || !isProduction ? 0 : await prisma.user.count();
  return signupState({ configuredCode, isProduction, accountCount });
}
