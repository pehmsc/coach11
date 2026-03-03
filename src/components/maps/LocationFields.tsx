"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MapPin,
  Search,
  Target,
  XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationMapPreview } from "@/components/maps/LocationMapPreview";
import {
  autocompleteGooglePlaces,
  hasGooglePlacesApiKey,
  isGooglePlaceId,
  resolveGooglePlace,
  type GoogleClientSuggestion,
} from "@/lib/provider/google-places.client";
import {
  type LocationSource,
  type LocationFieldsValue,
  normalizeNullableNumber,
} from "@/lib/location";
import { cn } from "@/lib/utils";

type Accent = "emerald" | "blue" | "slate";
type Suggestion = {
  placeId: string;
  title: string;
  subtitle: string | null;
  formatted_address: string;
  latitude: number | null;
  longitude: number | null;
  osm_place_id: string;
  location_source: LocationSource;
};

type Props = {
  value: LocationFieldsValue;
  onChange: (value: LocationFieldsValue) => void;
  locationLabel?: string;
  addressLabel?: string;
  locationPlaceholder?: string;
  addressPlaceholder?: string;
  accent?: Accent;
  compact?: boolean;
  showPreview?: boolean;
  className?: string;
};

function hasAnyLocationData(value: LocationFieldsValue) {
  return Boolean(
    value.location_address.trim() ||
      value.formatted_address.trim() ||
      value.latitude != null ||
      value.longitude != null,
  );
}

