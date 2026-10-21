"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { claimAutoReload, isStaleBuildError, sessionFlagStore } from "@/lib/utils/stale-build";

/**
 * One page failed. The rest of the app has not.
 *
 * Without this file Next.js falls back to its own bare page — a white screen
 * reading "Application error: a client-side exception has occurred", with no
 * navigation and no way anywhere. That is what someone saw when a page threw:
 * the whole app, gone, with nothing to press.
 *
 * Keeping the sidebar means a broken page is one bad page rather than a dead
 * app, and the way out is a link rather than typing a URL from memory.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleBuildError(error);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    console.error("Page failed to render:", error);
    // A new version was deployed under an open tab. Nothing is broken; the tab
    // is asking for files that no longer exist. Reloading is the fix, so do it
    // rather than explaining it — once per tab, so a file that really is gone
    // can't become a loop.
    if (stale && claimAutoReload(sessionFlagStore())) {
      setReloading(true);
      window.location.reload();
    }
  }, [error, stale]);

  if (stale) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">The app was updated</h1>
        <p className="mt-2 text-muted">
          {reloading
            ? "Loading the new version…"
            : "This tab was still running the previous version. Reloading picks up the new one — nothing you saved is affected."}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button type="button" onClick={() => window.location.reload()}>
            Reload the app
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">This page didn&apos;t load</h1>
      <p className="mt-2 text-muted">
        Something on it failed to render. Nothing you have saved is affected — the rest of the app still works.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="button" onClick={reset}>Try this page again</Button>
        <Link href="/"><Button variant="outline">Go to the start</Button></Link>
      </div>
      {error.digest && (
        // The digest is how a server-side cause is found in the host's logs;
        // without it there is nothing to search for.
        <p className="mt-6 text-xs text-muted">Reference: {error.digest}</p>
      )}
    </div>
  );
}
