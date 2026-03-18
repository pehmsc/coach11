"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  getSyncQueueCount,
} from "@/lib/pwa/offline-store";
import {
  onSyncQueueChange,
  replaySyncQueue,
} from "@/lib/pwa/background-sync";

// ---------------------------------------------------------------------------
// Online / offline reactive state
// ---------------------------------------------------------------------------

type StatusListener = () => void;

const statusListeners = new Set<StatusListener>();

function subscribeOnlineStatus(callback: StatusListener): () => void {
  const onOnline = () => {
    callback();
  };
  const onOffline = () => {
    callback();
  };
  statusListeners.add(callback);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    statusListeners.delete(callback);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  return true;
}

/**
 * React hook that returns `true` when the device is online.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnlineStatus,
    getOnlineSnapshot,
    getServerSnapshot,
  );
}

// ---------------------------------------------------------------------------
// Pending sync count reactive state
// ---------------------------------------------------------------------------

let cachedPendingCount = 0;
const pendingListeners = new Set<StatusListener>();

function notifyPendingListeners() {
  pendingListeners.forEach((fn) => fn());
}

// Listen to sync queue changes from background-sync module.
onSyncQueueChange((count) => {
  cachedPendingCount = count;
  notifyPendingListeners();
});

function subscribePendingCount(callback: StatusListener): () => void {
  pendingListeners.add(callback);
  return () => {
    pendingListeners.delete(callback);
  };
}

function getPendingCountSnapshot(): number {
  return cachedPendingCount;
}

function getPendingCountServerSnapshot(): number {
  return 0;
}

/**
 * React hook that returns the number of pending offline mutations.
 */
export function usePendingSyncCount(): number {
  const count = useSyncExternalStore(
    subscribePendingCount,
    getPendingCountSnapshot,
    getPendingCountServerSnapshot,
  );

  // Load initial count on mount.
  useEffect(() => {
    void getSyncQueueCount().then((c) => {
      cachedPendingCount = c;
      notifyPendingListeners();
    });
  }, []);

  return count;
}

/**
 * Hook that automatically replays the sync queue when the device comes back online.
 */
export function useAutoReplayOnReconnect(): void {
  const isOnline = useOnlineStatus();

  const replay = useCallback(async () => {
    const count = await getSyncQueueCount();
    if (count > 0) {
      await replaySyncQueue();
    }
  }, []);

  useEffect(() => {
    if (isOnline) {
      void replay();
    }
  }, [isOnline, replay]);
}
