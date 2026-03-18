const SW_VERSION = "coach11-pwa-v4";
const STATIC_CACHE = `coach11-static-${SW_VERSION}`;
const API_CACHE = `coach11-api-${SW_VERSION}`;
const OFFLINE_URL = "/offline.html";
const SYNC_TAG = "coach11-background-sync";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon-180.png",
];

// ---------------------------------------------------------------------------
// Cacheable API paths (GET responses cached for offline reading)
// ---------------------------------------------------------------------------

const CACHEABLE_API_PREFIXES = [
  "/api/me/context",
  "/api/trainings",
  "/api/games",
  "/api/calendar/events",
  "/api/players",
  "/api/attendance/today",
  "/api/competitions",
  "/api/exercises",
  "/api/statistics/",
  "/api/notifications",
];

function isCacheableApiPath(pathname) {
  return CACHEABLE_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Static asset helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Cache strategies
// ---------------------------------------------------------------------------

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

/**
 * Network-first strategy for API GET requests.
 * On network success: cache the response in API_CACHE and return it.
 * On network failure: return the cached version if available.
 */
async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    return new Response(
      JSON.stringify({ success: false, offline: true, error: "Sem ligação à internet." }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

async function handlePublicNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cachedOfflinePage = await caches.match(OFFLINE_URL);
    return cachedOfflinePage || Response.error();
  }
}

// ---------------------------------------------------------------------------
// Install & activate
// ---------------------------------------------------------------------------

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
            .filter(
              (key) =>
                (key.startsWith("coach11-static-") && key !== STATIC_CACHE) ||
                (key.startsWith("coach11-api-") && key !== API_CACHE),
            )
            .map((key) => caches.delete(key)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

// ---------------------------------------------------------------------------
// Fetch handler
// ---------------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Navigation requests.
  if (request.mode === "navigate") {
    if (isPublicNavigationPath(url.pathname)) {
      event.respondWith(handlePublicNavigation(request));
      return;
    }

    event.respondWith(fetch(request));
    return;
  }

  // API GET requests — network-first with offline fallback.
  if (
    request.method === "GET" &&
    url.origin === self.location.origin &&
    isCacheableApiPath(url.pathname)
  ) {
    event.respondWith(networkFirstApi(request));
    return;
  }

  // Static assets — stale-while-revalidate.
  if (shouldBypassStaticCache(request, url)) {
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

// ---------------------------------------------------------------------------
// Background sync
// ---------------------------------------------------------------------------

self.addEventListener("sync", (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replaySyncQueueFromSW());
  }
});

/**
 * Replay the sync queue from within the service worker.
 * Opens IndexedDB directly since we can't import TS modules here.
 */
async function replaySyncQueueFromSW() {
  const DB_NAME = "coach11-offline";
  const DB_VERSION = 1;
  const STORE = "sync-queue";
  const MAX_RETRIES = 5;

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("api-cache")) {
          db.createObjectStore("api-cache", { keyPath: "url" });
        }
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function getAllEntries(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).index("createdAt").getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  function removeEntry(db, id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const request = tx.objectStore(STORE).delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function updateRetries(db, entry) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const request = tx.objectStore(STORE).put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  try {
    const db = await openDB();
    const entries = await getAllEntries(db);

    for (const entry of entries) {
      if (entry.retries >= MAX_RETRIES) {
        await removeEntry(db, entry.id);
        continue;
      }

      try {
        const response = await fetch(entry.url, {
          method: entry.method,
          headers: entry.headers,
          body: entry.body,
          credentials: "include",
        });

        if (response.ok || response.status === 409) {
          await removeEntry(db, entry.id);
        } else if (response.status >= 500) {
          entry.retries += 1;
          await updateRetries(db, entry);
        } else {
          await removeEntry(db, entry.id);
        }
      } catch {
        entry.retries += 1;
        await updateRetries(db, entry);
      }
    }

    // Notify all clients that the sync queue has changed.
    const clientList = await self.clients.matchAll({ type: "window" });
    clientList.forEach((client) => {
      client.postMessage({ type: "COACH11_SYNC_COMPLETE" });
    });
  } catch {
    // Ignore DB errors in SW.
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

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
