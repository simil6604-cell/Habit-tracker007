"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { onActionFailure } from "@/lib/utils/action-error-bus";

/**
 * One line, at the bottom of the app, when a button did not get through.
 *
 * It exists so that the alternative — the whole page being replaced by
 * "This page didn't load" — never has to be the way someone finds out.
 * Every button that runs through useSafeTransition reports here.
 *
 * It clears itself after a while: a failure that scrolled past half an hour
 * ago is not news, and a message you have to dismiss to get on with things
 * is its own small annoyance.
 */
const CLEARS_AFTER = 12_000;

export function ActionFailureStrip() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => onActionFailure(setMessage), []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), CLEARS_AFTER);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <div
      role="alert"
      data-testid="action-failure"
      // Above the bottom navigation on a phone, where it would otherwise
      // sit behind it and be read by nobody.
      className="fixed inset-x-3 bottom-20 z-50 flex items-start gap-3 rounded-xl border border-danger/40 bg-surface px-3.5 py-2.5 text-sm shadow-lg sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-sm"
    >
      <span className="min-w-0 flex-1 text-danger">{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setMessage(null)}
        className="shrink-0 text-muted transition hover:text-foreground"
      >
        <X size={14} />
      </button>
    </div>
  );
}
