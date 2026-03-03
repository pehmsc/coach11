import { NextResponse } from "next/server";
import { extractRequestIp } from "@/lib/http/request-ip";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { checkLocationAutocompleteLimit } from "@/lib/rate-limit";
import {
  autocomplete as googleAutocomplete,
  hasGoogleMapsApiKey,
  type GoogleSuggestion,
} from "@/lib/provider/google";
import {
  autocomplete as osmAutocomplete,
  sanitizeAutocompleteQuery,
  type OsmSuggestion,
} from "@/lib/provider/osm";

const LOCATION_AUTOCOMPLETE_CACHE_CONTROL =
  "public, max-age=300, stale-while-revalidate=900";

function mergeSuggestions<
  T extends {
    placeId: string;
    formatted_address: string;
  },
>(primary: T[], fallback: T[], limit: number) {
  const merged: T[] = [];
  const seenPlaceIds = new Set<string>();
  const seenAddresses = new Set<string>();

  for (const entry of [...primary, ...fallback]) {
    const normalizedAddress = entry.formatted_address.trim().toLowerCase();
    if (seenPlaceIds.has(entry.placeId) || seenAddresses.has(normalizedAddress)) {
      continue;
    }

    seenPlaceIds.add(entry.placeId);
    if (normalizedAddress) {
      seenAddresses.add(normalizedAddress);
    }
    merged.push(entry);
    if (merged.length >= limit) break;
  }

  return merged;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawQuery = url.searchParams.get("q") || "";
    const sanitizedQuery = sanitizeAutocompleteQuery(rawQuery);
    const rawLimit = Number.parseInt(url.searchParams.get("limit") || "5", 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 5) : 5;

    if (!sanitizedQuery) {
      return NextResponse.json(
        { success: true, suggestions: [] },
        {
          headers: {
            "Cache-Control": LOCATION_AUTOCOMPLETE_CACHE_CONTROL,
          },
        },
      );
    }

    const ip = extractRequestIp(new Headers(request.headers));
    if (checkLocationAutocompleteLimit(ip)) {
      return NextResponse.json(
        { error: "Demasiados pedidos de pesquisa de localização." },
        { status: 429 },
      );
    }

    let suggestions: Array<GoogleSuggestion | OsmSuggestion> = [];

    if (hasGoogleMapsApiKey()) {
      try {
        suggestions = await googleAutocomplete(sanitizedQuery, limit);
      } catch {
        suggestions = [];
      }
    }

    if (suggestions.length < limit) {
      const fallbackSuggestions = await osmAutocomplete(sanitizedQuery, limit);
      suggestions = mergeSuggestions(suggestions, fallbackSuggestions, limit);
    }

    return NextResponse.json(
      {
        success: true,
        suggestions,
      },
      {
        headers: {
          "Cache-Control": LOCATION_AUTOCOMPLETE_CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    return respondInternalError("api.location.autocomplete.get", error);
  }
}
