export const GOOGLE_PLACE_ID_PREFIX = "GOOGLE:";

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
