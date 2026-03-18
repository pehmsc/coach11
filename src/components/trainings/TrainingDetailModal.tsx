"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Loader2,
  X,
  Users,
  Copy,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichTextContent } from "@/components/content/RichTextContent";
import { LocationMapPreview } from "@/components/maps/LocationMapPreview";
import { resolveLocationLabel } from "@/lib/location";
import { portugalDateTimeToUtc } from "@/lib/events/presence-window";
import { useTrainingForm } from "@/lib/hooks/useTrainingForm";
import { getTrainingDisplayTitle } from "@/lib/trainings/ut-numbering";
import type { SessionDetail, TrainingRow, TrainingFormFields } from "./types";
import { getAttendanceStatusClasses } from "./utils";
import { TrainingFormFieldsComponent } from "./TrainingFormFields";

function computeCanEdit(session: TrainingRow): boolean {
  const startsAt = portugalDateTimeToUtc(session.session_date, session.start_time);
  return !!startsAt && startsAt.getTime() > Date.now();
}

interface TrainingDetailModalProps {
  selectedSession: SessionDetail;
  loadingDetail: boolean;
  canDeleteTrainings: boolean;
  editingSelectedSession: boolean;
  detailError: string | null;
  deletingTraining: boolean;
  showDeleteConfirm: boolean;
  ageGroupId: string | null;
  onClose: () => void;
  onDelete: () => void;
  onShowDeleteConfirm: () => void;
  onHideDeleteConfirm: () => void;
  onDuplicate: (session: TrainingRow) => void;
  onAttendanceCorrection: (session: TrainingRow) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (fields: TrainingFormFields) => Promise<{ success: boolean; error?: string }>;
}

