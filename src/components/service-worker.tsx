"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, which exists so the installed app says "you're
 * offline" instead of showing the browser's error page.
 *
 * Production only: in development the same registration intercepts the dev
 * server's own requests and fights with hot reload.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // An app that works online and not offline is still the app working;
        // there is nothing useful to tell the user here.
      });
    };

    // After load, so registering never competes with the first paint.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
