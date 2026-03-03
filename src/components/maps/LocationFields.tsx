"use client";

import { useDeferredValue, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationMapPreview } from "@/components/maps/LocationMapPreview";
import { type LocationFieldsValue } from "@/lib/location";
import { cn } from "@/lib/utils";

type Accent = "emerald" | "blue" | "slate";
type Suggestion = {
  placeId: string;
  title: string;
  subtitle: string | null;
  formatted_address: string;
  latitude: number;
  longitude: number;
  osm_place_id: string;
  location_source: "osm";
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
  const latestRequestIdRef = useRef(0);
  const deferredAddress = useDeferredValue(value.location_address);

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
      formatted_address: "",
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

  useEffect(() => {
    const query = deferredAddress.trim();
    if (query.length < 3) return;

    const timeoutId = window.setTimeout(async () => {
      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;
      setSearching(true);

      try {
        const response = await fetch(
          `/api/location/autocomplete?q=${encodeURIComponent(query)}`,
          {
            cache: "no-store",
          },
        );
        const payload = (await response.json().catch(() => null)) as
          | {
              suggestions?: Suggestion[];
            }
          | null;

        if (latestRequestIdRef.current !== requestId) return;

        if (!response.ok) {
          setSuggestions([]);
          return;
        }

        setSuggestions(Array.isArray(payload?.suggestions) ? payload.suggestions : []);
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
  }, [deferredAddress]);

  async function handleSuggestionSelect(suggestion: Suggestion) {
    setResolvingPlaceId(suggestion.placeId);
    setLookupError(null);

    try {
      const response = await fetch(
        `/api/location/resolve?placeId=${encodeURIComponent(suggestion.placeId)}`,
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
              location_source?: "osm";
            };
          }
        | null;

      const resolvedLocation = payload?.location;
      if (
        !response.ok ||
        !resolvedLocation ||
        !Number.isFinite(resolvedLocation.latitude) ||
        !Number.isFinite(resolvedLocation.longitude)
      ) {
        setLookupError("Não foi possível confirmar esta morada agora.");
        return;
      }

      onChange({
        ...value,
        location: value.location.trim() || suggestion.title,
        location_address:
          resolvedLocation.formatted_address || suggestion.formatted_address,
        formatted_address:
          resolvedLocation.formatted_address || suggestion.formatted_address,
        latitude: resolvedLocation.latitude ?? suggestion.latitude,
        longitude: resolvedLocation.longitude ?? suggestion.longitude,
        osm_place_id: resolvedLocation.osm_place_id || suggestion.osm_place_id,
        location_source: "osm",
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
    value.location_source === "osm"
      ? "OSM confirmado"
      : value.location_source === "manual"
        ? "Morada manual"
        : null;

  return (
    <div className={cn(compact ? "space-y-2" : "space-y-3", className)}>
      <div className="space-y-1">
        <Label className={isCompact}>
          <MapPin size={12} className="mr-1 inline" />
          {locationLabel}
        </Label>
        <Input
          value={value.location}
          onChange={(event) => handleLocationInputChange(event.target.value)}
          placeholder={locationPlaceholder}
          className={compact ? "h-8 text-sm" : "text-sm"}
        />
      </div>

      <div className="relative space-y-1">
        <Label className={isCompact}>{addressLabel}</Label>
        <Input
          value={value.location_address}
          onFocus={() => {
            if (suggestions.length > 0) setDropdownOpen(true);
          }}
          onChange={(event) => handleAddressInputChange(event.target.value)}
          placeholder={addressPlaceholder}
          className={compact ? "h-8 text-sm" : "text-sm"}
        />
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Search size={12} />
            Pesquisa OSM com debounce e validação server-side
          </span>
          {sourceBadge && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              {value.location_source === "osm" ? (
                <CheckCircle2 size={11} />
              ) : (
                <MapPin size={11} />
              )}
              {sourceBadge}
            </span>
          )}
        </div>
        {lookupError && (
          <p className="text-[11px] text-amber-700">
            {lookupError}
          </p>
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
          </div>
        )}
      </div>

      {showPreview && (
        <LocationMapPreview
          location={value.location}
          locationAddress={value.location_address}
          formattedAddress={value.formatted_address}
          latitude={value.latitude}
          longitude={value.longitude}
          accent={accent}
          label="Pré-visualização"
          resolveFallback
        />
      )}
    </div>
  );
}
