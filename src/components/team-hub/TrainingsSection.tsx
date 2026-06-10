"use client";

import { useState, useMemo } from "react";
import { Loader2, Dumbbell, Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTrainingsData } from "@/lib/hooks/useTrainingsData";
import { useTrainingForm } from "@/lib/hooks/useTrainingForm";
import { TrainingSessionList } from "@/components/trainings/TrainingSessionList";
import { TrainingCreateModal } from "@/components/trainings/TrainingCreateModal";
import { DuplicateWeekDialog } from "@/components/trainings/DuplicateWeekDialog";
import { isTrainingClosed } from "@/components/trainings/utils";
import type { TrainingRow } from "@/components/trainings/types";
import { useListStateSync } from "@/hooks/useListStateSync";
import { useReturnTo } from "@/hooks/useReturnTo";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

type TabKey = "scheduled" | "closed";

type Props = {
  /** Quando definido, força o escalão. Sub-rota passa ageGroupId da URL; global deixa undefined. */
  overrideAgeGroupId?: string;
  /** Chave para useReturnTo/useScrollRestoration. Permite isolamento entre rotas. */
  returnToKey?: string;
};

export function TrainingsSection({
  overrideAgeGroupId,
  returnToKey = "trainings",
}: Props) {
  const { saveReturnTo } = useReturnTo(returnToKey);
  useScrollRestoration(returnToKey);
  const data = useTrainingsData(
    overrideAgeGroupId ? { overrideAgeGroupId } : undefined,
  );
  const createForm = useTrainingForm();

  const [activeTab, setActiveTab] = useListStateSync<TabKey>("tab", "scheduled");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"create" | "duplicate">("create");
  const [duplicateWeekOpen, setDuplicateWeekOpen] = useState(false);

  const scheduled = useMemo(
    () =>
      data.sessions
        .filter((s) => !isTrainingClosed(s))
        .sort(
          (a, b) =>
            new Date(a.session_date).getTime() -
            new Date(b.session_date).getTime(),
        ),
    [data.sessions],
  );

  const closed = useMemo(
    () =>
      data.sessions
        .filter((s) => isTrainingClosed(s))
        .sort(
          (a, b) =>
            new Date(b.session_date).getTime() -
            new Date(a.session_date).getTime(),
        ),
    [data.sessions],
  );

  function openCreateTrainingModal() {
    createForm.resetToDefaults({ utNumber: data.nextUtNumber });
    setCreateMode("create");
    setCreateModalOpen(true);
  }

  function openDuplicateTraining(source: TrainingRow) {
    setCreateMode("duplicate");
    createForm.populateFromSource(source, "duplicate", {
      utNumber: data.nextUtNumber,
    });
    setCreateModalOpen(true);
  }

  if (data.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (data.sessions.length === 0) {
    return (
      <>
        <div className="text-center py-16">
          <Dumbbell size={40} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Nenhum treino registado.</p>
          <p className="text-slate-400 text-xs mt-1">
            Cria o primeiro treino aqui.
          </p>
          <Button
            className="mt-4 bg-emerald-600 hover:bg-emerald-700"
            onClick={openCreateTrainingModal}
          >
            <Plus size={16} className="mr-2" />
            Adicionar treino
          </Button>
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

  const getSessionHref = (session: TrainingRow) =>
    overrideAgeGroupId
      ? `/teams/${overrideAgeGroupId}/trainings/${session.id}`
      : `/trainings/${session.id}`;

  return (
    <>
      {/* Action buttons */}
      <div className="mb-4 flex flex-wrap gap-2 justify-end">
        <Button
          type="button"
          variant="outline"
          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          onClick={() => setDuplicateWeekOpen(true)}
        >
          <Copy size={16} className="mr-2" />
          Duplicar semana
        </Button>
        <Button
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={openCreateTrainingModal}
        >
          <Plus size={16} className="mr-2" />
          Adicionar treino
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabKey)}
      >
        <TabsList className="mb-3 w-full justify-start rounded-none border-b border-slate-200 bg-transparent p-0">
          <TabTrigger value="scheduled" label="Agendados" count={scheduled.length} />
          <TabTrigger value="closed" label="Fechados" count={closed.length} />
        </TabsList>

        <TabsContent value="scheduled">
          <TrainingSessionList
            sessions={scheduled}
            getSummary={data.getSummary}
            getSessionHref={getSessionHref}
            onNavigate={saveReturnTo}
            onDuplicate={openDuplicateTraining}
            variant="open"
          />
        </TabsContent>
        <TabsContent value="closed">
          <TrainingSessionList
            sessions={closed}
            getSummary={data.getSummary}
            getSessionHref={getSessionHref}
            onNavigate={saveReturnTo}
            variant="closed"
          />
        </TabsContent>
      </Tabs>

      {createModalOpen && (
        <TrainingCreateModal
          createMode={createMode}
          ageGroupId={data.ageGroupId}
          form={createForm}
          onClose={() => setCreateModalOpen(false)}
          onSubmit={data.handleCreateTraining}
        />
      )}
      <DuplicateWeekDialog
        open={duplicateWeekOpen}
        sessions={data.sessions}
        ageGroupId={data.ageGroupId}
        nextUtNumber={data.nextUtNumber}
        onClose={() => setDuplicateWeekOpen(false)}
        onSuccess={data.loadData}
      />
    </>
  );
}

function TabTrigger({
  value,
  label,
  count,
}: {
  value: TabKey;
  label: string;
  count: number;
}) {
  return (
    <TabsTrigger
      value={value}
      className="group relative rounded-none bg-transparent px-4 py-2.5 text-slate-500 shadow-none transition-colors after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-t after:bg-transparent after:content-[''] hover:text-slate-700 data-[state=active]:bg-transparent data-[state=active]:text-emerald-700 data-[state=active]:shadow-none data-[state=active]:after:bg-emerald-600"
    >
      {label}
      <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500 group-data-[state=active]:bg-emerald-100 group-data-[state=active]:text-emerald-700">
        {count}
      </span>
    </TabsTrigger>
  );
}
