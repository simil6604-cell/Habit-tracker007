"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Keeping the screen awake while a lesson is being recorded.
 *
 * This is the single biggest cause of a half-recorded lesson, and the page
 * used to simply warn about it: a phone that locks its screen suspends the
 * page, and speech recognition stops with it. The student is watching the
 * teacher, not the screen, and finds out at the end that twenty minutes are
 * missing.
 *
 * The Screen Wake Lock API is the browser's own answer. It is not
 * everywhere — Chrome on Android and Safari 16.4 upwards have it, older
 * browsers do not — so this reports whether it is actually held, and the
 * recorder says the old warning only when it is not.
 *
 * A lock is dropped by the browser whenever the page is hidden (switching
 * apps, or the screen going off anyway), so it is taken again when the page
 * comes back. Without that, one glance at a message would end it for the
 * rest of the lesson.
 */
export type WakeLockState = {
  /** Whether this browser offers wake locks at all. */
  supported: boolean;
  /** Whether one is held right now. */
  held: boolean;
};

type Sentinel = { release: () => Promise<void>; addEventListener: (type: string, listener: () => void) => void };

function wakeLockApi(): { request: (type: "screen") => Promise<Sentinel> } | null {
  if (typeof navigator === "undefined") return null;
  const api = (navigator as unknown as { wakeLock?: { request: (type: "screen") => Promise<Sentinel> } }).wakeLock;
  return api ?? null;
}

export function useWakeLock(active: boolean): WakeLockState {
  const [supported, setSupported] = useState(false);
  const [held, setHeld] = useState(false);
  const sentinelRef = useRef<Sentinel | null>(null);

  useEffect(() => setSupported(Boolean(wakeLockApi())), []);

  const release = useCallback(() => {
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    setHeld(false);
    if (sentinel) void sentinel.release().catch(() => {});
  }, []);

  const acquire = useCallback(async () => {
    const api = wakeLockApi();
    if (!api || sentinelRef.current) return;
    try {
      const sentinel = await api.request("screen");
      sentinelRef.current = sentinel;
      setHeld(true);
      // The browser releases it by itself when the page is hidden; this is
      // how we find out rather than believing we still hold one.
      sentinel.addEventListener("release", () => {
        if (sentinelRef.current === sentinel) {
          sentinelRef.current = null;
          setHeld(false);
        }
      });
    } catch {
      // Refused (not a user gesture, battery saver, an unsupported
      // surface). The recording is unaffected; only the warning changes.
      setHeld(false);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      release();
      return;
    }
    void acquire();

    // Taken again when the page comes back: a lock dropped while hidden
    // would otherwise stay dropped for the rest of the lesson.
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      release();
    };
  }, [active, acquire, release]);

  return { supported, held };
}
