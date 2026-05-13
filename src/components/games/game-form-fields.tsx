"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationFields } from "@/components/maps/LocationFields";
import { EMPTY_LOCATION_FIELDS, type LocationSource } from "@/lib/location";
import { normalizeManualShortName } from "@/lib/football/short-name";

export type GameCompetitionOption = {
  id: string;
  name: string;
  season?: string | null;
  team_label?: string | null;
  inactive?: boolean;
};

export type SharedGameFormValues = {
  opponent_name: string;
  opponent_short_name: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  location_address: string;
  formatted_address: string;
  latitude: number | null;
  longitude: number | null;
  osm_place_id: string;
  location_source: LocationSource | null;
  is_home: boolean;
  competition_id: string;
};

type GameFormField = keyof SharedGameFormValues;

type Props = {
  values: SharedGameFormValues;
  onFieldChange: (
    field: GameFormField,
    value: SharedGameFormValues[GameFormField],
  ) => void;
  competitionOptions?: GameCompetitionOption[];
  showCompetitionSelect?: boolean;
  compact?: boolean;
  /**
   * Se fornecido, substitui os inputs default de opponent_name + opponent_short_name
   * por um nó custom (tipicamente o OpponentTypeahead). O caller é responsável
   * por sincronizar `values.opponent_name` e `values.opponent_short_name` via
   * `onFieldChange`.
   */
  renderOpponentField?: () => React.ReactNode;
};

function competitionLabel(option: GameCompetitionOption) {
  const teamTag = option.team_label ? ` · Equipa ${option.team_label}` : "";
  const seasonTag = option.season ? ` · ${option.season}` : "";
  const stateTag = option.inactive ? " · Fechada" : "";
  return `${option.name}${teamTag}${seasonTag}${stateTag}`;
}

export function GameFormFields({
  values,
  onFieldChange,
  competitionOptions = [],
  showCompetitionSelect = true,
  compact = false,
  renderOpponentField,
}: Props) {
  const inputSizeClass = compact ? "text-sm h-8" : "text-sm";
  const gridClass = compact
    ? "grid grid-cols-1 gap-2 sm:grid-cols-2"
    : "grid grid-cols-1 gap-3 sm:grid-cols-2";
  const sectionGap = compact ? "space-y-2" : "space-y-3";

  return (
    <div className={sectionGap}>
      {showCompetitionSelect && (
        <div className="space-y-1">
          <Label className={compact ? "text-xs" : undefined}>Competição (opcional)</Label>
          <select
            value={values.competition_id}
            onChange={(event) => onFieldChange("competition_id", event.target.value)}
            className={`w-full rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-700 ${inputSizeClass}`}
          >
            <option value="">Sem competição</option>
            {competitionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {competitionLabel(option)}
              </option>
            ))}
          </select>
        </div>
      )}

      {renderOpponentField ? (
        <div className="space-y-1">
          <Label className={compact ? "text-xs" : undefined}>Adversário *</Label>
          {renderOpponentField()}
        </div>
      ) : (
        <div className={gridClass}>
          <div className="space-y-1">
            <Label className={compact ? "text-xs" : undefined}>Adversário *</Label>
            <Input
              value={values.opponent_name}
              onChange={(event) => onFieldChange("opponent_name", event.target.value)}
              placeholder="Nome do adversário"
              required
              className={inputSizeClass}
            />
          </div>
          <div className="space-y-1">
            <Label className={compact ? "text-xs" : undefined}>Sigla do adversário</Label>
            <Input
              value={values.opponent_short_name}
              onChange={(event) =>
                onFieldChange(
                  "opponent_short_name",
                  normalizeManualShortName(event.target.value, 5) || "",
                )
              }
              placeholder="ex: SCP"
              maxLength={5}
              className={`${inputSizeClass} uppercase`}
            />
          </div>
        </div>
      )}

      <div className={gridClass}>
        <div className="space-y-1">
          <Label className={compact ? "text-xs" : undefined}>Data *</Label>
          <Input
            type="date"
            value={values.date}
            onChange={(event) => onFieldChange("date", event.target.value)}
            required
            className={inputSizeClass}
          />
        </div>
        <div className="space-y-1">
          <Label className={compact ? "text-xs" : undefined}>Início *</Label>
          <Input
            type="time"
            value={values.start_time}
            onChange={(event) => onFieldChange("start_time", event.target.value)}
            required
            className={inputSizeClass}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className={compact ? "text-xs" : undefined}>Fim</Label>
        <Input
          type="time"
          value={values.end_time}
          onChange={(event) => onFieldChange("end_time", event.target.value)}
          className={inputSizeClass}
        />
      </div>

      <LocationFields
        value={{
          ...EMPTY_LOCATION_FIELDS,
          location: values.location,
          location_address: values.location_address,
          formatted_address: values.formatted_address,
          latitude: values.latitude,
          longitude: values.longitude,
          osm_place_id: values.osm_place_id,
          location_source: values.location_source,
        }}
        onChange={(nextValue) => {
          onFieldChange("location", nextValue.location);
          onFieldChange("location_address", nextValue.location_address);
          onFieldChange("formatted_address", nextValue.formatted_address);
          onFieldChange("latitude", nextValue.latitude);
          onFieldChange("longitude", nextValue.longitude);
          onFieldChange("osm_place_id", nextValue.osm_place_id);
          onFieldChange("location_source", nextValue.location_source);
        }}
        locationLabel="Local"
        locationPlaceholder="Estádio / Campo"
        accent="blue"
        compact={compact}
      />

      <div className="space-y-1">
        <Label className={compact ? "text-xs" : undefined}>Casa ou Fora?</Label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onFieldChange("is_home", true)}
            className={`flex-1 rounded-xl font-medium border-2 transition-colors ${
              compact ? "py-1.5 text-xs" : "py-2.5 text-sm"
            } ${
              values.is_home
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-200 text-slate-500"
            }`}
          >
            🏠 Casa
          </button>
          <button
            type="button"
            onClick={() => onFieldChange("is_home", false)}
            className={`flex-1 rounded-xl font-medium border-2 transition-colors ${
              compact ? "py-1.5 text-xs" : "py-2.5 text-sm"
            } ${
              !values.is_home
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-500"
            }`}
          >
            ✈️ Fora
          </button>
        </div>
      </div>
    </div>
  );
}
