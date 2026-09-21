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
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Skipping registration is not enough. A production build run earlier on
      // this same origin — localhost:3000 for both `npm start` and `npm run
      // dev` — leaves a worker installed that keeps controlling the dev
      // server, caching its unhashed chunks on first hit and serving them
      // forever. That is exactly the broken Fast Refresh this guard is
      // supposed to prevent, so the worker is removed rather than ignored.
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) registration.unregister();
      });
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
      }
      return;
    }

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
