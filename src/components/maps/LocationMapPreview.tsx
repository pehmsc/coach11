"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { OpenMapsButton } from "@/components/maps/OpenMapsButton";
import {
  hasCoordinates,
  resolveFormattedAddress,
  resolveLocationLabel,
} from "@/lib/location";
import { cn } from "@/lib/utils";

type Accent = "emerald" | "blue" | "slate";

type Props = {
  location?: string | null;
  locationAddress?: string | null;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  label?: string;
  accent?: Accent;
  resolveFallback?: boolean;
  className?: string;
};

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

export function LocationMapPreview({
  location,
  locationAddress,
  formattedAddress,
  latitude,
  longitude,
  label = "Mapa",
  accent = "emerald",
  resolveFallback = false,
  className,
}: Props) {
  const [fallbackCoords, setFallbackCoords] = useState<{
    latitude: number;
    longitude: number;
    formattedAddress: string | null;
  } | null>(null);
  const [resolvingFallback, setResolvingFallback] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const locationTitle = useMemo(() => {
    const normalized = typeof location === "string" ? location.trim() : "";
    return normalized || null;
  }, [location]);

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
  const locationLabel = resolveLocationLabel(
    location,
    resolvedLocation?.formattedAddress ?? formattedAddress,
    locationAddress,
  );
  const popupTitle = locationTitle;
  const query = locationLabel;

  useEffect(() => {
    if (
      !resolveFallback ||
      !query ||
      hasCoordinates({ latitude, longitude })
    ) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setResolvingFallback(true);

      try {
        const autocompleteRes = await fetch(
          `/api/location/autocomplete?q=${encodeURIComponent(query)}&limit=1`,
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
          if (!cancelled) setFallbackCoords(null);
          return;
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
          if (!cancelled) setFallbackCoords(null);
          return;
        }

        if (!cancelled) {
          setFallbackCoords({
            latitude: resolvedLatitude as number,
            longitude: resolvedLongitude as number,
            formattedAddress:
              resolvePayload?.location?.formatted_address || formattedAddress || null,
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
  }, [formattedAddress, latitude, longitude, query, resolveFallback]);

  useEffect(() => {
    if (!mapContainerRef.current || !resolvedLocation) return;

    let cancelled = false;

    const init = async () => {
      const leaflet = await import("leaflet");
      if (cancelled || !mapContainerRef.current) return;

      const point: [number, number] = [
        resolvedLocation.latitude,
        resolvedLocation.longitude,
      ];

      if (!mapRef.current) {
        const mapInstance = leaflet.map(mapContainerRef.current, {
          zoomControl: true,
          attributionControl: true,
          dragging: true,
          doubleClickZoom: true,
          scrollWheelZoom: false,
          boxZoom: true,
          keyboard: true,
          touchZoom: true,
          tapHold: true,
          zoomSnap: 0.5,
        });

        leaflet
          .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            crossOrigin: true,
            attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors',
          })
          .addTo(mapInstance);

        mapRef.current = mapInstance;
      }

      const markerIconInstance = leaflet.icon({
        iconRetinaUrl: markerIcon2x.src,
        iconUrl: markerIcon.src,
        shadowUrl: markerShadow.src,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      const currentMap = mapRef.current as import("leaflet").Map;
      currentMap.setView(point, 15.5, { animate: false });

      if (!markerRef.current) {
        markerRef.current = leaflet
          .marker(point, {
            icon: markerIconInstance,
            riseOnHover: true,
          })
          .addTo(currentMap);
      } else {
        (markerRef.current as import("leaflet").Marker).setLatLng(point);
        (markerRef.current as import("leaflet").Marker).setIcon(markerIconInstance);
      }

      (markerRef.current as import("leaflet").Marker)
        .bindPopup(buildPopupContent(popupTitle, resolvedAddress), {
          autoPan: false,
          closeButton: false,
          className: accent === "blue"
            ? "coach11-map-popup-shell coach11-map-popup-shell-blue"
            : accent === "slate"
              ? "coach11-map-popup-shell coach11-map-popup-shell-slate"
              : "coach11-map-popup-shell coach11-map-popup-shell-emerald",
        })
        .openPopup();

      window.requestAnimationFrame(() => {
        currentMap.invalidateSize(false);
      });
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [accent, popupTitle, resolvedAddress, resolvedLocation]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        (mapRef.current as import("leaflet").Map).remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-200 bg-white",
        className,
      )}
    >
      <div className="aspect-[16/10] bg-slate-100">
        {resolvedLocation ? (
          <div ref={mapContainerRef} className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_#e2e8f0,_#f8fafc_65%)] px-6 text-center">
            <div className="space-y-2">
              {resolvingFallback ? (
                <Loader2 className="mx-auto animate-spin text-slate-400" size={22} />
              ) : (
                <MapPin className="mx-auto text-slate-300" size={24} />
              )}
              <p className="text-sm font-medium text-slate-700">
                {resolvingFallback ? "A confirmar localização..." : "Localização por confirmar"}
              </p>
              <p className="text-xs text-slate-500">
                {query || "Seleciona uma morada para gerar o mapa."}
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {label}
          </p>
          <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-700">
            <MapPin size={14} className="shrink-0 text-slate-400" />
            {query || "Localização por confirmar"}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Leaflet + OpenStreetMap contributors
          </p>
        </div>
        <OpenMapsButton
          location={location}
          locationAddress={locationAddress}
          formattedAddress={resolvedLocation?.formattedAddress ?? formattedAddress}
          latitude={resolvedLocation?.latitude ?? latitude}
          longitude={resolvedLocation?.longitude ?? longitude}
          accent={accent}
          label="Abrir"
        />
      </div>
    </div>
  );
}
