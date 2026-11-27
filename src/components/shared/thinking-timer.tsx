"use client";

import { useEffect, useState } from "react";

/**
 * How long you have been waiting, in seconds.
 *
 * "Reading and thinking…" on its own is the same three words at two
 * seconds and at forty, so a slow answer and a broken app look identical —
 * and the honest report that comes back is "it takes too long", with no
 * number in it, about a wait nobody could measure.
 *
 * The seconds appear only after a few have passed. A counter that starts
 * ticking the instant you press send makes a fast answer feel like a wait,
 * which is the opposite of the point.
 */
export const QUIET_SECONDS = 3;

export function ThinkingTimer({ label, slowAfter = 25 }: { label: string; slowAfter?: number }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <p className="text-xs text-muted" role="status" data-testid="thinking-timer">
      {label}
      {seconds >= QUIET_SECONDS && <span className="tabular-nums"> {seconds}s</span>}
      {seconds >= slowAfter && (
        // Said once it is genuinely long, because at that point the useful
        // thing is knowing it is still going rather than stuck.
        <span className="ml-1">— a long one, still going.</span>
      )}
    </p>
  );
}
