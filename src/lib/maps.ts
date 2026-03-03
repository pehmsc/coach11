import { hasCoordinates, resolveFormattedAddress, resolveLocationLabel } from "@/lib/location";

export type MapsTarget =
  | string
  | {
      location?: string | null;
      locationAddress?: string | null;
      formattedAddress?: string | null;
      latitude?: number | null;
      longitude?: number | null;
    }
  | null
  | undefined;

function normalizeTarget(target: MapsTarget) {
  if (typeof target === "string") {
    const query = target.trim();
    return {
      query: query || null,
      latitude: null,
      longitude: null,
    };
  }

  return {
    query: resolveMapsQuery(
      target?.formattedAddress,
      target?.locationAddress,
      target?.location,
    ),
    latitude: target?.latitude ?? null,
    longitude: target?.longitude ?? null,
  };
}

function buildCoordinateQuery(latitude: number, longitude: number) {
  return `${latitude},${longitude}`;
}

export function resolveMapsQuery(
  formattedAddress: string | null | undefined,
  locationAddress: string | null | undefined,
  location: string | null | undefined,
) {
  return resolveLocationLabel(location, formattedAddress, locationAddress);
}

export function resolveMapsAddress(
  formattedAddress: string | null | undefined,
  locationAddress: string | null | undefined,
) {
  return resolveFormattedAddress(formattedAddress, locationAddress);
}

export function buildGoogleMapsUrl(target: MapsTarget) {
  const normalizedTarget = normalizeTarget(target);

  if (
    hasCoordinates({
      latitude: normalizedTarget.latitude,
      longitude: normalizedTarget.longitude,
    })
  ) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(buildCoordinateQuery(normalizedTarget.latitude as number, normalizedTarget.longitude as number))}`;
  }

  if (!normalizedTarget.query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(normalizedTarget.query)}`;
}

export function buildAppleMapsUrl(target: MapsTarget) {
  const normalizedTarget = normalizeTarget(target);

  if (
    hasCoordinates({
      latitude: normalizedTarget.latitude,
      longitude: normalizedTarget.longitude,
    })
  ) {
    return `http://maps.apple.com/?ll=${encodeURIComponent(buildCoordinateQuery(normalizedTarget.latitude as number, normalizedTarget.longitude as number))}`;
  }

  if (!normalizedTarget.query) return null;
  return `http://maps.apple.com/?q=${encodeURIComponent(normalizedTarget.query)}`;
}

export function buildWazeUrl(target: MapsTarget) {
  const normalizedTarget = normalizeTarget(target);

  if (
    hasCoordinates({
      latitude: normalizedTarget.latitude,
      longitude: normalizedTarget.longitude,
    })
  ) {
    return `https://waze.com/ul?ll=${encodeURIComponent(buildCoordinateQuery(normalizedTarget.latitude as number, normalizedTarget.longitude as number))}&navigate=yes`;
  }

  if (!normalizedTarget.query) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(normalizedTarget.query)}&navigate=yes`;
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
