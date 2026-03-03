import {
  findLocationAliasSuggestions,
  isLocationAliasPlaceId,
  resolveLocationAlias,
} from "./location-aliases";

const DEFAULT_NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const AUTOCOMPLETE_CACHE_TTL_MS = 15 * 60 * 1000;
const RESOLVE_CACHE_TTL_MS = 30 * 60 * 1000;
const MIN_QUERY_LENGTH = 3;
const MAX_QUERY_LENGTH = 160;
const PORTUGUESE_CONNECTORS = ["da", "de", "do"] as const;

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
  reverse: Map<string, CacheEntry<OsmResolvedLocation | null>>;
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
      reverse: new Map(),
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
  location_source: "osm" | "manual";
};

export type OsmResolvedLocation = {
  latitude: number;
  longitude: number;
  formatted_address: string;
  osm_place_id: string;
  location_source: "osm" | "manual";
};

export function sanitizeAutocompleteQuery(input: string) {
  const normalized = input.replace(/\s+/g, " ").replace(/[^\P{C}\n\t]+/gu, "").trim();
  if (normalized.length < MIN_QUERY_LENGTH) return null;
  return normalized.slice(0, MAX_QUERY_LENGTH);
}

export function isValidOsmPlaceId(value: string) {
  return /^[NWR]\d+$/.test(value);
}

export function isValidLocationPlaceId(value: string) {
  return isValidOsmPlaceId(value) || isLocationAliasPlaceId(value);
}

export function buildAutocompleteQueries(query: string) {
  const normalizedQuery = sanitizeAutocompleteQuery(query);
  if (!normalizedQuery) return [];

  const variants = new Set<string>([normalizedQuery]);
  const words = normalizedQuery.split(" ").filter(Boolean);
  const hasPortugalSuffix = /,\s*portugal$/i.test(normalizedQuery);

  if (!hasPortugalSuffix) {
    variants.add(`${normalizedQuery}, Portugal`);
  }

  if (words.length >= 3) {
    const penultimateWord = words[words.length - 2]?.toLowerCase();
    if (!PORTUGUESE_CONNECTORS.includes(penultimateWord as (typeof PORTUGUESE_CONNECTORS)[number])) {
      for (const connector of PORTUGUESE_CONNECTORS) {
        const connectorVariant = [
          ...words.slice(0, -1),
          connector,
          words[words.length - 1],
        ].join(" ");

        variants.add(connectorVariant);
        if (!hasPortugalSuffix) {
          variants.add(`${connectorVariant}, Portugal`);
        }
      }
    }
  }

  return Array.from(variants);
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

function normalizeCoordinateKey(latitude: number, longitude: number) {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
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

  const queryVariants = buildAutocompleteQueries(sanitizedQuery);
  const results: OsmSuggestion[] = [];
  const seenKeys = new Set<string>();
  const aliasResults = findLocationAliasSuggestions(sanitizedQuery, normalizedLimit);

  for (const entry of aliasResults) {
    const key = `${entry.placeId}:${entry.formatted_address}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    results.push(entry);
    setCachedValue(
      store.resolve,
      entry.placeId,
      {
        latitude: entry.latitude,
        longitude: entry.longitude,
        formatted_address: entry.formatted_address,
        osm_place_id: entry.osm_place_id,
        location_source: entry.location_source,
      },
      RESOLVE_CACHE_TTL_MS,
    );
    if (results.length >= normalizedLimit) break;
  }

  for (const queryVariant of queryVariants) {
    if (results.length >= normalizedLimit) break;

    const url = new URL("/search", getBaseUrl());
    url.searchParams.set("q", queryVariant);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("countrycodes", "pt");
    url.searchParams.set("limit", String(normalizedLimit));
    url.searchParams.set("dedupe", "1");

    const payload = await fetchJson<OsmSearchItem[]>(url);
    const normalizedResults = payload
      .map(normalizeOsmSuggestion)
      .filter((entry): entry is OsmSuggestion => !!entry);

    for (const entry of normalizedResults) {
      const key = `${entry.osm_place_id}:${entry.formatted_address}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      results.push(entry);
      if (results.length >= normalizedLimit) break;
    }

    if (results.length >= normalizedLimit) break;
    if (results.length > 0) break;
  }

  setCachedValue(store.autocomplete, cacheKey, results, AUTOCOMPLETE_CACHE_TTL_MS);
  results.forEach((entry) => {
    const normalized = {
      latitude: entry.latitude,
      longitude: entry.longitude,
      formatted_address: entry.formatted_address,
      osm_place_id: entry.osm_place_id,
      location_source: entry.location_source,
    } satisfies OsmResolvedLocation;

    setCachedValue(store.resolve, entry.placeId, normalized, RESOLVE_CACHE_TTL_MS);
    if (entry.osm_place_id) {
      setCachedValue(
        store.resolve,
        entry.osm_place_id,
        normalized,
        RESOLVE_CACHE_TTL_MS,
      );
    }
  });

  return results;
}

export async function resolve(placeId: string): Promise<OsmResolvedLocation | null> {
  const rawPlaceId = placeId.trim();
  if (!rawPlaceId) return null;

  if (isLocationAliasPlaceId(rawPlaceId)) {
    const alias = resolveLocationAlias(rawPlaceId);
    if (!alias) return null;

    return {
      latitude: alias.latitude,
      longitude: alias.longitude,
      formatted_address: alias.formatted_address,
      osm_place_id: alias.osm_place_id,
      location_source: alias.location_source,
    };
  }

  const normalizedPlaceId = rawPlaceId.toUpperCase();
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

export async function reverse(
  latitude: number,
  longitude: number,
): Promise<OsmResolvedLocation | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const normalizedLatitude = Number(latitude.toFixed(7));
  const normalizedLongitude = Number(longitude.toFixed(7));
  const cacheKey = normalizeCoordinateKey(normalizedLatitude, normalizedLongitude);
  const store = getCacheStore();
  const cached = getCachedValue(store.reverse, cacheKey);
  if (cached !== null) return cached;

  const url = new URL("/reverse", getBaseUrl());
  url.searchParams.set("lat", String(normalizedLatitude));
  url.searchParams.set("lon", String(normalizedLongitude));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18");

  const payload = await fetchJson<OsmSearchItem>(url);
  const normalized = normalizeOsmLookupResult(payload);

  setCachedValue(store.reverse, cacheKey, normalized, RESOLVE_CACHE_TTL_MS);
  if (normalized?.osm_place_id) {
    setCachedValue(
      store.resolve,
      normalized.osm_place_id,
      normalized,
      RESOLVE_CACHE_TTL_MS,
    );
  }

  return normalized;
}
