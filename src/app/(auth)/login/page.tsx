import { AuthForm } from "@/components/auth/auth-form";
import { loginAction } from "@/lib/auth/actions";
import { getSignupState } from "@/lib/auth/signup-state";

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

export default async function LoginPage() {
  // Asked here so the "Register" link never sends someone to a page that will
  // only tell them to go away. An invite code still shows the link — they can
  // get in, they just need the code, and the register page says so.
  const signup = await getSignupState();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <AuthForm mode="login" action={loginAction} canRegister={signup.open} />
    </div>
  );
}
