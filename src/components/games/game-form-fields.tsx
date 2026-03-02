"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeManualShortName } from "@/lib/football/short-name";
import { buildGoogleMapsUrl, resolveMapsQuery } from "@/lib/maps";

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
  location: string;
  location_address: string;
  is_home: boolean;
  competition_id: string;
};

type GameFormField = keyof SharedGameFormValues;

type Props = {
  values: SharedGameFormValues;
  onFieldChange: (field: GameFormField, value: string | boolean) => void;
  competitionOptions?: GameCompetitionOption[];
  showCompetitionSelect?: boolean;
  compact?: boolean;
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
}: Props) {
  const inputSizeClass = compact ? "text-sm h-8" : "text-sm";
  const gridClass = compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-3";
  const sectionGap = compact ? "space-y-2" : "space-y-3";
  const mapsUrl = buildGoogleMapsUrl(
    resolveMapsQuery(values.location_address, values.location),
  );

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
          <Label className={compact ? "text-xs" : undefined}>Hora *</Label>
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
        <Label className={compact ? "text-xs" : undefined}>Local</Label>
        <Input
          value={values.location}
          onChange={(event) => onFieldChange("location", event.target.value)}
          placeholder="Estádio / Campo"
          className={inputSizeClass}
        />
      </div>

      <div className="space-y-1">
        <Label className={compact ? "text-xs" : undefined}>Morada completa</Label>
        <Input
          value={values.location_address}
          onChange={(event) => onFieldChange("location_address", event.target.value)}
          placeholder="Rua, número, cidade"
          className={inputSizeClass}
        />
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
          >
            Ver no Google Maps
          </a>
        )}
      </div>

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
