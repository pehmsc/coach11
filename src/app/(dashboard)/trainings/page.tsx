"use client";

import { ScopeToggle } from "@/components/navigation/ScopeToggle";
import { TrainingsSection } from "@/components/team-hub/TrainingsSection";
import { useAgeGroup } from "@/contexts/AgeGroupContext";
import { NoAgeGroupEmptyState } from "@/components/team/NoAgeGroupEmptyState";

export default function TrainingsPage() {
  const { ageGroups } = useAgeGroup();

  // Sem nenhum escalao: recuperacao in-place (modal) em vez de beco sem saida.
  if (ageGroups.length === 0) {
    return <NoAgeGroupEmptyState />;
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Treinos</h1>
      </div>

      <ScopeToggle variant="inline" className="mb-4" />

      <TrainingsSection returnToKey="trainings" />
    </div>
  );
}
