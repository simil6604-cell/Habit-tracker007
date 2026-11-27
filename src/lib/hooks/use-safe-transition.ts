"use client";

import { useCallback, useTransition } from "react";
import { reportActionFailure } from "@/lib/utils/action-error-bus";
import { clientFailureMessage } from "@/lib/utils/action-error";

/**
 * useTransition, except a failure cannot take the page down.
 *
 * This is the one that matters. `startTransition(async () => { await
 * someAction() })` is how nearly every button in this app works, and an
 * action that throws in there is an unhandled rejection: React hands it to
 * the nearest error boundary, and the whole route is replaced by "This page
 * didn't load". One button that did not work, and the page it was on is
 * gone — reported twice, from two different pages, before it was fixed in
 * one place.
 *
 * The signature is deliberately identical to useTransition's, so adopting
 * it anywhere is a one-line change and nothing else about the component
 * moves. The message goes to the strip in the app layout, because most of
 * these buttons have nowhere of their own to show one.
 *
 * A component that wants to say something more specific still catches for
 * itself; this is the floor, not a replacement for knowing what went wrong.
 */
export function useSafeTransition(
  /** What failed, for the sentence: "Saving that didn't get through…". */
  what = "That"
): [boolean, (work: () => void | Promise<void>) => void] {
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (work: () => void | Promise<void>) => {
      startTransition(async () => {
        try {
          await work();
        } catch {
          reportActionFailure(clientFailureMessage(what));
        }
      });
    },
    [what]
  );

  return [pending, run];
}
