"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { EMPTY_LOCATION_FIELDS } from "@/lib/location";
import { LocationFields } from "@/components/maps/LocationFields";
import { EventImagePicker } from "@/components/media/EventImagePicker";
import { NotesEditor } from "@/components/forms/NotesEditor";

interface TrainingFormFieldsProps {
  title: string;
  onTitleChange: (value: string) => void;
  utNumber: string;
  onUtNumberChange: (value: string) => void;
  date: string;
  onDateChange: (value: string) => void;
  startTime: string;
  onStartTimeChange: (value: string) => void;
  endTime: string;
  onEndTimeChange: (value: string) => void;
  location: string;
  locationAddress: string;
  formattedAddress: string;
  latitude: number | null;
  longitude: number | null;
  osmPlaceId: string;
  locationSource: "google" | "osm" | "manual" | null;
  onLocationChange: (nextValue: {
    location: string;
    location_address: string;
    formatted_address: string;
    latitude: number | null;
    longitude: number | null;
    osm_place_id: string;
    location_source: "google" | "osm" | "manual" | null;
  }) => void;
  imageUrl: string;
  onImageUrlChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  ageGroupId: string | null;
  // UT metadata (optional — only shown when provided)
  utFocus?: string;
  onUtFocusChange?: (value: string) => void;
  utIntensity?: string;
  onUtIntensityChange?: (value: string) => void;
  utPeriodType?: string;
  onUtPeriodTypeChange?: (value: string) => void;
  utFieldArea?: string;
  onUtFieldAreaChange?: (value: string) => void;
  utObjective?: string;
  onUtObjectiveChange?: (value: string) => void;
  utMaterial?: string;
  onUtMaterialChange?: (value: string) => void;
  utInitialInstruction?: string;
  onUtInitialInstructionChange?: (value: string) => void;
}

export function TrainingFormFieldsComponent({
  title,
  onTitleChange,
  utNumber,
  onUtNumberChange,
  date,
  onDateChange,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
  location,
  locationAddress,
  formattedAddress,
  latitude,
  longitude,
  osmPlaceId,
  locationSource,
  onLocationChange,
  imageUrl,
  onImageUrlChange,
  notes,
  onNotesChange,
  ageGroupId,
  utFocus,
  onUtFocusChange,
  utIntensity,
  onUtIntensityChange,
  utPeriodType,
  onUtPeriodTypeChange,
  utFieldArea,
  onUtFieldAreaChange,
  utObjective,
  onUtObjectiveChange,
  utMaterial,
  onUtMaterialChange,
  utInitialInstruction,
  onUtInitialInstructionChange,
}: TrainingFormFieldsProps) {
  const hasUtProps = !!onUtFocusChange;
  const [utExpanded, setUtExpanded] = useState(false);
  const selectCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm";

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Título</label>
          <input
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Treino"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">UT</label>
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={utNumber}
            onChange={(event) => onUtNumberChange(event.target.value)}
            placeholder="Ex: 4"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-slate-500">Mostrado na app como UT01, UT02, ...</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Data *</label>
          <input
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Início *</label>
          <input
            type="time"
            value={startTime}
            onChange={(event) => onStartTimeChange(event.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            required
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700">Fim</label>
        <input
          type="time"
          value={endTime}
          onChange={(event) => onEndTimeChange(event.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
        />
      </div>
      <LocationFields
        value={{
          ...EMPTY_LOCATION_FIELDS,
          location,
          location_address: locationAddress,
          formatted_address: formattedAddress,
          latitude,
          longitude,
          osm_place_id: osmPlaceId,
          location_source: locationSource,
        }}
        onChange={onLocationChange}
        accent="emerald"
      />
      {hasUtProps && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setUtExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Planeamento (opcional)
            {utExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {utExpanded && (
            <div className="border-t border-slate-100 p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Foco</label>
                  <select className={selectCls} value={utFocus ?? ""} onChange={(e) => onUtFocusChange?.(e.target.value)}>
                    <option value="">—</option>
                    <option value="tactical">Tática</option>
                    <option value="technical">Técnica</option>
                    <option value="physical">Física</option>
                    <option value="mixed">Misto</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Intensidade</label>
                  <select className={selectCls} value={utIntensity ?? ""} onChange={(e) => onUtIntensityChange?.(e.target.value)}>
                    <option value="">—</option>
                    <option value="low">Baixo</option>
                    <option value="medium">Médio</option>
                    <option value="high">Alto</option>
                    <option value="very_high">Muito Alto</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Período</label>
                  <select className={selectCls} value={utPeriodType ?? ""} onChange={(e) => onUtPeriodTypeChange?.(e.target.value)}>
                    <option value="">—</option>
                    <option value="pre_season">Pré-época</option>
                    <option value="competitive">Competitivo</option>
                    <option value="transition">Transição</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-500">Área de treino</label>
                  <select className={selectCls} value={utFieldArea ?? ""} onChange={(e) => onUtFieldAreaChange?.(e.target.value)}>
                    <option value="">—</option>
                    <option value="complete">Campo Inteiro</option>
                    <option value="half">Meio Campo</option>
                    <option value="third">1/3 Campo</option>
                    <option value="quarter">1/4 Campo</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Objectivo</label>
                <input type="text" className={selectCls} value={utObjective ?? ""} onChange={(e) => onUtObjectiveChange?.(e.target.value)} placeholder="Objectivo do treino" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Material</label>
                <input type="text" className={selectCls} value={utMaterial ?? ""} onChange={(e) => onUtMaterialChange?.(e.target.value)} placeholder="Ex: 18 bolas, 2 balizas" />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Instrução Inicial</label>
                <input type="text" className={selectCls} value={utInitialInstruction ?? ""} onChange={(e) => onUtInitialInstructionChange?.(e.target.value)} placeholder="Ex: Concentração 18:15" />
              </div>
            </div>
          )}
        </div>
      )}

      <EventImagePicker
        ageGroupId={ageGroupId}
        value={imageUrl}
        onChange={onImageUrlChange}
        accent="emerald"
      />
      <NotesEditor
        value={notes}
        onChange={onNotesChange}
        accent="emerald"
        rows={7}
      />
    </>
  );
}
