import "server-only";

import {
  decodeGooglePlaceId,
  encodeGooglePlaceId,
  isGooglePlaceId,
} from "./google-place-id";

const AUTOCOMPLETE_CACHE_TTL_MS = 15 * 60 * 1000;
const RESOLVE_CACHE_TTL_MS = 30 * 60 * 1000;

const LISBON_LOCATION_BIAS = {
  circle: {
    center: { latitude: 38.7223, longitude: -9.1393 },
    radius: 40000,
  },
} as const;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type GoogleCacheStore = {
  autocomplete: Map<string, CacheEntry<GoogleSuggestion[]>>;
  resolve: Map<string, CacheEntry<GoogleResolvedLocation | null>>;
  reverse: Map<string, CacheEntry<GoogleResolvedLocation | null>>;
};

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: {
        text?: string;
      };
      structuredFormat?: {
        mainText?: {
          text?: string;
        };
        secondaryText?: {
          text?: string;
        };
      };
    };
  }>;
};

type GoogleAutocompleteSuggestionItem = NonNullable<
  GoogleAutocompleteResponse["suggestions"]
>[number];

type GooglePlaceDetailsResponse = {
  id?: string;
  formattedAddress?: string;
  displayName?: {
    text?: string;
  };
  location?: {
    latitude?: number;
    longitude?: number;
  };
};

type GoogleGeocodeResponse = {
  status?: string;
  results?: Array<{
    place_id?: string;
    formatted_address?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
};

type GoogleGeocodeResultItem = NonNullable<GoogleGeocodeResponse["results"]>[number];

declare global {
  var __coach11GoogleCache: GoogleCacheStore | undefined;
}

export type GoogleSuggestion = {
  placeId: string;
  title: string;
  subtitle: string | null;
  formatted_address: string;
  latitude: number | null;
  longitude: number | null;
  osm_place_id: string;
  location_source: "google";
};

export type GoogleResolvedLocation = {
  latitude: number;
  longitude: number;
  formatted_address: string;
  osm_place_id: string;
  location_source: "google";
};

function getCacheStore() {
  if (!globalThis.__coach11GoogleCache) {
    globalThis.__coach11GoogleCache = {
      autocomplete: new Map(),
      resolve: new Map(),
      reverse: new Map(),
    };
  }

  return globalThis.__coach11GoogleCache;
}

function getCachedValue<T>(cache: Map<string, CacheEntry<T>>, key: string) {
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

function getApiKey() {
  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    "";
  return apiKey || null;
}

export function hasGoogleMapsApiKey() {
  return Boolean(getApiKey());
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

async function fetchGoogleJson<T>(
  input: string | URL,
  init?: RequestInit & { fieldMask?: string | null },
) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("google_maps_key_missing");
  }

  const headers = new Headers(init?.headers);
  headers.set("X-Goog-Api-Key", apiKey);
  headers.set("Accept-Language", "pt-PT,pt;q=0.9,en;q=0.8");
  if (init?.fieldMask) {
    headers.set("X-Goog-FieldMask", init.fieldMask);
  }

  const response = await fetch(input, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(`google_fetch_failed:${response.status}`);
  }

  return response.json() as Promise<T>;
}

function normalizeSuggestion(
  item: GoogleAutocompleteSuggestionItem,
): GoogleSuggestion | null {
  const prediction = item.placePrediction;
  const rawPlaceId = normalizeText(prediction?.placeId);
  const title =
    normalizeText(prediction?.structuredFormat?.mainText?.text) ||
    normalizeText(prediction?.text?.text);
  const subtitle = normalizeText(prediction?.structuredFormat?.secondaryText?.text);
  const formattedAddress = normalizeText(prediction?.text?.text);

  if (!rawPlaceId || !title || !formattedAddress) return null;

  const encodedPlaceId = encodeGooglePlaceId(rawPlaceId);

  return {
    placeId: encodedPlaceId,
    title,
    subtitle,
    formatted_address: formattedAddress,
    latitude: null,
    longitude: null,
    osm_place_id: encodedPlaceId,
    location_source: "google",
  };
}

function normalizeResolvedLocation(
  payload: GooglePlaceDetailsResponse | GoogleGeocodeResultItem | null,
): GoogleResolvedLocation | null {
  if (!payload) return null;

  let rawPlaceId: string | null;
  let formattedAddress: string | null;
  let latitude: number | null;
  let longitude: number | null;

  if ("id" in payload) {
    const placeDetailsPayload = payload as GooglePlaceDetailsResponse;
    rawPlaceId = normalizeText(placeDetailsPayload.id);
    formattedAddress = normalizeText(placeDetailsPayload.formattedAddress);
    latitude = normalizeNumber(placeDetailsPayload.location?.latitude);
    longitude = normalizeNumber(placeDetailsPayload.location?.longitude);
  } else {
    const geocodePayload = payload as GoogleGeocodeResultItem;
    rawPlaceId = normalizeText(geocodePayload.place_id);
    formattedAddress = normalizeText(geocodePayload.formatted_address);
    latitude = normalizeNumber(geocodePayload.geometry?.location?.lat);
    longitude = normalizeNumber(geocodePayload.geometry?.location?.lng);
  }

  if (!rawPlaceId || !formattedAddress || latitude == null || longitude == null) {
    return null;
  }

  return {
    latitude,
    longitude,
    formatted_address: formattedAddress,
    osm_place_id: encodeGooglePlaceId(rawPlaceId),
    location_source: "google",
  };
}

export async function autocomplete(query: string, limit = 5): Promise<GoogleSuggestion[]> {
  if (!hasGoogleMapsApiKey()) return [];

  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const normalizedLimit = Math.min(Math.max(limit, 1), 5);
  const store = getCacheStore();
  const cacheKey = `${normalizedQuery.toLowerCase()}::${normalizedLimit}`;
  const cached = getCachedValue(store.autocomplete, cacheKey);
  if (cached) return cached;

  const payload = await fetchGoogleJson<GoogleAutocompleteResponse>(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      fieldMask:
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: normalizedQuery,
        languageCode: "pt-PT",
        regionCode: "PT",
        includedRegionCodes: ["PT"],
        locationBias: LISBON_LOCATION_BIAS,
      }),
    },
  );

  const suggestions = (payload.suggestions ?? [])
    .map((entry) => normalizeSuggestion(entry))
    .filter((entry): entry is GoogleSuggestion => !!entry)
    .slice(0, normalizedLimit);

  setCachedValue(store.autocomplete, cacheKey, suggestions, AUTOCOMPLETE_CACHE_TTL_MS);
  return suggestions;
}

