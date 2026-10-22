// The cache name carries a build id so every new build replaces the previous
// cache instead of serving stale assets to returning visitors.
const BUILD = "ad3469cb0a5b";
const CACHE = "little-meenah-shell-" + BUILD;
const ROOT = new URL("./", self.location).href;

self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch(ROOT, { cache: "reload" });
      if (!response.ok) return;
      await cache.put(ROOT, response.clone());
      const html = await response.text();
      for (const match of html.matchAll(/(?:src|href)="([^"\s]+assets[^"\s]+)"/g)) {
        const url = new URL(match[1], ROOT);
        if (url.origin === self.location.origin)
          await cache.add(url.href).catch(() => {});
      }
      await self.skipWaiting();
    })(),
  ),
);

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("little-meenah-shell-") && name !== CACHE)
          await caches.delete(name);
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (
    req.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const response = await fetch(req);
        if (response.ok) {
          if (url.pathname.includes("/assets/"))
            await cache.put(req, response.clone());
          else if (req.mode === "navigate")
            // Cache navigations under the root so OAuth callbacks and deep
            // links never leave query strings behind in the cache keys.
            await cache.put(ROOT, response.clone());
        }
        return response;
      } catch {
        const cached = await cache.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const root = await cache.match(ROOT);
          if (root) return root;
        }
        throw Error("Offline resource unavailable");
      }
    })(),
  );
});
