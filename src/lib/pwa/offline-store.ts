/**
 * IndexedDB-backed offline store for API response caching and sync queue.
 *
 * Two object stores:
 *   - `api-cache`  – keyed by URL, stores JSON responses with timestamps
 *   - `sync-queue` – auto-incremented, stores pending mutations
 */

const DB_NAME = "coach11-offline";
const DB_VERSION = 1;
const API_CACHE_STORE = "api-cache";
const SYNC_QUEUE_STORE = "sync-queue";

/** Maximum age (ms) for a cached API response before it is considered stale. */
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CachedResponse {
  url: string;
  data: unknown;
  timestamp: number;
  /** Optional per-entry TTL override (ms). */
  maxAge?: number;
}

export interface SyncQueueEntry {
  id?: number;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  createdAt: number;
  /** Number of retry attempts so far. */
  retries: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(API_CACHE_STORE)) {
        db.createObjectStore(API_CACHE_STORE, { keyPath: "url" });
      }
      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const store = db.createObjectStore(SYNC_QUEUE_STORE, {
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

function tx(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

// ---------------------------------------------------------------------------
// API Cache operations
// ---------------------------------------------------------------------------

export async function getCachedResponse<T = unknown>(
  url: string,
  maxAge = DEFAULT_MAX_AGE_MS,
): Promise<T | null> {
  try {
    const db = await openDB();
    return await new Promise<T | null>((resolve, reject) => {
      const request = tx(db, API_CACHE_STORE, "readonly").get(url);
      request.onsuccess = () => {
        const entry = request.result as CachedResponse | undefined;
        if (!entry) {
          resolve(null);
          return;
        }
        const entryMaxAge = entry.maxAge ?? maxAge;
        if (Date.now() - entry.timestamp > entryMaxAge) {
          resolve(null);
          return;
        }
        resolve(entry.data as T);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function setCachedResponse(
  url: string,
  data: unknown,
  maxAge?: number,
): Promise<void> {
  try {
    const db = await openDB();
    const entry: CachedResponse = {
      url,
      data,
      timestamp: Date.now(),
      ...(maxAge != null ? { maxAge } : {}),
    };
    await new Promise<void>((resolve, reject) => {
      const request = tx(db, API_CACHE_STORE, "readwrite").put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Silently ignore cache write failures.
  }
}

export async function clearApiCache(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const request = tx(db, API_CACHE_STORE, "readwrite").clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Ignore.
  }
}

// ---------------------------------------------------------------------------
// Sync Queue operations
// ---------------------------------------------------------------------------

export async function enqueueSync(
  entry: Omit<SyncQueueEntry, "id" | "retries" | "createdAt">,
): Promise<number> {
  const db = await openDB();
  const record: Omit<SyncQueueEntry, "id"> = {
    ...entry,
    createdAt: Date.now(),
    retries: 0,
  };
  return new Promise<number>((resolve, reject) => {
    const request = tx(db, SYNC_QUEUE_STORE, "readwrite").add(record);
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllSyncEntries(): Promise<SyncQueueEntry[]> {
  try {
    const db = await openDB();
    return await new Promise<SyncQueueEntry[]>((resolve, reject) => {
      const request = tx(db, SYNC_QUEUE_STORE, "readonly")
        .index("createdAt")
        .getAll();
      request.onsuccess = () =>
        resolve((request.result as SyncQueueEntry[]) || []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function removeSyncEntry(id: number): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const request = tx(db, SYNC_QUEUE_STORE, "readwrite").delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Ignore.
  }
}

export async function updateSyncEntryRetries(
  id: number,
  retries: number,
): Promise<void> {
  try {
    const db = await openDB();
    const store = tx(db, SYNC_QUEUE_STORE, "readwrite");
    const entry = await new Promise<SyncQueueEntry | undefined>(
      (resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () =>
          resolve(request.result as SyncQueueEntry | undefined);
        request.onerror = () => reject(request.error);
      },
    );
    if (!entry) return;
    entry.retries = retries;
    await new Promise<void>((resolve, reject) => {
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Ignore.
  }
}

export async function clearSyncQueue(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const request = tx(db, SYNC_QUEUE_STORE, "readwrite").clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Ignore.
  }
}

export async function getSyncQueueCount(): Promise<number> {
  try {
    const db = await openDB();
    return await new Promise<number>((resolve, reject) => {
      const request = tx(db, SYNC_QUEUE_STORE, "readonly").count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return 0;
  }
}

/**
 * Delete all IndexedDB data (both caches and sync queue).
 * Called on sign-out.
 */
export async function clearAllOfflineData(): Promise<void> {
  await Promise.all([clearApiCache(), clearSyncQueue()]);
}
