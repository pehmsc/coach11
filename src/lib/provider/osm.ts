const DEFAULT_NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const AUTOCOMPLETE_CACHE_TTL_MS = 15 * 60 * 1000;
const RESOLVE_CACHE_TTL_MS = 30 * 60 * 1000;
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 160;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type OsmSearchItem = {
  place_id?: number | string;
  osm_type?: string;
  osm_id?: number | string;
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  type?: string;
};

type OSMCacheStore = {
  autocomplete: Map<string, CacheEntry<OsmSuggestion[]>>;
  resolve: Map<string, CacheEntry<OsmResolvedLocation | null>>;
  queue: Promise<void>;
  nextRequestAt: number;
};

declare global {
  var __coach11OsmCache: OSMCacheStore | undefined;
}

function getCacheStore() {
  if (!globalThis.__coach11OsmCache) {
    globalThis.__coach11OsmCache = {
      autocomplete: new Map(),
      resolve: new Map(),
      queue: Promise.resolve(),
      nextRequestAt: 0,
    };
  }

  return globalThis.__coach11OsmCache;
}

export type OsmSuggestion = {
  placeId: string;
  title: string;
  subtitle: string | null;
  formatted_address: string;
  latitude: number;
  longitude: number;
  osm_place_id: string;
  location_source: "osm";
};

export type OsmResolvedLocation = {
  latitude: number;
  longitude: number;
  formatted_address: string;
  osm_place_id: string;
  location_source: "osm";
};

export function sanitizeAutocompleteQuery(input: string) {
  const normalized = input.replace(/\s+/g, " ").replace(/[^\P{C}\n\t]+/gu, "").trim();
  if (normalized.length < MIN_QUERY_LENGTH) return null;
  return normalized.slice(0, MAX_QUERY_LENGTH);
}

export function isValidOsmPlaceId(value: string) {
  return /^[NWR]\d+$/.test(value);
}

function buildRequestHeaders() {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "https://coach11.app";

  return {
    "User-Agent": `Coach11 OSM Proxy/1.0 (+${appUrl})`,
    "Accept-Language": "pt-PT,pt;q=0.9,en;q=0.8",
    Accept: "application/json",
  };
}

function getBaseUrl() {
  return (
    process.env.OSM_NOMINATIM_BASE_URL?.trim().replace(/\/+$/, "") ||
    DEFAULT_NOMINATIM_BASE_URL
  );
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function splitDisplayName(displayName: string) {
  const [first, ...rest] = displayName.split(",").map((part) => part.trim());
  return {
    title: first || displayName,
    subtitle: rest.length > 0 ? rest.join(", ") : null,
  };
}

export function normalizeOsmSuggestion(item: OsmSearchItem): OsmSuggestion | null {
  const osmTypeRaw = normalizeText(item.osm_type)?.toLowerCase();
  const osmId = normalizeText(item.osm_id) ?? String(item.osm_id ?? "");
  const formattedAddress = normalizeText(item.display_name);
  const latitude = normalizeNumber(item.lat);
  const longitude = normalizeNumber(item.lon);

  if (!formattedAddress || latitude == null || longitude == null) return null;

  const osmTypePrefix =
    osmTypeRaw === "node" ? "N" : osmTypeRaw === "way" ? "W" : osmTypeRaw === "relation" ? "R" : null;

  if (!osmTypePrefix || !/^\d+$/.test(osmId)) return null;

  const osmPlaceId = `${osmTypePrefix}${osmId}`;
  const placeId = isValidOsmPlaceId(String(item.place_id ?? ""))
    ? String(item.place_id)
    : osmPlaceId;
  const { title, subtitle } = splitDisplayName(formattedAddress);

  return {
    placeId,
    title: normalizeText(item.name) || title,
    subtitle,
    formatted_address: formattedAddress,
    latitude,
    longitude,
    osm_place_id: osmPlaceId,
    location_source: "osm",
  };
}

export function normalizeOsmLookupResult(item: OsmSearchItem): OsmResolvedLocation | null {
  const normalized = normalizeOsmSuggestion(item);
  if (!normalized) return null;

  return {
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    formatted_address: normalized.formatted_address,
    osm_place_id: normalized.osm_place_id,
    location_source: "osm",
  };
}

function getCachedValue<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() >= cached.expiresAt) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function setCachedValue<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

async function scheduleNominatimRequest<T>(task: () => Promise<T>) {
  const store = getCacheStore();

  const run = async () => {
    const waitMs = Math.max(0, store.nextRequestAt - Date.now());
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    store.nextRequestAt = Date.now() + 1100;
    return task();
  };

  const nextTask = store.queue.then(run, run);
  store.queue = nextTask.then(
    () => undefined,
    () => undefined,
  );

  return nextTask;
}

async function fetchJson<T>(url: URL): Promise<T> {
  return scheduleNominatimRequest(async () => {
    const response = await fetch(url.toString(), {
      headers: buildRequestHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error(`osm_fetch_failed:${response.status}`);
    }

    return response.json() as Promise<T>;
  });
}

export async function autocomplete(query: string, limit = 5): Promise<OsmSuggestion[]> {
  const sanitizedQuery = sanitizeAutocompleteQuery(query);
  if (!sanitizedQuery) return [];

  const normalizedLimit = Math.min(Math.max(limit, 1), 5);
  const cacheKey = `${sanitizedQuery.toLowerCase()}::${normalizedLimit}`;
  const store = getCacheStore();
  const cached = getCachedValue(store.autocomplete, cacheKey);
  if (cached) return cached;

  const url = new URL("/search", getBaseUrl());
  url.searchParams.set("q", sanitizedQuery);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", String(normalizedLimit));
  url.searchParams.set("dedupe", "1");

  const payload = await fetchJson<OsmSearchItem[]>(url);
  const results = payload
    .map(normalizeOsmSuggestion)
    .filter((entry): entry is OsmSuggestion => !!entry);

  setCachedValue(store.autocomplete, cacheKey, results, AUTOCOMPLETE_CACHE_TTL_MS);
  results.forEach((entry) => {
    setCachedValue(
      store.resolve,
      entry.osm_place_id,
      {
        latitude: entry.latitude,
        longitude: entry.longitude,
        formatted_address: entry.formatted_address,
        osm_place_id: entry.osm_place_id,
        location_source: "osm",
      },
      RESOLVE_CACHE_TTL_MS,
    );
  });

  return results;
}

export async function resolve(placeId: string): Promise<OsmResolvedLocation | null> {
  const normalizedPlaceId = placeId.trim().toUpperCase();
  if (!isValidOsmPlaceId(normalizedPlaceId)) return null;

  const store = getCacheStore();
  const cached = getCachedValue(store.resolve, normalizedPlaceId);
  if (cached !== null) return cached;

  const url = new URL("/lookup", getBaseUrl());
  url.searchParams.set("osm_ids", normalizedPlaceId);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");

  const payload = await fetchJson<OsmSearchItem[]>(url);
  const normalized = normalizeOsmLookupResult(payload[0] || null);

  setCachedValue(store.resolve, normalizedPlaceId, normalized, RESOLVE_CACHE_TTL_MS);
  return normalized;
}
