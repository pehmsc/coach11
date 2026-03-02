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

export function buildGoogleMapsEmbedUrl(query: string | null | undefined) {
  const normalizedQuery = typeof query === "string" ? query.trim() : "";
  if (!normalizedQuery) return null;

  return `https://www.google.com/maps?q=${encodeURIComponent(normalizedQuery)}&z=15&output=embed`;
}

export function buildAppleMapsUrl(query: string | null | undefined) {
  const normalizedQuery = typeof query === "string" ? query.trim() : "";
  if (!normalizedQuery) return null;

  return `http://maps.apple.com/?q=${encodeURIComponent(normalizedQuery)}`;
}

export function buildWazeUrl(query: string | null | undefined) {
  const normalizedQuery = typeof query === "string" ? query.trim() : "";
  if (!normalizedQuery) return null;

  return `https://waze.com/ul?q=${encodeURIComponent(normalizedQuery)}&navigate=yes`;
}

export function detectMapsPlatform(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
) {
  const touchMac = platform === "MacIntel" && maxTouchPoints > 1;
  const isAppleMobile =
    /iPad|iPhone|iPod/i.test(platform) ||
    /iPad|iPhone|iPod/i.test(userAgent) ||
    touchMac;
  const isAndroid = /Android/i.test(userAgent);
  const isMobile = isAppleMobile || isAndroid || /Mobile/i.test(userAgent);

  return {
    isMobile,
    isAppleMobile,
    isAndroid,
  };
}
