import { NextResponse } from "next/server";
import { normalizeNullableNumber } from "@/lib/location";
import { extractRequestIp } from "@/lib/http/request-ip";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import {
  hasGoogleMapsApiKey,
  reverse as reverseGoogle,
} from "@/lib/provider/google";
import { reverse } from "@/lib/provider/osm";
import { checkLocationResolveLimit } from "@/lib/rate-limit";

const LOCATION_REVERSE_CACHE_CONTROL =
  "public, max-age=900, stale-while-revalidate=1800";

function isValidLatitude(value: number | null): value is number {
  return value != null && value >= -90 && value <= 90;
}

function isValidLongitude(value: number | null): value is number {
  return value != null && value >= -180 && value <= 180;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const latitude = normalizeNullableNumber(url.searchParams.get("lat"));
    const longitude = normalizeNullableNumber(url.searchParams.get("lng"));

    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      return NextResponse.json(
        { error: "Coordenadas inválidas." },
        { status: 400 },
      );
    }

    const normalizedLatitude = latitude;
    const normalizedLongitude = longitude;

    const ip = extractRequestIp(new Headers(request.headers));
    if (checkLocationResolveLimit(ip)) {
      return NextResponse.json(
        { error: "Demasiados pedidos de localização." },
        { status: 429 },
      );
    }

    let location = null;

    if (hasGoogleMapsApiKey()) {
      try {
        location = await reverseGoogle(normalizedLatitude, normalizedLongitude);
      } catch {
        location = null;
      }
    }

    if (!location) {
      location = await reverse(normalizedLatitude, normalizedLongitude);
    }
    if (!location) {
      return NextResponse.json(
        { error: "Localização não encontrada." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        location,
      },
      {
        headers: {
          "Cache-Control": LOCATION_REVERSE_CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    return respondInternalError("api.location.reverse.get", error);
  }
}
