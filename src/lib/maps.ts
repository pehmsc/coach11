export function resolveMapsQuery(
  locationAddress: string | null | undefined,
  location: string | null | undefined,
) {
  const normalizedAddress =
    typeof locationAddress === "string" ? locationAddress.trim() : "";
  if (normalizedAddress) return normalizedAddress;

  const normalizedLocation =
    typeof location === "string" ? location.trim() : "";
  return normalizedLocation || null;
}

export function buildGoogleMapsUrl(query: string | null | undefined) {
  const normalizedQuery = typeof query === "string" ? query.trim() : "";
  if (!normalizedQuery) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(normalizedQuery)}`;
}
