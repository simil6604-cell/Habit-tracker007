/**
 * Where a failed action's message goes when the component that ran it has
 * nowhere to put one.
 *
 * Most of this app's buttons are one line: run the action, let the page
 * revalidate. There is no error slot in the markup and adding one to forty
 * components is forty chances to get it wrong — so the message goes to a
 * single place that is always on screen instead.
 *
 * A module-level set rather than React context: the publisher is a hook
 * used in dozens of components, the subscriber is one strip in the layout,
 * and threading a provider between them would change every tree in the app
 * to deliver a sentence that appears twice a year.
 */
type Listener = (message: string) => void;

const listeners = new Set<Listener>();

export function reportActionFailure(message: string): void {
  // A copy, so a listener that unsubscribes while being called cannot
  // change the set underneath the loop.
  for (const listener of [...listeners]) listener(message);
}

export function onActionFailure(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For tests, so one spec's leftover listener cannot hear the next one's. */
export function clearActionFailureListeners(): void {
  listeners.clear();
}
