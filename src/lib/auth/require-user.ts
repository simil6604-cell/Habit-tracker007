import { redirect } from "next/navigation";
import { auth } from "./auth";

/**
 * Who is asking, or the login page.
 *
 * Every server action in this app starts with this line, and until now
 * every one of them had its own copy that threw `new Error("Unauthorized")`
 * — thirty-five identical copies of the single most common way this app
 * fell over. A thrown action reaches the error boundary, and the person
 * whose session quietly expired overnight does not get asked to sign in:
 * they get "This page didn't load", with the page they were on gone.
 *
 * Redirecting instead is both kinder and more honest. A session that has
 * run out is not an error in the app, it is a person who needs to sign in,
 * and that is a page we have. It works from an action and from a server
 * render alike.
 *
 * A caveat worth knowing before you wrap a call to this in a try/catch:
 * `redirect` works by throwing a special error that the framework catches.
 * A catch-all around it would swallow the redirect and turn it into a
 * message about something going wrong. Anything catching around this must
 * call `unstable_rethrow(err)` first — see `serverFailureMessage`'s
 * callers, which do.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session.user.id;
}