export async function resolve(placeId: string): Promise<GoogleResolvedLocation | null> {
  if (!hasGoogleMapsApiKey()) return null;
  if (!isGooglePlaceId(placeId)) return null;

  const normalizedPlaceId = placeId.trim();
  const store = getCacheStore();
  const cached = getCachedValue(store.resolve, normalizedPlaceId);
  if (cached !== null) {
    return cached;
  }

  const googlePlaceId = decodeGooglePlaceId(normalizedPlaceId);
  const payload = await fetchGoogleJson<GooglePlaceDetailsResponse>(
    new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(googlePlaceId)}?languageCode=pt-PT&regionCode=PT`),
    {
      method: "GET",
      fieldMask: "id,formattedAddress,location",
    },
  );

  const resolved = normalizeResolvedLocation(payload);
  setCachedValue(store.resolve, normalizedPlaceId, resolved, RESOLVE_CACHE_TTL_MS);
  return resolved;
}

export async function reverse(
  latitude: number,
  longitude: number,
): Promise<GoogleResolvedLocation | null> {
  if (!hasGoogleMapsApiKey()) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const normalizedLatitude = Number(latitude.toFixed(7));
  const normalizedLongitude = Number(longitude.toFixed(7));
  const cacheKey = `${normalizedLatitude.toFixed(6)},${normalizedLongitude.toFixed(6)}`;
  const store = getCacheStore();
  const cached = getCachedValue(store.reverse, cacheKey);
  if (cached !== null) return cached;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${normalizedLatitude},${normalizedLongitude}`);
  url.searchParams.set("language", "pt-PT");
  url.searchParams.set("region", "pt");
  url.searchParams.set("key", getApiKey() as string);

  const payload = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`google_geocode_failed:${response.status}`);
    }
    return response.json() as Promise<GoogleGeocodeResponse>;
  });

  const resolved = normalizeResolvedLocation(payload.results?.[0] ?? null);
  setCachedValue(store.reverse, cacheKey, resolved, RESOLVE_CACHE_TTL_MS);
  if (resolved?.osm_place_id) {
    setCachedValue(store.resolve, resolved.osm_place_id, resolved, RESOLVE_CACHE_TTL_MS);
  }
  return resolved;
}
