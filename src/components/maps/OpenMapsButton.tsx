"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink, Navigation, X } from "lucide-react";
import {
  buildAppleMapsUrl,
  buildGoogleMapsUrl,
  buildWazeUrl,
  detectMapsPlatform,
} from "@/lib/maps";
import { cn } from "@/lib/utils";

type Accent = "emerald" | "blue" | "slate";
type Variant = "solid" | "link" | "icon";

type Props = {
  location?: string | null;
  locationAddress?: string | null;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  label?: string;
  title?: string;
  accent?: Accent;
  variant?: Variant;
  className?: string;
  children?: ReactNode;
};

function resolveVariantClasses(variant: Variant, accent: Accent) {
  if (variant === "icon") {
    if (accent === "blue") {
      return "rounded-full bg-blue-50 p-1.5 text-blue-700 hover:bg-blue-100";
    }
    if (accent === "slate") {
      return "rounded-full bg-slate-100 p-1.5 text-slate-700 hover:bg-slate-200";
    }
    return "rounded-full bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100";
  }

  if (variant === "link") {
    if (accent === "blue") {
      return "text-blue-600 hover:text-blue-700 hover:underline";
    }
    if (accent === "slate") {
      return "text-slate-600 hover:text-slate-800 hover:underline";
    }
    return "text-emerald-600 hover:text-emerald-700 hover:underline";
  }

  if (accent === "blue") {
    return "rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700";
  }
  if (accent === "slate") {
    return "rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800";
  }
  return "rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700";
}

export function OpenMapsButton({
  location,
  locationAddress,
  formattedAddress,
  latitude,
  longitude,
  label = "Obter Direções",
  title,
  accent = "emerald",
  variant = "solid",
  className,
  children,
}: Props) {
  const [chooserOpen, setChooserOpen] = useState(false);

  const platform =
    typeof navigator === "undefined"
      ? {
          isMobile: false,
          isAppleMobile: false,
          isAndroid: false,
        }
      : detectMapsPlatform(
          navigator.userAgent || "",
          navigator.platform || "",
          navigator.maxTouchPoints || 0,
        );

  const googleUrl = buildGoogleMapsUrl({
    location,
    locationAddress,
    formattedAddress,
    latitude,
    longitude,
  });
  const appleUrl = buildAppleMapsUrl({
    location,
    locationAddress,
    formattedAddress,
    latitude,
    longitude,
  });
  const wazeUrl = buildWazeUrl({
    location,
    locationAddress,
    formattedAddress,
    latitude,
    longitude,
  });

  if (!googleUrl) return null;

  function handleOpen() {
    if (platform.isMobile) {
      setChooserOpen(true);
      return;
    }
    window.open(googleUrl ?? undefined, "_blank", "noopener,noreferrer");
  }

  const options = [
    {
      id: "google",
      label: "Google Maps",
      href: googleUrl,
    },
    ...(platform.isAppleMobile
      ? [
          {
            id: "apple",
            label: "Apple Maps",
            href: appleUrl,
          },
        ]
      : []),
    {
      id: "waze",
      label: "Waze",
      href: wazeUrl,
    },
  ].filter((option): option is { id: string; label: string; href: string } => !!option.href);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title={title || label}
        className={cn(
          "inline-flex items-center justify-center gap-2 transition-colors",
          resolveVariantClasses(variant, accent),
          className,
        )}
      >
        {children || (
          <>
            <Navigation size={variant === "icon" ? 16 : 14} />
            {variant !== "icon" && label}
          </>
        )}
      </button>

      {chooserOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/45 px-4 pb-4 pt-10 md:items-center"
          onClick={() => setChooserOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Abrir com</p>
                <p className="mt-1 text-xs text-slate-500">
                  Escolhe a app de navegação para esta localização.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChooserOpen(false)}
                className="text-slate-400 transition-colors hover:text-slate-700"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {options.map((option) => (
                <a
                  key={option.id}
                  href={option.href}
                  onClick={() => setChooserOpen(false)}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <span>{option.label}</span>
                  <ExternalLink size={14} className="text-slate-400" />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
