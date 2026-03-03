"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { OpenMapsButton } from "@/components/maps/OpenMapsButton";
import {
  hasCoordinates,
  resolveFormattedAddress,
} from "@/lib/location";
import { cn } from "@/lib/utils";

type Accent = "emerald" | "blue" | "slate";

type MapLocationChange = {
  latitude: number;
  longitude: number;
  formattedAddress?: string | null;
  locationAddress?: string | null;
  osmPlaceId?: string | null;
  locationSource?: "google" | "osm" | "manual" | null;
};

type Props = {
  location?: string | null;
  locationAddress?: string | null;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  label?: string;
  accent?: Accent;
  resolveFallback?: boolean;
  interactive?: boolean;
  draggable?: boolean;
  showDirectionsButton?: boolean;
  onLocationChange?: (value: MapLocationChange) => void;
  className?: string;
};

const DEFAULT_MAP_CENTER: [number, number] = [39.557191, -8.011003];
const DEFAULT_MAP_ZOOM = 6.5;
const DETAIL_MAP_ZOOM = 15.5;
const LEAFLET_MARKER_ICON_URL = "/leaflet/marker-icon.png";
const LEAFLET_MARKER_ICON_RETINA_URL = "/leaflet/marker-icon-2x.png";
const LEAFLET_MARKER_SHADOW_URL = "/leaflet/marker-shadow.png";

async function resolveFallbackFromApi(addressQuery: string) {
  const autocompleteRes = await fetch(
    `/api/location/autocomplete?q=${encodeURIComponent(addressQuery)}&limit=1`,
    {
      cache: "force-cache",
    },
  );
  const autocompletePayload = (await autocompleteRes
    .json()
    .catch(() => null)) as
    | {
        suggestions?: Array<{ placeId?: string }>;
      }
    | null;

  const placeId = autocompletePayload?.suggestions?.[0]?.placeId;
  if (!autocompleteRes.ok || !placeId) {
    return null;
  }

  const resolveRes = await fetch(
    `/api/location/resolve?placeId=${encodeURIComponent(placeId)}`,
    {
      cache: "force-cache",
    },
  );
  const resolvePayload = (await resolveRes
    .json()
    .catch(() => null)) as
    | {
        location?: {
          latitude?: number;
          longitude?: number;
          formatted_address?: string | null;
        };
      }
    | null;

  const resolvedLatitude = resolvePayload?.location?.latitude;
  const resolvedLongitude = resolvePayload?.location?.longitude;
  if (
    !resolveRes.ok ||
    !Number.isFinite(resolvedLatitude) ||
    !Number.isFinite(resolvedLongitude)
  ) {
    return null;
  }

  return {
    latitude: resolvedLatitude as number,
    longitude: resolvedLongitude as number,
    formattedAddress: resolvePayload?.location?.formatted_address || null,
  };
}

