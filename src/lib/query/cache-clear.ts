import type { QueryClient } from "@tanstack/react-query";
import { clearAllOfflineData } from "@/lib/pwa/offline-store";

const STORAGE_KEY_HINTS = ["react-query", "tanstack-query", "coach11-query-cache"];

function clearStorageByHints(storage: Storage | null) {
  if (!storage) return;
  const keysToRemove: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (STORAGE_KEY_HINTS.some((hint) => key.includes(hint))) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => storage.removeItem(key));
}

export function clearClientCaches(queryClient?: QueryClient | null) {
  queryClient?.clear();

  if (typeof window === "undefined") return;

  clearStorageByHints(window.localStorage);
  clearStorageByHints(window.sessionStorage);

  // Clear IndexedDB offline data (API cache + sync queue).
  void clearAllOfflineData();

  // Clear service worker API cache.
  void caches.keys().then((keys) =>
    Promise.all(
      keys
        .filter((key) => key.startsWith("coach11-api-"))
        .map((key) => caches.delete(key)),
    ),
  );
}
