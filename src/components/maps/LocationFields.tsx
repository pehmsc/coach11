"use client";

import { useId } from "react";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationMapPreview } from "@/components/maps/LocationMapPreview";
import { useLocationSuggestions } from "@/components/maps/use-location-suggestions";
import { cn } from "@/lib/utils";

type Accent = "emerald" | "blue" | "slate";

type Props = {
  location: string;
  locationAddress: string;
  onLocationChange: (value: string) => void;
  onLocationAddressChange: (value: string) => void;
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
  location,
  locationAddress,
  onLocationChange,
  onLocationAddressChange,
  locationLabel = "Nome do local",
  addressLabel = "Morada completa",
  locationPlaceholder = "ex: Campo 1, Complexo Desportivo",
  addressPlaceholder = "ex: Rua do Campo, 1, Lisboa",
  accent = "emerald",
  compact = false,
  showPreview = true,
  className,
}: Props) {
  const locationListId = useId();
  const addressListId = useId();
  const { locations, addresses } = useLocationSuggestions();

  return (
    <div className={cn(compact ? "space-y-2" : "space-y-3", className)}>
      <div className="space-y-1">
        <Label className={compact ? "text-xs" : undefined}>
          <MapPin size={12} className="mr-1 inline" />
          {locationLabel}
        </Label>
        <Input
          list={locations.length > 0 ? locationListId : undefined}
          value={location}
          onChange={(event) => onLocationChange(event.target.value)}
          placeholder={locationPlaceholder}
          className={compact ? "h-8 text-sm" : "text-sm"}
        />
        {locations.length > 0 && (
          <datalist id={locationListId}>
            {locations.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        )}
      </div>

      <div className="space-y-1">
        <Label className={compact ? "text-xs" : undefined}>{addressLabel}</Label>
        <Input
          list={addresses.length > 0 ? addressListId : undefined}
          value={locationAddress}
          onChange={(event) => onLocationAddressChange(event.target.value)}
          placeholder={addressPlaceholder}
          className={compact ? "h-8 text-sm" : "text-sm"}
        />
        {addresses.length > 0 && (
          <datalist id={addressListId}>
            {addresses.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        )}
        {(locations.length > 0 || addresses.length > 0) && (
          <p className="text-[11px] text-slate-500">
            Sugestões automáticas com base nos locais já usados no escalão.
          </p>
        )}
      </div>

      {showPreview && (
        <LocationMapPreview
          location={location}
          locationAddress={locationAddress}
          accent={accent}
          label="Pré-visualização"
        />
      )}
    </div>
  );
}