async function reverseFromApi(latitude: number, longitude: number) {
  const response = await fetch(
    `/api/location/reverse?lat=${encodeURIComponent(String(latitude))}&lng=${encodeURIComponent(String(longitude))}`,
    {
      cache: "no-store",
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        location?: {
          formatted_address?: string | null;
        };
      }
    | null;

  if (!response.ok) return null;
  return payload?.location?.formatted_address || null;
}

function buildPopupContent(title: string | null, address: string | null) {
  const wrapper = document.createElement("div");
  wrapper.className = "coach11-map-popup";

  if (title) {
    const heading = document.createElement("h4");
    heading.textContent = title;
    wrapper.appendChild(heading);
  }

  if (address && address !== title) {
    const description = document.createElement("p");
    description.textContent = address;
    wrapper.appendChild(description);
  }

  return wrapper;
}

function formatCoordinate(value: number) {
  return Number(value.toFixed(7));
}

export function LocationMapPreview({
  location,
  locationAddress,
  formattedAddress,
  latitude,
  longitude,
  label = "Mapa",
  accent = "emerald",
  resolveFallback = false,
  interactive = true,
  draggable = false,
  showDirectionsButton = true,
  onLocationChange,
  className,
}: Props) {
  const [fallbackCoords, setFallbackCoords] = useState<{
    latitude: number;
    longitude: number;
    formattedAddress: string | null;
  } | null>(null);
  const [resolvingFallback, setResolvingFallback] = useState(false);
  const [syncingManualPoint, setSyncingManualPoint] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const manualSyncRequestIdRef = useRef(0);

  const locationTitle = useMemo(() => {
    const normalized = typeof location === "string" ? location.trim() : "";
    return normalized || null;
  }, [location]);

  const addressQuery = resolveFormattedAddress(formattedAddress, locationAddress);
  const resolvedLocation = useMemo(() => {
    if (hasCoordinates({ latitude, longitude })) {
      return {
        latitude: latitude as number,
        longitude: longitude as number,
        formattedAddress,
      };
    }

    if (fallbackCoords) {
      return fallbackCoords;
    }

    return null;
  }, [fallbackCoords, formattedAddress, latitude, longitude]);

  const resolvedAddress = resolveFormattedAddress(
    resolvedLocation?.formattedAddress ?? formattedAddress,
    locationAddress,
  );

  useEffect(() => {
    if (
      !resolveFallback ||
      !addressQuery ||
      hasCoordinates({ latitude, longitude })
    ) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setResolvingFallback(true);

      try {
        const resolvedFromSearch = await resolveFallbackFromApi(addressQuery);

        if (!resolvedFromSearch) {
          if (!cancelled) setFallbackCoords(null);
          return;
        }

        if (!cancelled) {
          setFallbackCoords({
            latitude: resolvedFromSearch.latitude,
            longitude: resolvedFromSearch.longitude,
            formattedAddress:
              resolvedFromSearch.formattedAddress || formattedAddress || null,
          });
        }
      } finally {
        if (!cancelled) setResolvingFallback(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    addressQuery,
    formattedAddress,
    latitude,
    longitude,
    resolveFallback,
  ]);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    let cancelled = false;

    const init = async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !mapContainerRef.current || mapRef.current) return;

      leafletRef.current = leaflet;

      const mapInstance = leaflet.map(mapContainerRef.current, {
        center: DEFAULT_MAP_CENTER,
        zoom: DEFAULT_MAP_ZOOM,
        zoomControl: true,
        attributionControl: true,
        dragging: interactive,
        doubleClickZoom: interactive,
        scrollWheelZoom: interactive,
        boxZoom: interactive,
        keyboard: interactive,
        touchZoom: interactive,
        tapHold: interactive,
        zoomSnap: 0.5,
      });

      leaflet
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          crossOrigin: true,
          attribution:
            '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors',
        })
        .addTo(mapInstance);

      mapRef.current = mapInstance;
      setMapReady(true);

      window.requestAnimationFrame(() => {
        mapInstance.invalidateSize(false);
      });
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [interactive]);

  useEffect(() => {
    if (!mapReady) return;

    const currentMap = mapRef.current as import("leaflet").Map | null;
    const leaflet = leafletRef.current;
    if (!currentMap || !leaflet) return;

    const markerIconInstance = leaflet.icon({
      iconRetinaUrl: LEAFLET_MARKER_ICON_RETINA_URL,
      iconUrl: LEAFLET_MARKER_ICON_URL,
      shadowUrl: LEAFLET_MARKER_SHADOW_URL,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });

    const ensureMarker = (point: [number, number]) => {
      if (!markerRef.current) {
        markerRef.current = leaflet
          .marker(point, {
            icon: markerIconInstance,
            riseOnHover: true,
            draggable,
          })
          .addTo(currentMap);
      }

      const marker = markerRef.current as import("leaflet").Marker;
      marker.setLatLng(point);
      marker.setIcon(markerIconInstance);

      if (draggable) {
        marker.dragging?.enable();
      } else {
        marker.dragging?.disable();
      }

      return marker;
    };

    const removeMarker = () => {
      if (!markerRef.current) return;
      currentMap.removeLayer(markerRef.current as import("leaflet").Marker);
      markerRef.current = null;
    };

    const syncManualPosition = async (nextLatitude: number, nextLongitude: number) => {
      const normalizedLatitude = formatCoordinate(nextLatitude);
      const normalizedLongitude = formatCoordinate(nextLongitude);
      const requestId = manualSyncRequestIdRef.current + 1;
      manualSyncRequestIdRef.current = requestId;

      onLocationChange?.({
        latitude: normalizedLatitude,
        longitude: normalizedLongitude,
        formattedAddress: resolvedAddress,
        locationAddress: resolvedAddress,
        osmPlaceId: "",
        locationSource: "manual",
      });

        setSyncingManualPoint(true);
        try {
          const nextAddress = await reverseFromApi(
            normalizedLatitude,
            normalizedLongitude,
          ).catch(() => null);

          if (manualSyncRequestIdRef.current !== requestId) {
            return;
          }

          onLocationChange?.({
            latitude: normalizedLatitude,
            longitude: normalizedLongitude,
          formattedAddress: nextAddress,
          locationAddress: nextAddress,
          osmPlaceId: "",
          locationSource: "manual",
        });
      } catch {
        // Ignore reverse lookup failures; the coordinates are still valid.
      } finally {
        if (manualSyncRequestIdRef.current === requestId) {
          setSyncingManualPoint(false);
        }
      }
    };

    const activePoint = resolvedLocation
      ? ([resolvedLocation.latitude, resolvedLocation.longitude] as [number, number])
      : null;

    if (activePoint) {
      currentMap.setView(activePoint, DETAIL_MAP_ZOOM, { animate: false });
      const marker = ensureMarker(activePoint);
      marker
        .bindPopup(buildPopupContent(locationTitle, resolvedAddress), {
          autoPan: false,
          closeButton: true,
          className:
            accent === "blue"
              ? "coach11-map-popup-shell coach11-map-popup-shell-blue"
              : accent === "slate"
                ? "coach11-map-popup-shell coach11-map-popup-shell-slate"
                : "coach11-map-popup-shell coach11-map-popup-shell-emerald",
        })
        .openPopup();
    } else {
      removeMarker();
      currentMap.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM, { animate: false });
    }

    const handleMapClick = (event: import("leaflet").LeafletMouseEvent) => {
      if (!draggable) return;

      const marker = ensureMarker([event.latlng.lat, event.latlng.lng]);
      marker.closePopup();
      currentMap.panTo(event.latlng, { animate: false });
      void syncManualPosition(event.latlng.lat, event.latlng.lng);
    };

    const marker = markerRef.current as import("leaflet").Marker | null;
    const handleMarkerDragEnd = () => {
      if (!markerRef.current) return;
      const markerPoint = (
        markerRef.current as import("leaflet").Marker
      ).getLatLng();
      currentMap.panTo(markerPoint, { animate: false });
      void syncManualPosition(markerPoint.lat, markerPoint.lng);
    };

    currentMap.off("click", handleMapClick);
    marker?.off("dragend", handleMarkerDragEnd);

    if (draggable) {
      currentMap.on("click", handleMapClick);
      marker?.on("dragend", handleMarkerDragEnd);
    }

    window.requestAnimationFrame(() => {
      currentMap.invalidateSize(false);
    });

    return () => {
      currentMap.off("click", handleMapClick);
      marker?.off("dragend", handleMarkerDragEnd);
    };
  }, [
    accent,
    draggable,
    mapReady,
    locationTitle,
    onLocationChange,
    resolvedAddress,
    resolvedLocation,
  ]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        (mapRef.current as import("leaflet").Map).remove();
        mapRef.current = null;
        markerRef.current = null;
        leafletRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className={cn(
        "coach11-map-shell overflow-hidden rounded-2xl border border-slate-200 bg-white",
        className,
      )}
    >
      <div className="coach11-map-canvas relative h-[250px] bg-slate-100 sm:h-[280px]">
        <div ref={mapContainerRef} className="h-full w-full" />
        {(!resolvedLocation || resolvingFallback) && (
          <div className="pointer-events-none absolute inset-x-4 top-4 z-[500] max-w-xs rounded-2xl border border-white/70 bg-white/92 px-3 py-2 shadow-lg shadow-slate-900/8 backdrop-blur">
            <div className="flex items-start gap-2">
              {resolvingFallback ? (
                <Loader2 className="mt-0.5 animate-spin text-slate-400" size={16} />
              ) : (
                <MapPin className="mt-0.5 text-slate-300" size={16} />
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">
                  {resolvingFallback
                    ? "A confirmar localização..."
                    : "Mapa centrado em Portugal"}
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                  {addressQuery ||
                    (draggable
                      ? "Pesquisa uma morada ou clica no mapa para fixar o ponto."
                      : "A localização deste evento ainda não foi confirmada.")}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {label}
          </p>
          {locationTitle && (
            <p className="mt-1 truncate text-sm font-semibold text-slate-800">
              {locationTitle}
            </p>
          )}
          <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-700">
            <MapPin size={14} className="shrink-0 text-slate-400" />
            {resolvedAddress || "Localização por confirmar"}
          </p>
          {syncingManualPoint && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Loader2 size={11} className="animate-spin" />
                A atualizar morada...
              </span>
            </div>
          )}
        </div>
        {showDirectionsButton ? (
          <OpenMapsButton
            location={locationTitle}
            locationAddress={resolvedAddress}
            formattedAddress={resolvedAddress}
            latitude={resolvedLocation?.latitude ?? latitude}
            longitude={resolvedLocation?.longitude ?? longitude}
            accent={accent}
            label="Obter Direções"
            size="compact"
            className="shrink-0 self-start"
          />
        ) : null}
      </div>
    </div>
  );
}
