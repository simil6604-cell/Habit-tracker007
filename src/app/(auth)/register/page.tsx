import Link from "next/link";
import { AuthForm } from "@/components/auth/auth-form";
import { registerAction } from "@/lib/auth/actions";
import { getSignupState } from "@/lib/auth/signup-state";
import { Logo } from "@/components/layout/logo";

/**
 * Rendered per request, never prerendered.
 *
 * Without this Next builds this page once and serves that HTML: the signup
 * door's state would be whatever it was at BUILD time, and INVITE_CODE is set
 * in the dashboard after the build. Caught by looking at the page — a server
 * with no code set still served the invite-code form, because the build had
 * had one.
 *
 * It cannot be left to the data either. The fast path in getSignupState skips
 * the database entirely when a code is set, so there is nothing dynamic for
 * Next to notice, and on a host where the database is not mounted at build
 * time the alternative to this line is a build that tries to query it.
 */
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const signup = await getSignupState();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {signup.open ? (
        <AuthForm mode="register" action={registerAction} needsInviteCode={signup.needsCode} />
      ) : (
        // A closed door that still shows the form would take a name, an email
        // and a password before refusing — three things typed for nothing, and
        // a password typed into a page that was never going to accept it.
        <div className="w-full max-w-sm animate-fade-in-up text-center">
          <div className="mx-auto mb-4">
            <Logo size={48} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Registration is closed</h1>
          <p className="mt-2 text-sm text-muted">
            This app is set up for one household, not for the public. If you were meant to have an account, ask the
            person who runs it for the invite code.
          </p>
          <Link href="/login" className="mt-6 inline-block text-sm font-medium text-accent">
            Back to sign in
          </Link>
        </div>
      )}
    </div>
  );
}
