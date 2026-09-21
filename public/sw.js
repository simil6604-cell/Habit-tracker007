/*
 * Momentum's service worker.
 *
 * The app is installed to a phone's home screen, so without this it is an icon
 * that opens a browser error page the moment the signal drops — in a corridor,
 * on the bus, in a gym basement. That is the whole job here: make a dead
 * connection look like the app saying so, rather than like the app being
 * broken.
 *
 * What it deliberately does NOT do is cache pages. Every page in this app is
 * somebody's school marks, weight and photos, and a cached copy on a shared or
 * borrowed phone outlives the sign-out that was supposed to end the session.
 * So the cache holds exactly two things: the build's own static files, which
 * are the same for everybody, and one offline page that knows nothing.
 *
 * Bumping CACHE_VERSION retires every older cache on the next activation.
 *
 * A note on staleness: after a deploy this worker keeps serving the offline
 * page it cached at install, which points at that build's hashed CSS and JS.
 * That is fine precisely because those files are in the same cache — page and
 * assets go stale together, so the offline page still looks like the app. It
 * refreshes when this file changes and the worker reinstalls.
 */

const CACHE_VERSION = "momentum-v1";
const OFFLINE_URL = "/offline";

// Same for every account, immutable per build: safe to keep, and the reason an
// offline app looks like an app instead of unstyled text.
const PRECACHE = [OFFLINE_URL, "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // One failed file must not fail the whole install — an icon that 404s
      // would otherwise leave the app with no service worker at all.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response);
          } catch {
            // Offline during install: it will be fetched on the first hit.
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE_VERSION) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

/** Static files of this build: hashed by Next, so a hit is always correct. */
function isBuildAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isPrecached(url) {
  return PRECACHE.includes(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Personal data, all of it: pages, uploaded photos, every API route. None of
  // it is ever written to the cache.
  if (url.pathname.startsWith("/uploads/") || url.pathname.startsWith("/api/")) return;

  if (isBuildAsset(url) || isPrecached(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE_VERSION);
            await cache.put(request, response.clone());
          }
          return response;
        } catch (err) {
          // A missing asset offline is not something we can invent.
          throw err;
        }
      })()
    );
    return;
  }

  // Everything else is a page: always from the network, because it is the
  // user's own data and it must be current. When the network is gone, the
  // offline page explains that instead of the browser's error.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const offline = await caches.match(OFFLINE_URL);
          return (
            offline ??
            new Response("<!doctype html><title>Offline</title><p>You are offline.</p>", {
              status: 503,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            })
          );
        }
      })()
    );
  }
});
