"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Dumbbell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTrainingsData } from "@/lib/hooks/useTrainingsData";
import { useTrainingForm } from "@/lib/hooks/useTrainingForm";
import { TrainingSessionList } from "@/components/trainings/TrainingSessionList";
import { TrainingCreateModal } from "@/components/trainings/TrainingCreateModal";
import type { TrainingRow } from "@/components/trainings/types";

export default function TrainingsPage() {
  const router = useRouter();
  const data = useTrainingsData();
  const createForm = useTrainingForm();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"create" | "duplicate">("create");

  function openCreateTrainingModal() {
    createForm.resetToDefaults();
    setCreateMode("create");
    setCreateModalOpen(true);
  }

  function openDuplicateTraining(source: TrainingRow) {
    setCreateMode("duplicate");
    createForm.populateFromSource(source, "duplicate");
    setCreateModalOpen(true);
  }

  if (data.loading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (data.sessions.length === 0) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto text-center py-16">
        <Dumbbell size={40} className="text-slate-200 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">Nenhum treino registado.</p>
        <p className="text-slate-400 text-xs mt-1">Cria o primeiro treino aqui.</p>
        <Button
          className="mt-4 bg-emerald-600 hover:bg-emerald-700"
          onClick={openCreateTrainingModal}
        >
          <Plus size={16} className="mr-2" />
          Adicionar treino
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900">Treinos</h1>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={openCreateTrainingModal}
          >
            <Plus size={16} className="mr-2" />
            Adicionar treino
          </Button>
        </div>

        <TrainingSessionList
          sessions={data.sessions}
          getSummary={data.getSummary}
          onSessionClick={(session) => router.push(`/trainings/${session.id}`)}
          onDuplicate={openDuplicateTraining}
        />
      </div>

      {createModalOpen && (
        <TrainingCreateModal
          createMode={createMode}
          ageGroupId={data.ageGroupId}
          form={createForm}
          onClose={() => setCreateModalOpen(false)}
          onSubmit={data.handleCreateTraining}
        />
      )}

    </>
  );
}
