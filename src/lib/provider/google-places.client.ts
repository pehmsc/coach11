"use client";

const GOOGLE_PLACE_ID_PREFIX = "GOOGLE:";
const GOOGLE_MAPS_SCRIPT_ID = "coach11-google-maps-js";
const GOOGLE_MAPS_CALLBACK = "__coach11GoogleMapsInit";

type GoogleMapsWindow = Window & {
  google?: {
    maps?: {
      Geocoder?: new () => {
        geocode: (
          request: Record<string, unknown>,
          callback: (results: unknown[] | null, status: string) => void,
        ) => void;
      };
      places?: {
        AutocompleteService?: new () => {
          getPlacePredictions: (
            request: Record<string, unknown>,
            callback: (predictions: unknown[] | null, status: string) => void,
          ) => void;
        };
        PlacesService?: new (
          container: Element,
        ) => {
          getDetails: (
            request: Record<string, unknown>,
            callback: (place: unknown, status: string) => void,
          ) => void;
        };
        PlacesServiceStatus?: {
          OK?: string;
          ZERO_RESULTS?: string;
        };
      };
    };
  };
  __coach11GoogleMapsLoader?: Promise<void>;
  [GOOGLE_MAPS_CALLBACK]?: (() => void) | undefined;
};

type GooglePrediction = {
  place_id?: string;
  description?: string;
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
};

type GooglePlaceResult = {
  place_id?: string;
  formatted_address?: string;
  name?: string;
  geometry?: {
    location?: {
      lat?: () => number;
      lng?: () => number;
    };
  };
};

type GoogleGeocoderResult = {
  place_id?: string;
  formatted_address?: string;
  geometry?: {
    location?: {
      lat?: () => number;
      lng?: () => number;
    };
  };
};

export type GoogleClientSuggestion = {
  placeId: string;
  title: string;
  subtitle: string | null;
  formatted_address: string;
  latitude: number | null;
  longitude: number | null;
  osm_place_id: string;
  location_source: "google";
};

export type GoogleClientResolvedLocation = {
  latitude: number;
  longitude: number;
  formatted_address: string;
  osm_place_id: string;
  location_source: "google";
};

function getApiKey() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return apiKey || null;
}

export function hasGooglePlacesApiKey() {
  return Boolean(getApiKey());
}

export function encodeGooglePlaceId(placeId: string) {
  const normalized = placeId.trim();
  return normalized ? `${GOOGLE_PLACE_ID_PREFIX}${normalized}` : "";
}

export function decodeGooglePlaceId(placeId: string) {
  const normalized = placeId.trim();
  if (normalized.startsWith(GOOGLE_PLACE_ID_PREFIX)) {
    return normalized.slice(GOOGLE_PLACE_ID_PREFIX.length);
  }
  return normalized;
}

export function isGooglePlaceId(placeId: string) {
  const normalized = decodeGooglePlaceId(placeId);
  return normalized.length > 0 && normalized !== placeId.trim();
}

function loadGoogleMaps() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("google_maps_browser_only"));
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return Promise.reject(new Error("google_maps_key_missing"));
  }

  const browserWindow = window as GoogleMapsWindow;
  if (
    browserWindow.google?.maps?.places?.AutocompleteService &&
    browserWindow.google?.maps?.places?.PlacesService &&
    browserWindow.google?.maps?.Geocoder
  ) {
    return Promise.resolve();
  }

  if (browserWindow.__coach11GoogleMapsLoader) {
    return browserWindow.__coach11GoogleMapsLoader;
  }

  browserWindow.__coach11GoogleMapsLoader = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(
      GOOGLE_MAPS_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    const cleanup = () => {
      if (browserWindow[GOOGLE_MAPS_CALLBACK]) {
        delete browserWindow[GOOGLE_MAPS_CALLBACK];
      }
    };

    browserWindow[GOOGLE_MAPS_CALLBACK] = () => {
      cleanup();
      resolve();
    };

    if (existingScript) {
      const startedAt = Date.now();
      const pollForGoogle = () => {
        if (
          browserWindow.google?.maps?.places?.AutocompleteService &&
          browserWindow.google?.maps?.places?.PlacesService &&
          browserWindow.google?.maps?.Geocoder
        ) {
          cleanup();
          resolve();
          return;
        }

        if (Date.now() - startedAt > 10_000) {
          cleanup();
          reject(new Error("google_maps_script_timeout"));
          return;
        }

        window.setTimeout(pollForGoogle, 100);
      };

      existingScript.addEventListener("error", () => {
        cleanup();
        reject(new Error("google_maps_script_failed"));
      });
      pollForGoogle();
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(apiKey)}` +
      "&libraries=places" +
      "&loading=async" +
      "&language=pt-PT" +
      "&region=PT" +
      `&callback=${GOOGLE_MAPS_CALLBACK}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("google_maps_script_failed"));
    };
    document.head.appendChild(script);
  });

  return browserWindow.__coach11GoogleMapsLoader;
}

function getPlacesServiceStatus(windowObject: GoogleMapsWindow) {
  return (
    windowObject.google?.maps?.places?.PlacesServiceStatus ?? {
      OK: "OK",
      ZERO_RESULTS: "ZERO_RESULTS",
    }
  );
}