async function fetchFallbackSuggestions(query: string) {
  const response = await fetch(`/api/location/autocomplete?q=${encodeURIComponent(query)}`, {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        suggestions?: Suggestion[];
      }
    | null;

  if (!response.ok) return [];
  return Array.isArray(payload?.suggestions) ? payload.suggestions : [];
}

async function resolveFallbackSuggestion(placeId: string) {
  const response = await fetch(
    `/api/location/resolve?placeId=${encodeURIComponent(placeId)}`,
    {
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        location?: {
          latitude?: number;
          longitude?: number;
          formatted_address?: string;
          osm_place_id?: string;
          location_source?: LocationSource;
        };
      }
    | null;

  if (!response.ok) return null;
  return payload?.location ?? null;
}

function mergeSuggestions(
  primary: Suggestion[],
  fallback: Suggestion[],
  limit = 5,
) {
  const merged: Suggestion[] = [];
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

export function LocationFields({
  value,
  onChange,
  locationLabel = "Nome do local",
  addressLabel = "Morada completa",
  locationPlaceholder = "ex: Campo 1, Complexo Desportivo",
  addressPlaceholder = "ex: Rua do Campo, 1, Lisboa",
  accent = "emerald",
  compact = false,
  showPreview = true,
  className,
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [latitudeInput, setLatitudeInput] = useState(
    value.latitude != null ? String(value.latitude) : "",
  );
  const [longitudeInput, setLongitudeInput] = useState(
    value.longitude != null ? String(value.longitude) : "",
  );
  const latestRequestIdRef = useRef(0);
  const deferredAddress = useDeferredValue(value.location_address);
  const googlePlacesEnabled = hasGooglePlacesApiKey();

  useEffect(() => {
    setLatitudeInput(value.latitude != null ? String(value.latitude) : "");
  }, [value.latitude]);

  useEffect(() => {
    setLongitudeInput(value.longitude != null ? String(value.longitude) : "");
  }, [value.longitude]);

  function handleLocationInputChange(nextLocation: string) {
    onChange({
      ...value,
      location: nextLocation,
    });
  }

  function handleAddressInputChange(nextAddress: string) {
    const trimmedAddress = nextAddress.trim();
    onChange({
      ...value,
      location_address: nextAddress,
      formatted_address: trimmedAddress ? nextAddress : "",
      latitude: null,
      longitude: null,
      osm_place_id: "",
      location_source: trimmedAddress ? "manual" : null,
    });

    setLookupError(null);
    setResolvingPlaceId(null);
    if (trimmedAddress.length < 3) {
      setSuggestions([]);
      setDropdownOpen(false);
    } else {
      setDropdownOpen(true);
    }
  }

  function handleCoordinateInputChange(
    field: "latitude" | "longitude",
    nextValue: string,
  ) {
    if (field === "latitude") {
      setLatitudeInput(nextValue);
    } else {
      setLongitudeInput(nextValue);
    }

    const parsed = normalizeNullableNumber(nextValue);
    const nextLatitude = field === "latitude" ? parsed : value.latitude;
    const nextLongitude = field === "longitude" ? parsed : value.longitude;
    const hasSignal =
      value.location_address.trim() ||
      value.formatted_address.trim() ||
      nextLatitude != null ||
      nextLongitude != null;

    onChange({
      ...value,
      latitude: nextLatitude,
      longitude: nextLongitude,
      osm_place_id: "",
      location_source: hasSignal ? "manual" : null,
    });
  }

  function handleClearLocation() {
    setSuggestions([]);
    setDropdownOpen(false);
    setLookupError(null);
    setResolvingPlaceId(null);
    setLatitudeInput("");
    setLongitudeInput("");
    onChange({
      ...value,
      location_address: "",
      formatted_address: "",
      latitude: null,
      longitude: null,
      osm_place_id: "",
      location_source: null,
    });
  }

  useEffect(() => {
    const query = deferredAddress.trim();
    if (query.length < 3) return;

    const timeoutId = window.setTimeout(async () => {
      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;
      setSearching(true);

      try {
        let nextSuggestions: Suggestion[] = [];

        if (googlePlacesEnabled) {
          try {
            const googleSuggestions = (await autocompleteGooglePlaces(
              query,
              5,
            )) as GoogleClientSuggestion[];
            nextSuggestions = googleSuggestions;
          } catch {
            nextSuggestions = [];
          }
        }

        if (nextSuggestions.length < 5) {
          const fallbackSuggestions = await fetchFallbackSuggestions(query);
          nextSuggestions = mergeSuggestions(nextSuggestions, fallbackSuggestions, 5);
        }

        if (latestRequestIdRef.current !== requestId) return;

        setSuggestions(nextSuggestions);
        setDropdownOpen(true);
      } catch {
        if (latestRequestIdRef.current !== requestId) return;
        setSuggestions([]);
      } finally {
        if (latestRequestIdRef.current === requestId) {
          setSearching(false);
        }
      }
    }, 400);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [deferredAddress, googlePlacesEnabled]);

  async function handleSuggestionSelect(suggestion: Suggestion) {
    setResolvingPlaceId(suggestion.placeId);
    setLookupError(null);

    try {
      const resolvedLocation =
        googlePlacesEnabled && isGooglePlaceId(suggestion.placeId)
          ? await resolveGooglePlace(suggestion.placeId)
          : await resolveFallbackSuggestion(suggestion.placeId);

      if (
        !resolvedLocation ||
        !Number.isFinite(resolvedLocation.latitude) ||
        !Number.isFinite(resolvedLocation.longitude)
      ) {
        setLookupError("Não foi possível confirmar esta morada agora.");
        return;
      }

      onChange({
        ...value,
        location_address:
          resolvedLocation.formatted_address || suggestion.formatted_address,
        formatted_address:
          resolvedLocation.formatted_address || suggestion.formatted_address,
        latitude: resolvedLocation.latitude ?? suggestion.latitude ?? null,
        longitude: resolvedLocation.longitude ?? suggestion.longitude ?? null,
        osm_place_id: resolvedLocation.osm_place_id || suggestion.osm_place_id,
        location_source:
          resolvedLocation.location_source || suggestion.location_source,
      });
      setSuggestions([]);
      setDropdownOpen(false);
    } catch {
      setLookupError("Não foi possível confirmar esta morada agora.");
    } finally {
      setResolvingPlaceId(null);
    }
  }

  const isCompact = compact ? "text-xs" : undefined;
  const sourceBadge =
    value.location_source === "google"
      ? "Google Places confirmado"
      : value.location_source === "osm"
      ? "OSM confirmado"
      : value.location_source === "manual"
        ? "Mapa ajustado manualmente"
        : null;

  return (
    <div className={cn(compact ? "space-y-2" : "space-y-4", className)}>
      <div className="space-y-1.5">
        <Label className={isCompact}>
          <MapPin size={12} className="mr-1 inline" />
          {locationLabel}
        </Label>
        <Input
          value={value.location}
          onChange={(event) => handleLocationInputChange(event.target.value)}
          placeholder={locationPlaceholder}
          autoComplete="off"
          className={compact ? "h-8 text-sm" : "text-sm"}
        />
      </div>

      <div className="relative space-y-1.5">
        <Label className={isCompact}>{addressLabel}</Label>
        <Input
          value={value.location_address}
          onFocus={() => {
            if (suggestions.length > 0) setDropdownOpen(true);
          }}
          onChange={(event) => handleAddressInputChange(event.target.value)}
          placeholder={addressPlaceholder}
          autoComplete="off"
          className={compact ? "h-8 text-sm" : "text-sm"}
        />
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Search size={12} />
            Usa este campo para procurar a morada ou o nome do recinto
          </span>
              {sourceBadge && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              {value.location_source === "google" || value.location_source === "osm" ? (
                <CheckCircle2 size={11} />
              ) : (
                <Target size={11} />
              )}
              {sourceBadge}
            </span>
          )}
        </div>
        {lookupError && (
          <p className="text-[11px] text-amber-700">{lookupError}</p>
        )}

        {dropdownOpen && (suggestions.length > 0 || searching) && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            {searching && (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
                <Loader2 size={14} className="animate-spin" />
                A procurar moradas...
              </div>
            )}
            {!searching &&
              suggestions.map((suggestion) => (
                <button
                  key={suggestion.placeId}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void handleSuggestionSelect(suggestion)}
                  className="flex w-full items-start gap-3 border-t border-slate-100 px-3 py-3 text-left transition-colors first:border-t-0 hover:bg-slate-50"
                  disabled={resolvingPlaceId === suggestion.placeId}
                >
                  {resolvingPlaceId === suggestion.placeId ? (
                    <Loader2 size={15} className="mt-0.5 animate-spin text-slate-400" />
                  ) : (
                    <MapPin size={15} className="mt-0.5 text-slate-400" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {suggestion.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                      {suggestion.formatted_address}
                    </p>
                  </div>
                </button>
              ))}
            {!searching && googlePlacesEnabled && suggestions.length > 0 && (
              <div className="border-t border-slate-100 px-3 py-2 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                Sugestões Google Places + fallback interno
              </div>
            )}
          </div>
        )}
      </div>

      <div className={cn(compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-3")}>
        <div className="space-y-1.5">
          <Label className={isCompact}>Latitude</Label>
          <Input
            value={latitudeInput}
            onChange={(event) =>
              handleCoordinateInputChange("latitude", event.target.value)
            }
            placeholder="ex: 39.2400001"
            inputMode="decimal"
            autoComplete="off"
            className={compact ? "h-8 text-sm" : "text-sm"}
          />
        </div>
        <div className="space-y-1.5">
          <Label className={isCompact}>Longitude</Label>
          <Input
            value={longitudeInput}
            onChange={(event) =>
              handleCoordinateInputChange("longitude", event.target.value)
            }
            placeholder="ex: -9.3088819"
            inputMode="decimal"
            autoComplete="off"
            className={compact ? "h-8 text-sm" : "text-sm"}
          />
        </div>
      </div>

      {!compact && (
        <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
          <p>
            Arrasta o marcador ou clica no mapa para afinar a localização.
          </p>
          {hasAnyLocationData(value) && (
            <button
              type="button"
              onClick={handleClearLocation}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <XCircle size={12} />
              Limpar mapa
            </button>
          )}
        </div>
      )}

      {showPreview && (
        <LocationMapPreview
          location={value.location}
          locationAddress={value.location_address}
          formattedAddress={value.formatted_address}
          latitude={value.latitude}
          longitude={value.longitude}
          accent={accent}
          label="Mapa"
          resolveFallback
          draggable={!compact}
          onLocationChange={(nextValue) => {
            setLookupError(null);
            onChange({
              ...value,
              location_address: nextValue.locationAddress ?? value.location_address,
              formatted_address:
                nextValue.formattedAddress ?? value.formatted_address,
              latitude: nextValue.latitude,
              longitude: nextValue.longitude,
              osm_place_id: nextValue.osmPlaceId ?? "",
              location_source: nextValue.locationSource ?? "manual",
            });
          }}
        />
      )}
    </div>
  );
}
