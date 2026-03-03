"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Expand, Loader2, MapPin } from "lucide-react";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
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
  locationSource?: "osm" | "manual" | null;
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
  onLocationChange?: (value: MapLocationChange) => void;
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const fullscreenControlRef = useRef<unknown>(null);
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
  }, [addressQuery, formattedAddress, latitude, longitude, resolveFallback]);

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
          dragging: interactive,
          doubleClickZoom: interactive,
          scrollWheelZoom: false,
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
      }

      const currentMap = mapRef.current as import("leaflet").Map;

      if (!fullscreenControlRef.current) {
        const FullscreenControl = leaflet.Control.extend({
          options: { position: "topleft" },
          onAdd() {
            const container = leaflet.DomUtil.create(
              "div",
              "leaflet-bar coach11-map-fullscreen-control",
            );
            const button = leaflet.DomUtil.create("a", "", container);
            button.href = "#";
            button.title = "Full screen";
            button.setAttribute("aria-label", "Abrir mapa em ecrã inteiro");
            button.innerHTML = `<span class="coach11-map-fullscreen-icon">⤢</span>`;

            leaflet.DomEvent.disableClickPropagation(container);
            leaflet.DomEvent.on(button, "click", (event: Event) => {
              leaflet.DomEvent.stop(event);

              const element = rootRef.current;
              if (!element) return;

              if (document.fullscreenElement === element) {
                void document.exitFullscreen().catch(() => null);
              } else {
                void element.requestFullscreen().catch(() => null);
              }

              window.setTimeout(() => {
                currentMap.invalidateSize(false);
              }, 200);
            });

            return container;
          },
        });

        fullscreenControlRef.current = new FullscreenControl();
        currentMap.addControl(
          fullscreenControlRef.current as import("leaflet").Control,
        );
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

      currentMap.setView(point, 15.5, { animate: false });

      if (!markerRef.current) {
        markerRef.current = leaflet
          .marker(point, {
            icon: markerIconInstance,
            riseOnHover: true,
            draggable,
          })
          .addTo(currentMap);
      } else {
        const marker = markerRef.current as import("leaflet").Marker;
        marker.setLatLng(point);
        marker.setIcon(markerIconInstance);
        if (draggable) {
          marker.dragging?.enable();
        } else {
          marker.dragging?.disable();
        }
      }

      const marker = markerRef.current as import("leaflet").Marker;
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
          const response = await fetch(
            `/api/location/reverse?lat=${encodeURIComponent(String(normalizedLatitude))}&lng=${encodeURIComponent(String(normalizedLongitude))}`,
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

          if (
            manualSyncRequestIdRef.current !== requestId ||
            !response.ok
          ) {
            return;
          }

          const nextAddress = payload?.location?.formatted_address || null;
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

      marker.off("dragend");
      currentMap.off("click");

      if (draggable) {
        marker.on("dragend", () => {
          const markerPoint = marker.getLatLng();
          currentMap.panTo(markerPoint, { animate: false });
          void syncManualPosition(markerPoint.lat, markerPoint.lng);
        });

        currentMap.on("click", (event: import("leaflet").LeafletMouseEvent) => {
          marker.setLatLng(event.latlng);
          void syncManualPosition(event.latlng.lat, event.latlng.lng);
        });
      }

      window.requestAnimationFrame(() => {
        currentMap.invalidateSize(false);
      });
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [
    accent,
    draggable,
    interactive,
    locationTitle,
    onLocationChange,
    resolvedAddress,
    resolvedLocation,
  ]);

  useEffect(() => {
    if (!mapRef.current) return;

    const handleFullscreenChange = () => {
      window.setTimeout(() => {
        (mapRef.current as import("leaflet").Map | null)?.invalidateSize(false);
      }, 150);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        (mapRef.current as import("leaflet").Map).remove();
        mapRef.current = null;
        markerRef.current = null;
        fullscreenControlRef.current = null;
      }
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={cn(
        "coach11-map-shell overflow-hidden rounded-2xl border border-slate-200 bg-white",
        className,
      )}
    >
      <div className="coach11-map-canvas aspect-[16/10] bg-slate-100">
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
                {addressQuery || "Seleciona uma morada para gerar o mapa."}
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
          {locationTitle && (
            <p className="mt-1 truncate text-sm font-semibold text-slate-800">
              {locationTitle}
            </p>
          )}
          <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-700">
            <MapPin size={14} className="shrink-0 text-slate-400" />
            {resolvedAddress || "Localização por confirmar"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span>Leaflet + OpenStreetMap contributors</span>
            {(draggable || syncingManualPoint) && (
              <span className="inline-flex items-center gap-1">
                {syncingManualPoint ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Expand size={11} />
                )}
                {syncingManualPoint
                  ? "A atualizar morada..."
                  : "Arrasta o marcador para afinar o ponto"}
              </span>
            )}
          </div>
        </div>
        <OpenMapsButton
          location={locationTitle}
          locationAddress={resolvedAddress}
          formattedAddress={resolvedAddress}
          latitude={resolvedLocation?.latitude ?? latitude}
          longitude={resolvedLocation?.longitude ?? longitude}
          accent={accent}
          label="Abrir"
        />
      </div>
    </div>
  );
}