export function TrainingDetailModal({
  selectedSession,
  loadingDetail,
  canDeleteTrainings,
  editingSelectedSession,
  detailError,
  deletingTraining,
  showDeleteConfirm,
  ageGroupId,
  onClose,
  onDelete,
  onShowDeleteConfirm,
  onHideDeleteConfirm,
  onDuplicate,
  onAttendanceCorrection,
  onStartEdit,
  onCancelEdit,
  onSave,
}: TrainingDetailModalProps) {
  const editForm = useTrainingForm();
  const [savingSelectedSession, setSavingSelectedSession] = useState(false);

  const selectedSessionLocationLabel = resolveLocationLabel(
    selectedSession.session.location,
    selectedSession.session.formatted_address,
    selectedSession.session.location_address,
  );
  const canEditSelectedSession = computeCanEdit(selectedSession.session);
  const canCorrectSelectedSessionAttendance =
    canDeleteTrainings && selectedSession.session.status === "completed";
  const displayTitle = getTrainingDisplayTitle(selectedSession.session);

  function handleStartEdit() {
    editForm.populateFromSource(selectedSession.session, "edit");
    onStartEdit();
  }

  async function handleSaveSelectedSession(e: { preventDefault(): void }) {
    e.preventDefault();
    const fields = editForm.getFields();
    if (!fields.date || !fields.startTime) {
      return;
    }
    setSavingSelectedSession(true);
    await onSave(fields);
    setSavingSelectedSession(false);
  }

  function handleCancelEdit() {
    setSavingSelectedSession(false);
    onCancelEdit();
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[70] flex items-end justify-center px-4 pt-4 pb-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom)+0.75rem)] md:items-center md:p-4"
        onClick={() => {
          if (deletingTraining) return;
          onClose();
        }}
      >
        <div
          className="min-w-0 overflow-x-hidden bg-white rounded-2xl w-full max-w-md shadow-xl h-[calc(100dvh-var(--mobile-footer-height)-env(safe-area-inset-bottom)-1rem)] md:h-auto md:max-h-[85vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b">
            <div>
              <h3 className="font-bold text-slate-900">
                {displayTitle} —{" "}
                {format(parseISO(selectedSession.session.session_date), "d 'de' MMMM", { locale: pt })}
              </h3>
              {selectedSession.session.start_time && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedSession.session.start_time.substring(0, 5)}
                  {selectedSession.session.end_time ? ` – ${selectedSession.session.end_time.substring(0, 5)}` : ""}
                  {selectedSessionLocationLabel ? ` · ${selectedSessionLocationLabel}` : ""}
                </p>
              )}
              {selectedSession.session.location_address &&
                selectedSession.session.location_address !== selectedSessionLocationLabel && (
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedSession.session.location_address}
                  </p>
                )}
            </div>
            <div className="flex items-center gap-1.5">
              {canCorrectSelectedSessionAttendance && !editingSelectedSession && (
                <button
                  onClick={() => onAttendanceCorrection(selectedSession.session)}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                  title="Corrigir presenças"
                  disabled={deletingTraining}
                >
                  <Users size={14} />
                  <span className="hidden sm:inline">Presenças</span>
                </button>
              )}
              {canEditSelectedSession && !editingSelectedSession && (
                <button
                  onClick={handleStartEdit}
                  className="p-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                  title="Editar treino"
                  disabled={deletingTraining}
                >
                  <Pencil size={16} />
                </button>
              )}
              <button
                onClick={() => onDuplicate(selectedSession.session)}
                className="p-1.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                title="Duplicar treino"
                disabled={deletingTraining}
              >
                <Copy size={16} />
              </button>
              {canDeleteTrainings && (
                <button
                  onClick={onShowDeleteConfirm}
                  className="p-1.5 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                  title="Apagar treino"
                  disabled={deletingTraining}
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                onClick={onClose}
                disabled={deletingTraining}
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>
          </div>

          {detailError && (
            <div className="mx-5 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {detailError}
            </div>
          )}

          {editingSelectedSession ? (
            <form onSubmit={handleSaveSelectedSession} className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div
                className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-3 [overflow-wrap:anywhere]"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <TrainingFormFieldsComponent
                  title={editForm.title}
                  onTitleChange={editForm.setTitle}
                  utNumber={editForm.utNumber}
                  onUtNumberChange={editForm.setUtNumber}
                  date={editForm.date}
                  onDateChange={editForm.setDate}
                  startTime={editForm.startTime}
                  onStartTimeChange={editForm.setStartTime}
                  endTime={editForm.endTime}
                  onEndTimeChange={editForm.setEndTime}
                  location={editForm.location}
                  locationAddress={editForm.locationAddress}
                  formattedAddress={editForm.formattedAddress}
                  latitude={editForm.latitude}
                  longitude={editForm.longitude}
                  osmPlaceId={editForm.osmPlaceId}
                  locationSource={editForm.locationSource}
                  onLocationChange={(nextValue) => {
                    editForm.setLocation(nextValue.location);
                    editForm.setLocationAddress(nextValue.location_address);
                    editForm.setFormattedAddress(nextValue.formatted_address);
                    editForm.setLatitude(nextValue.latitude);
                    editForm.setLongitude(nextValue.longitude);
                    editForm.setOsmPlaceId(nextValue.osm_place_id);
                    editForm.setLocationSource(nextValue.location_source);
                  }}
                  imageUrl={editForm.imageUrl}
                  onImageUrlChange={editForm.setImageUrl}
                  notes={editForm.notes}
                  onNotesChange={editForm.setNotes}
                  ageGroupId={ageGroupId}
                />
              </div>
              <div className="flex gap-2 border-t bg-white p-5 pt-3 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Button
                  type="submit"
                  disabled={savingSelectedSession}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  {savingSelectedSession ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    "Guardar treino"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={savingSelectedSession}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          ) : loadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          ) : selectedSession.session.status === "completed" &&
            !selectedSession.hasRecordedAttendance ? (
            <div className="flex flex-1 items-center justify-center px-6 py-10 text-center">
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  Sem presenças gravadas para este treino.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  O treino está fechado, mas não existem registos de presenças associados.
                </p>
                {canCorrectSelectedSessionAttendance && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-4 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => onAttendanceCorrection(selectedSession.session)}
                  >
                    Corrigir presenças
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden [overflow-wrap:anywhere]">
              {(selectedSession.session.location ||
                selectedSession.session.location_address ||
                selectedSession.session.formatted_address) && (
                <div className="border-b px-5 py-4">
                  <LocationMapPreview
                    location={selectedSession.session.location}
                    locationAddress={selectedSession.session.location_address}
                    formattedAddress={selectedSession.session.formatted_address}
                    latitude={selectedSession.session.latitude}
                    longitude={selectedSession.session.longitude}
                    accent="emerald"
                    label="Localização"
                    showDirectionsButton={false}
                  />
                </div>
              )}
              {selectedSession.session.notes?.trim() && (
                <div className="border-b px-5 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Notas
                  </p>
                  <RichTextContent
                    content={selectedSession.session.notes}
                    className="mt-2"
                  />
                </div>
              )}
              {canCorrectSelectedSessionAttendance && (
                <div className="border-b px-5 py-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => onAttendanceCorrection(selectedSession.session)}
                  >
                    Corrigir presenças
                  </Button>
                </div>
              )}
              <div className="divide-y">
                {Object.values(selectedSession.attendance)
                  .sort((a, b) => a.player.first_name.localeCompare(b.player.first_name))
                  .map(({ player, status }) => {
                    const statusUi = getAttendanceStatusClasses(status);

                    return (
                      <div key={player.id} className="flex items-center gap-3 px-5 py-3">
                        <div
                          className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${statusUi.dot}`}
                        />
                        <p className="text-sm text-slate-800">
                          {player.first_name} {player.last_name}
                        </p>
                        <span className={`ml-auto text-xs font-medium ${statusUi.text}`}>
                          {statusUi.label}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-black/55 z-[100] flex items-end md:items-center justify-center p-4"
          onClick={() => {
            if (deletingTraining) return;
            onHideDeleteConfirm();
          }}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm shadow-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-bold text-slate-900">Apagar treino?</h3>
              <p className="text-sm text-slate-600 mt-1">
                Esta ação remove presenças e registos estatísticos associados.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={onHideDeleteConfirm}
                disabled={deletingTraining}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={() => void onDelete()}
                disabled={deletingTraining}
              >
                {deletingTraining ? (
                  <Loader2 size={15} className="mr-2 animate-spin" />
                ) : (
                  <Trash2 size={15} className="mr-2" />
                )}
                Apagar treino
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