function normalizePrediction(prediction: GooglePrediction): GoogleClientSuggestion | null {
  const rawPlaceId = typeof prediction.place_id === "string" ? prediction.place_id.trim() : "";
  const description =
    typeof prediction.description === "string" ? prediction.description.trim() : "";
  const mainText =
    typeof prediction.structured_formatting?.main_text === "string"
      ? prediction.structured_formatting.main_text.trim()
      : "";
  const secondaryText =
    typeof prediction.structured_formatting?.secondary_text === "string"
      ? prediction.structured_formatting.secondary_text.trim()
      : "";

  if (!rawPlaceId || !description) return null;

  return {
    placeId: encodeGooglePlaceId(rawPlaceId),
    title: mainText || description,
    subtitle: secondaryText || null,
    formatted_address: description,
    latitude: null,
    longitude: null,
    osm_place_id: encodeGooglePlaceId(rawPlaceId),
    location_source: "google",
  };
}

function normalizeResolvedPlace(place: GooglePlaceResult | GoogleGeocoderResult) {
  const placeId = typeof place.place_id === "string" ? place.place_id.trim() : "";
  const formattedAddress =
    typeof place.formatted_address === "string" ? place.formatted_address.trim() : "";
  const latitudeValue = place.geometry?.location?.lat?.();
  const longitudeValue = place.geometry?.location?.lng?.();

  if (!placeId || !formattedAddress) return null;
  if (!Number.isFinite(latitudeValue) || !Number.isFinite(longitudeValue)) return null;

  const latitude = latitudeValue as number;
  const longitude = longitudeValue as number;

  return {
    latitude,
    longitude,
    formatted_address: formattedAddress,
    osm_place_id: encodeGooglePlaceId(placeId),
    location_source: "google" as const,
  };
}

export async function autocompleteGooglePlaces(
  query: string,
  limit = 5,
): Promise<GoogleClientSuggestion[]> {
  await loadGoogleMaps();

  const browserWindow = window as GoogleMapsWindow;
  const service = browserWindow.google?.maps?.places?.AutocompleteService
    ? new browserWindow.google.maps.places.AutocompleteService()
    : null;
  if (!service) {
    throw new Error("google_autocomplete_unavailable");
  }

  const statuses = getPlacesServiceStatus(browserWindow);

  return new Promise<GoogleClientSuggestion[]>((resolve, reject) => {
    service.getPlacePredictions(
      {
        input: query,
        componentRestrictions: { country: "pt" },
      },
      (predictions, status) => {
        if (status === statuses.ZERO_RESULTS || !predictions?.length) {
          resolve([]);
          return;
        }

        if (status !== statuses.OK) {
          reject(new Error(`google_autocomplete_failed:${status}`));
          return;
        }

        resolve(
          predictions
            .slice(0, Math.min(Math.max(limit, 1), 5))
            .map((entry) => normalizePrediction(entry as GooglePrediction))
            .filter((entry): entry is GoogleClientSuggestion => !!entry),
        );
      },
    );
  });
}

export async function resolveGooglePlace(
  placeId: string,
): Promise<GoogleClientResolvedLocation | null> {
  await loadGoogleMaps();

  const browserWindow = window as GoogleMapsWindow;
  const PlacesService = browserWindow.google?.maps?.places?.PlacesService;
  if (!PlacesService) {
    throw new Error("google_places_details_unavailable");
  }

  const statuses = getPlacesServiceStatus(browserWindow);
  const service = new PlacesService(document.createElement("div"));
  const normalizedPlaceId = decodeGooglePlaceId(placeId);
  if (!normalizedPlaceId) return null;

  return new Promise<GoogleClientResolvedLocation | null>((resolve, reject) => {
    service.getDetails(
      {
        placeId: normalizedPlaceId,
        fields: ["place_id", "formatted_address", "geometry", "name"],
      },
      (place, status) => {
        if (status === statuses.ZERO_RESULTS || !place) {
          resolve(null);
          return;
        }

        if (status !== statuses.OK) {
          reject(new Error(`google_place_details_failed:${status}`));
          return;
        }

        resolve(normalizeResolvedPlace(place as GooglePlaceResult));
      },
    );
  });
}

export async function reverseGeocodeGoogle(
  latitude: number,
  longitude: number,
): Promise<GoogleClientResolvedLocation | null> {
  await loadGoogleMaps();

  const browserWindow = window as GoogleMapsWindow;
  const Geocoder = browserWindow.google?.maps?.Geocoder;
  if (!Geocoder) {
    throw new Error("google_geocoder_unavailable");
  }

  const geocoder = new Geocoder();
  const statuses = getPlacesServiceStatus(browserWindow);

  return new Promise<GoogleClientResolvedLocation | null>((resolve, reject) => {
    geocoder.geocode(
      {
        location: { lat: latitude, lng: longitude },
      },
      (results, status) => {
        if (status === statuses.ZERO_RESULTS || !results?.length) {
          resolve(null);
          return;
        }

        if (status !== statuses.OK) {
          reject(new Error(`google_reverse_geocode_failed:${status}`));
          return;
        }

        resolve(normalizeResolvedPlace(results[0] as GoogleGeocoderResult));
      },
    );
  });
}
