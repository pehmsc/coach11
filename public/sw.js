const SW_VERSION = "coach11-pwa-v1";
const STATIC_CACHE = `coach11-static-${SW_VERSION}`;
const OFFLINE_URL = "/offline.html";
const PUSH_FEATURE_ENABLED = false;

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon-180.png",
];

function isCacheableAsset(url) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/icons/")) return true;
  if (url.pathname === "/manifest.webmanifest") return true;

  return /\.(?:css|js|png|svg|jpg|jpeg|webp|avif|gif|ico|woff2?)$/i.test(
    url.pathname,
  );
}

function shouldBypassRequest(request, url) {
  if (request.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/_next/data/")) return true;
  if (url.pathname.startsWith("/auth")) return true;
  if (url.pathname.startsWith("/login")) return true;
  if (url.pathname.startsWith("/register")) return true;
  if (url.pathname.startsWith("/invite")) return true;
  if (request.headers.get("x-middleware-prefetch") === "1") return true;

  return false;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type !== "error") {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return Response.error();
}

async function handleNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cachedOfflinePage = await caches.match(OFFLINE_URL);
    return cachedOfflinePage || Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache.addAll(
          PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })),
        ),
      ),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("coach11-static-") && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (shouldBypassRequest(request, url)) {
    return;
  }

  if (isCacheableAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  if (!PUSH_FEATURE_ENABLED) {
    return;
  }

  event.waitUntil(Promise.resolve());
});

self.addEventListener("notificationclick", (event) => {
  if (!PUSH_FEATURE_ENABLED) {
    return;
  }

  event.notification.close();
  event.waitUntil(Promise.resolve());
});
