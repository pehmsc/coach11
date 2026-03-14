"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTrainingForm } from "@/lib/hooks/useTrainingForm";
import type { TrainingFormFields } from "./types";
import { TrainingFormFieldsComponent } from "./TrainingFormFields";

interface TrainingCreateModalProps {
  createMode: "create" | "duplicate";
  ageGroupId: string | null;
  form: ReturnType<typeof useTrainingForm>;
  onClose: () => void;
  onSubmit: (fields: TrainingFormFields) => Promise<{ success: boolean; error?: string }>;
}

export function TrainingCreateModal({
  createMode,
  ageGroupId,
  form,
  onClose,
  onSubmit,
}: TrainingCreateModalProps) {
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const fields = form.getFields();
    if (!fields.date || !fields.startTime) {
      setCreateError("Preenche data e hora de início.");
      return;
    }

    setCreating(true);
    setCreateError(null);
    const result = await onSubmit(fields);
    if (!result.success) {
      setCreateError(result.error || "Erro ao criar treino.");
    } else {
      onClose();
    }
    setCreating(false);
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[90] flex items-end justify-center px-4 pt-4 pb-[calc(var(--mobile-footer-height)+env(safe-area-inset-bottom)+0.75rem)] md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        className="min-w-0 overflow-x-hidden bg-white rounded-2xl w-full max-w-md shadow-xl h-[calc(100dvh-var(--mobile-footer-height)-env(safe-area-inset-bottom)-1rem)] md:h-auto md:max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h3 className="font-bold text-slate-900">
              {createMode === "duplicate" ? "Duplicar treino" : "Adicionar treino"}
            </h3>
            {createMode === "duplicate" && (
              <p className="mt-1 text-xs text-slate-500">
                Revê os dados e escolhe uma nova data antes de guardar.
              </p>
            )}
          </div>
          <button onClick={onClose}>
            <X size={20} className="text-slate-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-3 [overflow-wrap:anywhere]"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <TrainingFormFieldsComponent
              title={form.title}
              onTitleChange={form.setTitle}
              date={form.date}
              onDateChange={form.setDate}
              startTime={form.startTime}
              onStartTimeChange={form.setStartTime}
              endTime={form.endTime}
              onEndTimeChange={form.setEndTime}
              location={form.location}
              locationAddress={form.locationAddress}
              formattedAddress={form.formattedAddress}
              latitude={form.latitude}
              longitude={form.longitude}
              osmPlaceId={form.osmPlaceId}
              locationSource={form.locationSource}
              onLocationChange={(nextValue) => {
                form.setLocation(nextValue.location);
                form.setLocationAddress(nextValue.location_address);
                form.setFormattedAddress(nextValue.formatted_address);
                form.setLatitude(nextValue.latitude);
                form.setLongitude(nextValue.longitude);
                form.setOsmPlaceId(nextValue.osm_place_id);
                form.setLocationSource(nextValue.location_source);
              }}
              imageUrl={form.imageUrl}
              onImageUrlChange={form.setImageUrl}
              notes={form.notes}
              onNotesChange={form.setNotes}
              ageGroupId={ageGroupId}
            />
            {createError && <p className="text-sm text-red-600">{createError}</p>}
          </div>
          <div className="flex gap-2 border-t bg-white p-5 pt-3 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button
              type="submit"
              disabled={creating}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              {creating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                createMode === "duplicate" ? "Criar cópia" : "Criar treino"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={creating}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
