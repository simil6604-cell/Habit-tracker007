/**
 * What to put on screen when a server action does not come back.
 *
 * A page should never die because a button failed. It used to: the plan
 * builder called its action inside a transition with nothing around it, so
 * anything thrown — an expired session, the server restarting under the tap,
 * a phone that lost signal — became an unhandled rejection, and the whole
 * School page was replaced by "This page didn't load". The chat, the exams,
 * the homework list, all of it gone, over one button.
 *
 * Two different moments need two different sentences, and the difference
 * matters because only one of them is worth retrying immediately:
 *
 * `serverFailureMessage` is for a failure the server caught and can name.
 * `clientFailureMessage` is for a call that never came back at all, where
 * the browser knows nothing except that it did not arrive — in a production
 * build the real message never leaves the server, so guessing at the cause
 * would be inventing one.
 */

/** A failure the server caught, named as plainly as it can be. */
export function serverFailureMessage(err: unknown, what: string): string {
  const raw = err instanceof Error ? err.message.trim() : "";
  // The single most likely one on a phone left open overnight, and the one
  // where "try again" is the wrong advice.
  if (/unauthori[sz]ed/i.test(raw)) {
    return "You are signed out, so nothing could be saved. Reload the app, sign in, and try again.";
  }
  return raw
    ? `${what} did not work: ${raw.slice(0, 200)}. Nothing was saved, so trying again is safe.`
    : `${what} did not work. Nothing was saved, so trying again is safe.`;
}

/** A call that never came back: offline, a deploy mid-tap, the server restarting. */
export function clientFailureMessage(what: string): string {
  return `${what} didn't get through — you may be offline, or the app may be restarting. Nothing was saved; try again in a moment.`;
}
