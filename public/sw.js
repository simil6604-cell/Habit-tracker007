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
 */

const CACHE_VERSION = "momentum-v2";
const OFFLINE_URL = "/offline";

/** Same for every account: safe to keep, and what makes the offline page look like the app. */
const PRECACHE = [OFFLINE_URL, "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

/**
 * How many build files to keep. Every deploy adds a new set of hashed files
 * under a new name, and nothing ever invalidates the old ones, so without a
 * ceiling this cache grows for the life of the installation. The oldest go
 * first; they belong to builds nobody is running any more.
 */
const MAX_STATIC_ENTRIES = 240;

function isBuildAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

async function cacheBuildAsset(request, response) {
  const cache = await caches.open(CACHE_VERSION);
  await cache.put(request, response);
  await pruneBuildAssets(cache);
}

async function pruneBuildAssets(cache) {
  const keys = await cache.keys();
  const assets = keys.filter((request) => isBuildAsset(new URL(request.url)));
  // Cache.keys() returns insertion order, so the front of the list is the
  // oldest thing here.
  for (const request of assets.slice(0, Math.max(0, assets.length - MAX_STATIC_ENTRIES))) {
    await cache.delete(request);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);

      // One failed file must not fail the whole install — an icon that 404s
      // would otherwise leave the app with no service worker at all.
      for (const url of PRECACHE) {
        try {
          const response = await fetch(url, { cache: "reload" });
          if (response.ok) await cache.put(url, response);
        } catch {
          // Offline during install: fetched on the first hit instead.
        }
      }

      await self.skipWaiting();
    })()
  );
});

/*
 * A note on what is NOT precached here: the offline page's own scripts.
 *
 * A review flagged that the page would render from its server HTML and then
 * fail to load its JavaScript, filling the console with chunk errors at the
 * moment the app is meant to look calm. Reproducing it says otherwise — the
 * offline page shares its build files with every other page, including the
 * login screen, so one visit of any kind puts them in the cache below. With
 * the precaching of those files deliberately disabled, a fresh browser that
 * had only ever opened /login still showed the offline page complete, with
 * nothing it asked for missing.
 *
 * So there is no extra code for it, and there is a test instead: "a phone that
 * has only ever opened the app once still gets the offline page" fails the day
 * that stops being true.
 */

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE_VERSION) await caches.delete(key);
      }
      await pruneBuildAssets(await caches.open(CACHE_VERSION));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Personal data, all of it: pages, uploaded photos, every API route. None of
  // it is ever written to the cache.
  if (url.pathname.startsWith("/uploads/") || url.pathname.startsWith("/api/")) return;

  /*
   * Navigations come first, including a navigation to the offline page itself.
   * Sending that one down the asset path meant an empty cache rethrew the
   * network error and the browser's own error page appeared — the one thing
   * this file exists to prevent. Going to the network first also means a
   * deployed change to the offline page is seen while online, rather than the
   * copy cached when the worker installed.
   */
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const live = await fetch(request);
          // Refresh the stored copy whenever the real one is fetched, so the
          // page kept for offline use is the current one.
          if (live.ok && url.pathname === OFFLINE_URL) {
            const cache = await caches.open(CACHE_VERSION);
            await cache.put(OFFLINE_URL, live.clone());
          }
          return live;
        } catch {
          const offline = await caches.match(OFFLINE_URL);
          return (
            offline ??
            new Response(
              "<!doctype html><meta charset=utf-8><title>Offline</title><h1>You're offline</h1>" +
                "<p>Momentum needs a connection to show your data. Nothing has been lost.</p>",
              { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
            )
          );
        }
      })()
    );
    return;
  }

  // Build files are hashed per build, so a hit is always the right answer.
  if (isBuildAsset(url) || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cacheBuildAsset(request, response.clone());
        return response;
      })()
    );
  }
});
