"use client";

import { EMPTY_LOCATION_FIELDS } from "@/lib/location";
import { LocationFields } from "@/components/maps/LocationFields";
import { EventImagePicker } from "@/components/media/EventImagePicker";
import { NotesEditor } from "@/components/forms/NotesEditor";

interface TrainingFormFieldsProps {
  title: string;
  onTitleChange: (value: string) => void;
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
}

export function TrainingFormFieldsComponent({
  title,
  onTitleChange,
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
}: TrainingFormFieldsProps) {
  return (
    <>
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
