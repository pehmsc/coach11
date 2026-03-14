"use client";

import React from "react";
import Image from "next/image";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  X,
  MapPin,
  Clock,
  AlertCircle,
  Copy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichTextContent } from "@/components/content/RichTextContent";
import { NotesEditor } from "@/components/forms/NotesEditor";
import { EventImagePicker } from "@/components/media/EventImagePicker";
import {
  GameFormFields,
  type GameCompetitionOption,
  type SharedGameFormValues,
} from "@/components/games/game-form-fields";
import { LocationFields } from "@/components/maps/LocationFields";
import { resolveLocationLabel } from "@/lib/location";
import type { CalEvent, ModalMode, EventForm } from "./types";

interface CalendarEventModalProps {
  modalMode: ModalMode;
  draftMode: "create" | "duplicate";
  showReadOnlyEventSummary: boolean;
  selectedEvent: CalEvent | null;
  form: EventForm;
  setForm: React.Dispatch<React.SetStateAction<EventForm>>;
  isEditing: boolean;
  isTrainingModal: boolean;
  canEditSelectedEvent: boolean;
  canCorrectSelectedEventAttendance: boolean;
  canDeleteEvents: boolean;
  saving: boolean;
  opError: string | null;
  competitionOptions: GameCompetitionOption[];
  ageGroupId: string;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onEditScreen: () => void;
  onViewScreen: () => void;
  onGameFieldChange: (
    field: keyof SharedGameFormValues,
    value: SharedGameFormValues[keyof SharedGameFormValues],
  ) => void;
  onAttendanceCorrection: () => void;
}

