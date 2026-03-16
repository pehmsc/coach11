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
  locationAddress: "",
  formattedAddress: "",
  latitude: null,
  longitude: null,
  osmPlaceId: "",
  locationSource: null,
  notes: "",
  imageUrl: "",
};

export function useTrainingForm(initialValues?: Partial<TrainingFormFields>) {
  const [title, setTitle] = useState(initialValues?.title ?? DEFAULT_FORM.title);
  const [utNumber, setUtNumber] = useState(initialValues?.utNumber ?? DEFAULT_FORM.utNumber);
  const [date, setDate] = useState(initialValues?.date ?? DEFAULT_FORM.date);
  const [startTime, setStartTime] = useState(initialValues?.startTime ?? DEFAULT_FORM.startTime);
  const [endTime, setEndTime] = useState(initialValues?.endTime ?? DEFAULT_FORM.endTime);
  const [location, setLocation] = useState(initialValues?.location ?? DEFAULT_FORM.location);
  const [locationAddress, setLocationAddress] = useState(initialValues?.locationAddress ?? DEFAULT_FORM.locationAddress);
  const [formattedAddress, setFormattedAddress] = useState(initialValues?.formattedAddress ?? DEFAULT_FORM.formattedAddress);
  const [latitude, setLatitude] = useState<number | null>(initialValues?.latitude ?? DEFAULT_FORM.latitude);
  const [longitude, setLongitude] = useState<number | null>(initialValues?.longitude ?? DEFAULT_FORM.longitude);
  const [osmPlaceId, setOsmPlaceId] = useState(initialValues?.osmPlaceId ?? DEFAULT_FORM.osmPlaceId);
  const [locationSource, setLocationSource] = useState<"google" | "osm" | "manual" | null>(initialValues?.locationSource ?? DEFAULT_FORM.locationSource);
  const [notes, setNotes] = useState(initialValues?.notes ?? DEFAULT_FORM.notes);
  const [imageUrl, setImageUrl] = useState(initialValues?.imageUrl ?? DEFAULT_FORM.imageUrl);

  function getFields(): TrainingFormFields {
    return {
      title,
      utNumber,
      date,
      startTime,
      endTime,
      location,
      locationAddress,
      formattedAddress,
      latitude,
      longitude,
      osmPlaceId,
      locationSource,
      notes,
      imageUrl,
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
    setLocationAddress(DEFAULT_FORM.locationAddress);
    setFormattedAddress(DEFAULT_FORM.formattedAddress);
    setLatitude(DEFAULT_FORM.latitude);
    setLongitude(DEFAULT_FORM.longitude);
    setOsmPlaceId(DEFAULT_FORM.osmPlaceId);
    setLocationSource(DEFAULT_FORM.locationSource);
    setNotes(DEFAULT_FORM.notes);
    setImageUrl(DEFAULT_FORM.imageUrl);
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
    setLocationAddress(source.location_address || "");
    setFormattedAddress(source.formatted_address || "");
    setLatitude(source.latitude ?? null);
    setLongitude(source.longitude ?? null);
    setOsmPlaceId(source.osm_place_id || "");
    setLocationSource(source.location_source ?? null);
    setNotes(source.notes || "");
    setImageUrl(source.image_url || "");
  }

  return {
    title, setTitle,
    utNumber, setUtNumber,
    date, setDate,
    startTime, setStartTime,
    endTime, setEndTime,
    location, setLocation,
    locationAddress, setLocationAddress,
    formattedAddress, setFormattedAddress,
    latitude, setLatitude,
    longitude, setLongitude,
    osmPlaceId, setOsmPlaceId,
    locationSource, setLocationSource,
    notes, setNotes,
    imageUrl, setImageUrl,
    getFields,
    resetToDefaults,
    populateFromSource,
  };
}
