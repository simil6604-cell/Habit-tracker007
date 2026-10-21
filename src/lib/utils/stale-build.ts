// When a new version is deployed, the JavaScript files of the old one stop
// existing. A tab that was already open still holds the old file list, so the
// next thing it needs — a chart, a scanner, anything loaded on demand — is
// fetched from a URL that is gone. The fetch fails, and because it fails
// during rendering it takes the whole page down.
//
// That is almost certainly what someone sees as "Application error: a
// client-side exception has occurred" shortly after a deploy, and it is not a
// bug in any particular page: nothing is broken except the tab's idea of which
// files exist. One reload fixes it completely.
//
// So this names the error, and allows exactly one automatic reload per tab, so
// that a genuinely missing file cannot turn into a reload loop.

const RELOAD_FLAG = "momentum:reloaded-after-stale-build";

/** Does this error mean "the files this tab is asking for are gone"? */
export function isStaleBuildError(error: { name?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.name === "ChunkLoadError") return true;
  const message = error.message ?? "";
  return (
    /Loading chunk \S+ failed/i.test(message) ||
    /Loading CSS chunk/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

type FlagStore = Pick<Storage, "getItem" | "setItem">;

/**
 * sessionStorage, or null where it isn't reachable — a private window, blocked
 * site data, or a context where touching it throws rather than returning null.
 * Reading the property itself can throw, which is why even that is guarded.
 */
export function sessionFlagStore(): FlagStore | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * True at most once per tab, and only when the flag could actually be written —
 * a reload we can't record is a reload that would repeat forever, so without
 * working storage the answer is no and the person gets the button instead.
 */
export function claimAutoReload(store: FlagStore | null): boolean {
  if (!store) return false;
  try {
    if (store.getItem(RELOAD_FLAG)) return false;
    store.setItem(RELOAD_FLAG, "1");
    return true;
  } catch {
    return false;
  }
}
