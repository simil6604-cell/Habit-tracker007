"use client";

import { useEffect } from "react";
import { claimAutoReload, isStaleBuildError, sessionFlagStore } from "@/lib/utils/stale-build";

/**
 * The last resort: the layout itself failed, so there is no app shell to put
 * a message inside and this file has to carry its own html and body.
 *
 * Styled inline rather than with the app's classes, because whatever broke
 * may be the thing that loads them.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = isStaleBuildError(error);

  useEffect(() => {
    console.error("The app failed to render:", error);
    if (stale && claimAutoReload(sessionFlagStore())) {
      window.location.reload();
    }
  }, [error, stale]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#050506", color: "#e7e7ea", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: "32rem", margin: "0 auto", padding: "4rem 1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: 0 }}>
            {stale ? "The app was updated" : "The app didn't start"}
          </h1>
          <p style={{ color: "#9a9aa2", lineHeight: 1.6 }}>
            {stale
              ? "This tab was still running the previous version. Reloading picks up the new one — your data is untouched."
              : "Something failed before any page could be drawn. Your data is untouched — this is the app failing to display, not failing to keep things."}
          </p>
          <button
            type="button"
            onClick={stale ? () => window.location.reload() : reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.6rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #2a2a31",
              background: "#15151a",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            {stale ? "Reload the app" : "Try again"}
          </button>
          {error.digest && (
            <p style={{ marginTop: "1.5rem", fontSize: "0.75rem", color: "#6c6c75" }}>Reference: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
