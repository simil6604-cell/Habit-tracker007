"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Green "Online" under the app's name, grey "Offline" when the signal goes.
 *
 * It replaced a pill that showed the day's score as "On track" / "Building" /
 * "Needs focus" — three words for a number printed in full two panels below,
 * and a yellow badge sitting over the app's name all day for a perfectly
 * ordinary 49%.
 *
 * It says something real rather than being decoration: this is an installed
 * app that keeps working with no signal, and knowing which side of that line
 * you are on decides whether what you just typed has reached the server.
 *
 * Starts as online and corrects itself once mounted: the server cannot know,
 * and rendering "Offline" first would be a guess that flickers.
 */
export function ConnectionPill({ className }: { className?: string }) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <span
      data-testid="connection-pill"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1",
        online
          ? "bg-success/10 text-success ring-success/20"
          : "bg-surface-muted text-muted ring-border",
        className
      )}
      title={
        online
          ? "Connected — everything you save goes straight to the server."
          : "No connection. You can still read what is already here; anything you write waits until the signal is back."
      }
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", online ? "bg-success" : "bg-muted")} />
      {online ? "Online" : "Offline"}
    </span>
  );
}
