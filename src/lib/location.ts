export type LocationSource = "google" | "osm" | "manual";

export type LocationFieldsValue = {
  location: string;
  formatted_address: string;
  latitude: number | null;
  longitude: number | null;
  osm_place_id: string;
  location_source: LocationSource | null;
};

export const EMPTY_LOCATION_FIELDS: LocationFieldsValue = {
  location: "",
  formatted_address: "",
  latitude: null,
  longitude: null,
  osm_place_id: "",
  location_source: null,
};

export type LocationRecordLike = Partial<LocationFieldsValue> & {
  location?: string | null;
  formatted_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  osm_place_id?: string | null;
  location_source?: LocationSource | null;
};

export function normalizeNullableNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsed = Number.parseFloat(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

export function normalizeLocationSource(value: unknown): LocationSource | null {
  return value === "google" || value === "osm" || value === "manual" ? value : null;
}

export function hasCoordinates(value: {
  latitude?: number | null;
  longitude?: number | null;
}) {
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude);
}

export function resolveFormattedAddress(
  formattedAddress: string | null | undefined,
) {
  const formatted =
    typeof formattedAddress === "string" ? formattedAddress.trim() : "";
  return formatted || null;
}

export function resolveLocationLabel(
  location: string | null | undefined,
  formattedAddress: string | null | undefined,
) {
  const locationLabel = typeof location === "string" ? location.trim() : "";
  if (locationLabel) return locationLabel;

  return resolveFormattedAddress(formattedAddress);
}

export function coerceLocationFields(
  value: LocationRecordLike | null | undefined,
): LocationFieldsValue {
  return {
    location: typeof value?.location === "string" ? value.location : "",
    formatted_address:
      typeof value?.formatted_address === "string" ? value.formatted_address : "",
    latitude: normalizeNullableNumber(value?.latitude),
    longitude: normalizeNullableNumber(value?.longitude),
    osm_place_id:
      typeof value?.osm_place_id === "string" ? value.osm_place_id : "",
    location_source: normalizeLocationSource(value?.location_source),
  };
}