export function CalendarEventModal({
  modalMode,
  draftMode,
  showReadOnlyEventSummary,
  selectedEvent,
  form,
  setForm,
  isEditing,
  isTrainingModal,
  canEditSelectedEvent,
  canCorrectSelectedEventAttendance,
  canDeleteEvents,
  saving,
  opError,
  competitionOptions,
  ageGroupId,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  onEditScreen,
  onViewScreen,
  onGameFieldChange,
  onAttendanceCorrection,
}: CalendarEventModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-[90] flex items-end justify-center px-4 pt-4 pb-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom)+0.75rem)] md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        className="min-w-0 overflow-x-hidden bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[calc(100dvh-var(--mobile-footer-height)-env(safe-area-inset-bottom)-1rem)] md:max-h-[calc(100dvh-1rem)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do modal */}
        <div className="flex items-start justify-between p-5 border-b bg-white z-10 shrink-0">
          <div>
            <h3 className="font-bold text-slate-900">
              {modalMode === "add_training" &&
                (draftMode === "duplicate" ? "Duplicar treino" : "Novo treino")}
              {modalMode === "add_game" &&
                (draftMode === "duplicate" ? "Duplicar jogo" : "Novo jogo")}
              {modalMode === "edit_training" &&
                (showReadOnlyEventSummary ? "Detalhes do treino" : "Editar treino")}
              {modalMode === "edit_game" &&
                (showReadOnlyEventSummary ? "Detalhes do jogo" : "Editar jogo")}
            </h3>
            {(modalMode === "add_training" || modalMode === "add_game") &&
              draftMode === "duplicate" && (
                <p className="mt-1 text-xs text-slate-500">
                  Revê os dados e escolhe uma nova data antes de guardar.
                </p>
              )}
          </div>
          <button onClick={onClose}>
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <div
          className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-5 pb-[calc(env(safe-area-inset-bottom)+7rem)] [overflow-wrap:anywhere]"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {/* Erro visível */}
          {opError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Erro</p>
                <p className="text-xs mt-0.5">{opError}</p>
              </div>
            </div>
          )}

          {showReadOnlyEventSummary && selectedEvent ? (
            <div className="space-y-4">
              {selectedEvent.image_url ? (
                <Image
                  src={selectedEvent.image_url}
                  alt={selectedEvent.title || "Evento"}
                  width={640}
                  height={352}
                  className="h-44 w-full rounded-2xl object-cover"
                />
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-lg font-semibold text-slate-900">
                  {selectedEvent.title || (selectedEvent.type === "training" ? "Treino" : "Jogo")}
                </p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-slate-400" />
                    <span>
                      {format(new Date(`${selectedEvent.date}T00:00:00`), "EEEE, d 'de' MMMM", {
                        locale: pt,
                      })}
                      {selectedEvent.start_time ? ` · ${selectedEvent.start_time.substring(0, 5)}` : ""}
                      {selectedEvent.end_time ? ` - ${selectedEvent.end_time.substring(0, 5)}` : ""}
                    </span>
                  </div>
                  {resolveLocationLabel(
                    selectedEvent.location,
                    selectedEvent.formatted_address,
                    selectedEvent.location_address,
                  ) ? (
                    <div className="flex items-start gap-2">
                      <MapPin size={14} className="mt-0.5 text-slate-400" />
                      <span>
                        {resolveLocationLabel(
                          selectedEvent.location,
                          selectedEvent.formatted_address,
                          selectedEvent.location_address,
                        )}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              {selectedEvent.notes ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="mb-3 text-sm font-semibold text-slate-900">Notas</p>
                  <RichTextContent
                    content={selectedEvent.notes}
                    className="text-sm text-slate-700"
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <EventImagePicker
                ageGroupId={ageGroupId}
                value={form.image_url}
                onChange={(value) =>
                  setForm((current) => ({ ...current, image_url: value }))
                }
                accent={isTrainingModal ? "emerald" : "blue"}
              />

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">
                  Título
                </label>
                <input
                  value={form.title}
                  placeholder={
                    isTrainingModal ? "ex: Treino físico" : "ex: Jornada 5"
                  }
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              {!isTrainingModal && (
                <GameFormFields
                  values={form}
                  onFieldChange={onGameFieldChange}
                  competitionOptions={competitionOptions}
                  showCompetitionSelect
                />
              )}

              {isTrainingModal && (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-700">
                        Data *
                      </label>
                      <input
                        type="date"
                        value={form.date}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, date: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-700">
                        Início
                      </label>
                      <input
                        type="time"
                        value={form.start_time}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, start_time: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">
                      Fim
                    </label>
                    <input
                      type="time"
                      value={form.end_time}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, end_time: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>

                  <LocationFields
                    value={form}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        ...value,
                      }))
                    }
                    accent="emerald"
                  />
                </>
              )}

              <NotesEditor
                value={form.notes}
                onChange={(value) =>
                  setForm((current) => ({ ...current, notes: value }))
                }
                accent={isTrainingModal ? "emerald" : "blue"}
                rows={6}
              />
            </>
          )}
        </div>

        <div className="sticky bottom-0 z-10 border-t bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shrink-0">
          {showReadOnlyEventSummary && selectedEvent ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              {canCorrectSelectedEventAttendance ? (
                <Button
                  variant="outline"
                  onClick={onAttendanceCorrection}
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 sm:flex-1"
                >
                  <Users size={16} className="mr-2" />
                  Corrigir presenças
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={onDuplicate}
                className="sm:flex-1"
              >
                <Copy size={16} className="mr-2" />
                Duplicar
              </Button>
              {canEditSelectedEvent ? (
                <Button
                  onClick={onEditScreen}
                  className="sm:flex-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  Editar
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={onClose}
                className={canEditSelectedEvent ? "sm:flex-1" : "w-full"}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                onClick={onSave}
                disabled={saving || !form.date}
                className="w-full bg-emerald-600 hover:bg-emerald-700 sm:min-w-[8rem] sm:flex-1"
              >
                {saving
                  ? "A guardar..."
                  : isEditing
                  ? "Guardar alterações"
                  : "Adicionar"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (showReadOnlyEventSummary) {
                    onClose();
                    return;
                  }
                  if (selectedEvent) {
                    onViewScreen();
                    return;
                  }
                  onClose();
                }}
                disabled={saving}
                className="w-full sm:min-w-[8rem] sm:flex-1"
              >
                Cancelar
              </Button>
              {isEditing && canDeleteEvents && (
                <Button
                  variant="outline"
                  onClick={onDelete}
                  disabled={saving}
                  className="w-full text-red-500 hover:bg-red-50 border-red-200 sm:w-auto"
                >
                  Apagar
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
