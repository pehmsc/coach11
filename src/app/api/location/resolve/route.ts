import { NextResponse } from "next/server";
import { extractRequestIp } from "@/lib/http/request-ip";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { resolve, isValidOsmPlaceId } from "@/lib/provider/osm";
import { checkLocationResolveLimit } from "@/lib/rate-limit";

const LOCATION_RESOLVE_CACHE_CONTROL =
  "public, max-age=900, stale-while-revalidate=1800";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const placeId = (url.searchParams.get("placeId") || "").trim().toUpperCase();

    if (!isValidOsmPlaceId(placeId)) {
      return NextResponse.json(
        { error: "Identificador de localização inválido." },
        { status: 400 },
      );
    }

    const ip = extractRequestIp(new Headers(request.headers));
    if (checkLocationResolveLimit(ip)) {
      return NextResponse.json(
        { error: "Demasiados pedidos de resolução de localização." },
        { status: 429 },
      );
    }

    const location = await resolve(placeId);
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
          "Cache-Control": LOCATION_RESOLVE_CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    return respondInternalError("api.location.resolve.get", error);
  }
}
