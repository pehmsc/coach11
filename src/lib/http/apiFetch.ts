import {
  getCachedResponse,
  setCachedResponse,
  enqueueSync,
} from "@/lib/pwa/offline-store";
import { requestBackgroundSync } from "@/lib/pwa/background-sync";

export class ApiFetchError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiFetchError";
    this.status = status;
    this.data = data;
  }
}

type ApiFetchInit = RequestInit & {
  signal?: AbortSignal;
  /**
   * When `true`, skip offline caching for this request.
   * Useful for endpoints that should never be cached (e.g. auth).
   */
  skipOfflineCache?: boolean;
};

function toErrorMessage(data: unknown, fallback: string) {
  if (typeof data === "string" && data.trim().length > 0) return data;

  if (data && typeof data === "object" && "error" in data) {
    const candidate = (data as { error?: unknown }).error;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return fallback;
}

function parsePayloadFromText(text: string) {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Cacheable API path patterns (GET only)
// ---------------------------------------------------------------------------

/** URL path prefixes that are safe to cache for offline reading. */
const CACHEABLE_GET_PREFIXES = [
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

function isCacheableGet(url: string, method: string): boolean {
  if (method !== "GET") return false;
  const path = url.split("?")[0];
  return CACHEABLE_GET_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Queuable mutation path patterns
// ---------------------------------------------------------------------------

/** URL path prefixes where offline mutations are queued instead of failing. */
const QUEUABLE_MUTATION_PREFIXES = [
  "/api/calendar/events",
  "/api/attendance/",
  "/api/trainings",
  "/api/games/",
  "/api/players",
];

function isQueuableMutation(url: string, method: string): boolean {
  if (method === "GET" || method === "HEAD") return false;
  const path = url.split("?")[0];
  return QUEUABLE_MUTATION_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Offline-aware apiFetch
// ---------------------------------------------------------------------------

function isOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

function hasIndexedDB(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function apiFetch<T>(url: string, init: ApiFetchInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const skipCache = init.skipOfflineCache === true;

  // -----------------------------------------------------------------------
  // Offline mutation → queue for background sync
  // -----------------------------------------------------------------------
  if (isOffline() && hasIndexedDB() && isQueuableMutation(url, method)) {
    const headers: Record<string, string> = {};
    if (init.headers) {
      const h = init.headers as Record<string, string>;
      for (const [k, v] of Object.entries(h)) {
        headers[k] = v;
      }
    }

    await enqueueSync({
      url,
      method,
      headers,
      body: typeof init.body === "string" ? init.body : null,
    });

    void requestBackgroundSync();

    // Return an optimistic "queued" response so the UI can continue.
    return { success: true, offline: true, queued: true } as T;
  }

  // -----------------------------------------------------------------------
  // Attempt the actual fetch
  // -----------------------------------------------------------------------
  try {
    const response = await fetch(url, {
      ...init,
      credentials: init.credentials ?? "include",
    });

    const text = await response.text();
    const payload = parsePayloadFromText(text);

    if (!response.ok) {
      const message = toErrorMessage(
        payload,
        `Pedido falhou com status ${response.status}.`,
      );
      throw new ApiFetchError(message, response.status, payload);
    }

    // Cache successful GET responses for future offline access.
    if (
      !skipCache &&
      hasIndexedDB() &&
      isCacheableGet(url, method) &&
      payload != null
    ) {
      void setCachedResponse(url, payload);
    }

    return payload as T;
  } catch (error) {
    // -----------------------------------------------------------------
    // Network failure on GET → try IndexedDB cache
    // -----------------------------------------------------------------
    if (
      !skipCache &&
      hasIndexedDB() &&
      method === "GET" &&
      isCacheableGet(url, method) &&
      isNetworkError(error)
    ) {
      const cached = await getCachedResponse<T>(url);
      if (cached != null) {
        return cached;
      }
    }

    throw error;
  }
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiFetchError) return false;
  if (error instanceof TypeError) return true; // fetch throws TypeError on network failure
  return false;
}
