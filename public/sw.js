const SW_VERSION = "coach11-pwa-v3";
const STATIC_CACHE = `coach11-static-${SW_VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon-180.png",
];

function isStaticCacheablePath(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/manifest.webmanifest" ||
    pathname === OFFLINE_URL
  );
}

function isPublicNavigationPath(pathname) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/register" ||
    pathname.startsWith("/register/") ||
    pathname === "/invite" ||
    pathname.startsWith("/invite/")
  );
}

function shouldBypassStaticCache(request, url) {
  if (request.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  if (!isStaticCacheablePath(url.pathname)) return true;
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/_next/data/")) return true;
  if (request.headers.get("authorization")) return true;
  if (request.credentials === "include") return true;
  if (request.mode === "navigate") return true;
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

async function handlePublicNavigation(request) {
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
    if (isPublicNavigationPath(url.pathname)) {
      event.respondWith(handlePublicNavigation(request));
      return;
    }

    event.respondWith(fetch(request));
    return;
  }

  if (shouldBypassStaticCache(request, url)) {
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {
        type: "notification",
        title: "Coach11",
        body: "",
        url: "/notifications",
        badgeCount: null,
      };

      try {
        payload = {
          ...payload,
          ...(event.data ? event.data.json() : {}),
        };
      } catch {
        // Ignore malformed payloads and show a safe default notification.
      }

      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      clientList.forEach((client) => {
        client.postMessage({
          type: "COACH11_PUSH_RECEIVED",
          badgeCount:
            typeof payload.badgeCount === "number" ? payload.badgeCount : undefined,
        });
      });

      if (typeof payload.badgeCount === "number") {
        const badgeApi =
          self.registration.setAppBadge ||
          self.navigator?.setAppBadge ||
          null;
        if (badgeApi) {
          await badgeApi.call(
            self.registration.setAppBadge ? self.registration : self.navigator,
            payload.badgeCount,
          ).catch(() => null);
        }
      }

      await self.registration.showNotification(payload.title || "Coach11", {
        body: payload.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: payload.type || "coach11-notification",
        data: {
          url: payload.url || "/notifications",
          badgeCount:
            typeof payload.badgeCount === "number" ? payload.badgeCount : null,
        },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const targetUrl =
        event.notification?.data?.url && typeof event.notification.data.url === "string"
          ? event.notification.data.url
          : "/notifications";

      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clientList) {
        if ("focus" in client) {
          if (client.url === new URL(targetUrl, self.location.origin).toString()) {
            await client.focus();
            return;
          }
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
