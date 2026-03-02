import { MapPin } from "lucide-react";
import { OpenMapsButton } from "@/components/maps/OpenMapsButton";
import { buildGoogleMapsEmbedUrl, resolveMapsQuery } from "@/lib/maps";
import { cn } from "@/lib/utils";

type Accent = "emerald" | "blue" | "slate";

type Props = {
  location?: string | null;
  locationAddress?: string | null;
  label?: string;
  accent?: Accent;
  className?: string;
};

export function LocationMapPreview({
  location,
  locationAddress,
  label = "Mapa",
  accent = "emerald",
  className,
}: Props) {
  const query = resolveMapsQuery(locationAddress, location);
  const embedUrl = buildGoogleMapsEmbedUrl(query);
  if (!query || !embedUrl) return null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-200 bg-white",
        className,
      )}
    >
      <div className="aspect-[16/10] bg-slate-100">
        <iframe
          title={`Mapa de ${query}`}
          src={embedUrl}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-full w-full border-0"
        />
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {label}
          </p>
          <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-slate-700">
            <MapPin size={14} className="shrink-0 text-slate-400" />
            {query}
          </p>
        </div>
        <OpenMapsButton
          location={location}
          locationAddress={locationAddress}
          accent={accent}
          label="Abrir"
        />
      </div>
    </div>
  );
}
