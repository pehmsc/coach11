"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  isValidManualShortName,
  normalizeManualShortName,
} from "@/lib/football/short-name";
import type { SharedGameFormValues } from "@/components/games/game-form-fields";
import {
  type CalEvent,
  type ModalMode,
  type ModalScreen,
  type EventForm,
  EMPTY_FORM,
  isEventEditable,
  buildDuplicateTitle,
} from "@/components/calendar/types";

interface UseCalendarModalOptions {
  ageGroupId: string | null;
  teamId: string | null;
  setTeamId: (id: string) => void;
  canDeleteEvents: boolean;
  setEvents: React.Dispatch<React.SetStateAction<CalEvent[]>>;
  loadEvents: () => Promise<void>;
}

export function useCalendarModal({
  ageGroupId,
  teamId,
  setTeamId,
  canDeleteEvents,
  setEvents,
  loadEvents,
}: UseCalendarModalOptions) {
  const router = useRouter();

  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [modalScreen, setModalScreen] = useState<ModalScreen>("edit");
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState<"create" | "duplicate">("create");

  const isEditing = modalMode === "edit_training" || modalMode === "edit_game";
  const isTrainingModal =
    modalMode === "add_training" || modalMode === "edit_training";
  const canEditSelectedEvent = isEventEditable(selectedEvent, canDeleteEvents);
  const canCorrectSelectedEventAttendance =
    selectedEvent?.type === "training" &&
    selectedEvent?.status === "completed" &&
    canDeleteEvents;
  const showReadOnlyEventSummary =
    !!selectedEvent && isEditing && modalScreen === "view";

  function openAdd(type: "training" | "game", date: string) {
    setSelectedEvent(null);
    setOpError(null);
    setModalScreen("edit");
    setDraftMode("create");
    setForm({
      ...EMPTY_FORM,
      date,
      start_time: type === "training" ? "18:00" : "10:00",
    });
    setModalMode(type === "training" ? "add_training" : "add_game");
  }

  function openEdit(event: CalEvent) {
    setSelectedEvent(event);
    setOpError(null);
    setModalScreen("view");
    setDraftMode("create");
    setForm({
      title: event.title || "",
      date: event.date,
      start_time: event.start_time || "18:00",
      end_time: event.end_time || "",
      opponent_name: event.opponent_name || "",
      opponent_short_name: event.opponent_short_name || "",
      competition_id: event.competition_id || "",
      location: event.location || "",
      location_address: event.location_address || "",
      formatted_address: event.formatted_address || "",
      latitude: event.latitude ?? null,
      longitude: event.longitude ?? null,
      osm_place_id: event.osm_place_id || "",
      location_source: event.location_source ?? null,
      is_home: event.is_home ?? true,
      notes: event.notes || "",
      image_url: event.image_url || "",
    });
    setModalMode(event.type === "training" ? "edit_training" : "edit_game");
  }

  function duplicateSelectedEvent() {
    if (!selectedEvent) return;

    setOpError(null);
    setModalScreen("edit");
    setDraftMode("duplicate");
    setSelectedEvent(null);
    setForm({
      title: buildDuplicateTitle(selectedEvent),
      date: "",
      start_time: selectedEvent.start_time || (selectedEvent.type === "training" ? "18:00" : "10:00"),
      end_time: selectedEvent.end_time || "",
      opponent_name: selectedEvent.opponent_name || "",
      opponent_short_name:
        normalizeManualShortName(selectedEvent.opponent_short_name, 5) || "",
      competition_id: selectedEvent.competition_id || "",
      location: selectedEvent.location || "",
      location_address: selectedEvent.location_address || "",
      formatted_address: selectedEvent.formatted_address || "",
      latitude: selectedEvent.latitude ?? null,
      longitude: selectedEvent.longitude ?? null,
      osm_place_id: selectedEvent.osm_place_id || "",
      location_source: selectedEvent.location_source ?? null,
      is_home: selectedEvent.is_home ?? true,
      notes: selectedEvent.notes || "",
      image_url: selectedEvent.image_url || "",
    });
    setModalMode(
      selectedEvent.type === "training" ? "add_training" : "add_game",
    );
  }

  function closeModal() {
    setModalMode(null);
    setModalScreen("edit");
    setSelectedEvent(null);
    setDraftMode("create");
    setForm(EMPTY_FORM);
    setOpError(null);
  }

  function handleGameFieldChange(
    field: keyof SharedGameFormValues,
    value: SharedGameFormValues[keyof SharedGameFormValues],
  ) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function saveEvent() {
    if (!ageGroupId || !form.date) return;
    if (
      !isTrainingModal &&
      !isValidManualShortName(form.opponent_short_name, 2, 5)
    ) {
      setOpError("A sigla do adversário deve ter entre 2 e 5 caracteres.");
      return;
    }
    setSaving(true);
    setOpError(null);

    const isTraining =
      modalMode === "add_training" || modalMode === "edit_training";
    const isEditingNow =
      modalMode === "edit_training" || modalMode === "edit_game";

    try {
      const endpoint = "/api/calendar/events";
      const eventType = isTraining ? "training" : "game";
      const requestBody = {
        id: isEditingNow ? selectedEvent?.id || null : null,
        type: eventType,
        ageGroupId,
        teamId,
        payload: {
          title: form.title,
          date: form.date,
          start_time: form.start_time,
          end_time: form.end_time,
          opponent_name: form.opponent_name,
          opponent_short_name: normalizeManualShortName(
            form.opponent_short_name,
            5,
          ),
          competition_id: form.competition_id || null,
          location: form.location,
          location_address: form.location_address,
          formatted_address: form.formatted_address,
          latitude: form.latitude,
          longitude: form.longitude,
          osm_place_id: form.osm_place_id,
          location_source: form.location_source,
          is_home: form.is_home,
          notes: form.notes,
          image_url: form.image_url,
        },
      };

      const res = await fetch(endpoint, {
        method: isEditingNow ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string; teamId?: string | null }
        | null;

      if (!res.ok || !payload?.success) {
        setOpError(payload?.error || "Erro ao guardar evento.");
        setSaving(false);
        return;
      }

      if (typeof payload.teamId === "string") {
        setTeamId(payload.teamId);
      }

      await loadEvents();
      closeModal();
    } catch {
      setOpError("Erro de ligação ao guardar evento.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent() {
    if (!selectedEvent) return;
    if (!canDeleteEvents) {
      setOpError("Só o coordenador pode apagar jogos e treinos.");
      return;
    }
    setSaving(true);
    setOpError(null);

    try {
      const res = await fetch("/api/calendar/events", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedEvent.id,
          type: selectedEvent.type,
          ageGroupId,
        }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;

      if (!res.ok || !payload?.success) {
        setOpError(payload?.error || "Erro ao apagar evento.");
        setSaving(false);
        return;
      }

      setEvents((prev) => prev.filter((e) => e.id !== selectedEvent.id));
      closeModal();
      void loadEvents();
    } catch {
      setOpError("Erro de ligação ao apagar evento.");
    } finally {
      setSaving(false);
    }
  }

  function openAttendanceCorrectionFromCalendar() {
    if (!selectedEvent || selectedEvent.type !== "training") return;
    closeModal();
    router.push(`/attendance?date=${selectedEvent.date}`);
  }

  return {
    modalMode,
    modalScreen,
    setModalScreen,
    selectedEvent,
    form,
    setForm,
    saving,
    opError,
    draftMode,
    isEditing,
    isTrainingModal,
    canEditSelectedEvent,
    canCorrectSelectedEventAttendance,
    showReadOnlyEventSummary,
    openAdd,
    openEdit,
    duplicateSelectedEvent,
    closeModal,
    handleGameFieldChange,
    saveEvent,
    deleteEvent,
    openAttendanceCorrectionFromCalendar,
  };
}
