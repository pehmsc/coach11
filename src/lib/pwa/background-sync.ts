/**
 * Background sync manager.
 *
 * Replays queued mutations when the device comes back online.
 * Works with both the Background Sync API (service worker `sync` event)
 * and a client-side fallback for browsers that don't support it.
 */

import {
  getAllSyncEntries,
  removeSyncEntry,
  updateSyncEntryRetries,
  getSyncQueueCount,
} from "@/lib/pwa/offline-store";

const MAX_RETRIES = 5;
const SYNC_TAG = "coach11-background-sync";

type SyncListener = (pendingCount: number) => void;

const listeners = new Set<SyncListener>();

export function onSyncQueueChange(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function notifyListeners() {
  const count = await getSyncQueueCount();
  listeners.forEach((fn) => fn(count));
}

/**
 * Request the service worker to trigger a background sync.
 * Falls back to immediate replay if the Background Sync API is unavailable.
 */
export async function requestBackgroundSync(): Promise<void> {
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as ServiceWorkerRegistration & { sync: { register: (tag: string) => Promise<void> } }).sync.register(SYNC_TAG);
      return;
    } catch {
      // Fall through to client-side replay.
    }
  }

  // Client-side fallback: replay immediately if online.
  if (navigator.onLine) {
    await replaySyncQueue();
  }
}

/**
 * Replay all pending mutations in the sync queue, oldest first.
 * Called from the service worker `sync` event or client-side fallback.
 */
export async function replaySyncQueue(): Promise<void> {
  const entries = await getAllSyncEntries();

  for (const entry of entries) {
    if (entry.retries >= MAX_RETRIES) {
      // Drop entries that have exceeded the retry limit.
      await removeSyncEntry(entry.id!);
      await notifyListeners();
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
        // Success or conflict (already applied) – remove from queue.
        await removeSyncEntry(entry.id!);
        await notifyListeners();
      } else if (response.status >= 500) {
        // Server error – bump retries and leave for next sync.
        await updateSyncEntryRetries(entry.id!, entry.retries + 1);
      } else {
        // 4xx client error – discard, it won't succeed on retry.
        await removeSyncEntry(entry.id!);
        await notifyListeners();
      }
    } catch {
      // Network failure – bump retries.
      await updateSyncEntryRetries(entry.id!, entry.retries + 1);
      // Stop processing further entries if offline.
      if (!navigator.onLine) break;
    }
  }

  await notifyListeners();
}

export { SYNC_TAG };
