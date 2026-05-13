"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { TrainingFormFields, TrainingRow } from "@/components/trainings/types";

const DEFAULT_FORM: TrainingFormFields = {
  title: "Treino",
  utNumber: "",
  date: "",
  startTime: "18:30",
  endTime: "20:00",
  location: "",
  formattedAddress: "",
  latitude: null,
  longitude: null,
  osmPlaceId: "",
  locationSource: null,
  notes: "",
  imageUrl: "",
  utFocus: "",
  utIntensity: "",
  utPeriodType: "",
  utFieldArea: "",
  utObjective: "",
  utMaterial: "",
  utInitialInstruction: "",
};

export function useTrainingForm(initialValues?: Partial<TrainingFormFields>) {
  const [title, setTitle] = useState(initialValues?.title ?? DEFAULT_FORM.title);
  const [utNumber, setUtNumber] = useState(initialValues?.utNumber ?? DEFAULT_FORM.utNumber);
  const [date, setDate] = useState(initialValues?.date ?? DEFAULT_FORM.date);
  const [startTime, setStartTime] = useState(initialValues?.startTime ?? DEFAULT_FORM.startTime);
  const [endTime, setEndTime] = useState(initialValues?.endTime ?? DEFAULT_FORM.endTime);
  const [location, setLocation] = useState(initialValues?.location ?? DEFAULT_FORM.location);
  const [formattedAddress, setFormattedAddress] = useState(initialValues?.formattedAddress ?? DEFAULT_FORM.formattedAddress);
  const [latitude, setLatitude] = useState<number | null>(initialValues?.latitude ?? DEFAULT_FORM.latitude);
  const [longitude, setLongitude] = useState<number | null>(initialValues?.longitude ?? DEFAULT_FORM.longitude);
  const [osmPlaceId, setOsmPlaceId] = useState(initialValues?.osmPlaceId ?? DEFAULT_FORM.osmPlaceId);
  const [locationSource, setLocationSource] = useState<"google" | "osm" | "manual" | null>(initialValues?.locationSource ?? DEFAULT_FORM.locationSource);
  const [notes, setNotes] = useState(initialValues?.notes ?? DEFAULT_FORM.notes);
  const [imageUrl, setImageUrl] = useState(initialValues?.imageUrl ?? DEFAULT_FORM.imageUrl);
  const [utFocus, setUtFocus] = useState(initialValues?.utFocus ?? DEFAULT_FORM.utFocus);
  const [utIntensity, setUtIntensity] = useState(initialValues?.utIntensity ?? DEFAULT_FORM.utIntensity);
  const [utPeriodType, setUtPeriodType] = useState(initialValues?.utPeriodType ?? DEFAULT_FORM.utPeriodType);
  const [utFieldArea, setUtFieldArea] = useState(initialValues?.utFieldArea ?? DEFAULT_FORM.utFieldArea);
  const [utObjective, setUtObjective] = useState(initialValues?.utObjective ?? DEFAULT_FORM.utObjective);
  const [utMaterial, setUtMaterial] = useState(initialValues?.utMaterial ?? DEFAULT_FORM.utMaterial);
  const [utInitialInstruction, setUtInitialInstruction] = useState(initialValues?.utInitialInstruction ?? DEFAULT_FORM.utInitialInstruction);

  function getFields(): TrainingFormFields {
    return {
      title, utNumber, date, startTime, endTime,
      location, formattedAddress,
      latitude, longitude, osmPlaceId, locationSource,
      notes, imageUrl,
      utFocus, utIntensity, utPeriodType, utFieldArea,
      utObjective, utMaterial, utInitialInstruction,
    };
  }

  function resetToDefaults(options?: { utNumber?: number | null }) {
    const today = new Date();
    setTitle(DEFAULT_FORM.title);
    setUtNumber(
      typeof options?.utNumber === "number" && options.utNumber > 0
        ? String(options.utNumber)
        : DEFAULT_FORM.utNumber,
    );
    setDate(format(today, "yyyy-MM-dd"));
    setStartTime(DEFAULT_FORM.startTime);
    setEndTime(DEFAULT_FORM.endTime);
    setLocation(DEFAULT_FORM.location);
    setFormattedAddress(DEFAULT_FORM.formattedAddress);
    setLatitude(DEFAULT_FORM.latitude);
    setLongitude(DEFAULT_FORM.longitude);
    setOsmPlaceId(DEFAULT_FORM.osmPlaceId);
    setLocationSource(DEFAULT_FORM.locationSource);
    setNotes(DEFAULT_FORM.notes);
    setImageUrl(DEFAULT_FORM.imageUrl);
    setUtFocus(DEFAULT_FORM.utFocus);
    setUtIntensity(DEFAULT_FORM.utIntensity);
    setUtPeriodType(DEFAULT_FORM.utPeriodType);
    setUtFieldArea(DEFAULT_FORM.utFieldArea);
    setUtObjective(DEFAULT_FORM.utObjective);
    setUtMaterial(DEFAULT_FORM.utMaterial);
    setUtInitialInstruction(DEFAULT_FORM.utInitialInstruction);
  }

  function populateFromSource(
    source: TrainingRow,
    mode: "duplicate" | "edit",
    options?: { utNumber?: number | null },
  ) {
    setTitle(mode === "duplicate" ? `Cópia de ${source.title || "Treino"}` : (source.title || "Treino"));
    setUtNumber(
      mode === "duplicate"
        ? typeof options?.utNumber === "number" && options.utNumber > 0
          ? String(options.utNumber)
          : ""
        : typeof source.ut_number === "number" && source.ut_number > 0
          ? String(source.ut_number)
          : "",
    );
    setDate(mode === "duplicate" ? "" : source.session_date);
    setStartTime(source.start_time?.slice(0, 5) || "18:30");
    setEndTime(source.end_time?.slice(0, 5) || "20:00");
    setLocation(source.location || "");
    setFormattedAddress(source.formatted_address || "");
    setLatitude(source.latitude ?? null);
    setLongitude(source.longitude ?? null);
    setOsmPlaceId(source.osm_place_id || "");
    setLocationSource(source.location_source ?? null);
    setNotes(source.notes || "");
    setImageUrl(source.image_url || "");
    setUtFocus(source.focus || "");
    setUtIntensity(source.intensity || "");
    setUtPeriodType(source.period_type || "");
    setUtFieldArea(source.field_area || "");
    setUtObjective(source.objective || "");
    setUtMaterial(source.material || "");
    setUtInitialInstruction(source.initial_instruction || "");
  }

  return {
    title, setTitle,
    utNumber, setUtNumber,
    date, setDate,
    startTime, setStartTime,
    endTime, setEndTime,
    location, setLocation,
    formattedAddress, setFormattedAddress,
    latitude, setLatitude,
    longitude, setLongitude,
    osmPlaceId, setOsmPlaceId,
    locationSource, setLocationSource,
    notes, setNotes,
    imageUrl, setImageUrl,
    utFocus, setUtFocus,
    utIntensity, setUtIntensity,
    utPeriodType, setUtPeriodType,
    utFieldArea, setUtFieldArea,
    utObjective, setUtObjective,
    utMaterial, setUtMaterial,
    utInitialInstruction, setUtInitialInstruction,
    getFields,
    resetToDefaults,
    populateFromSource,
  };
}
