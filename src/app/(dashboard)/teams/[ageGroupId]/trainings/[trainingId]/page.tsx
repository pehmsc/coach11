"use client";

import { use } from "react";
import { TrainingDetailView } from "@/components/trainings/detail/TrainingDetailView";
import { useAgeGroupMeta } from "@/hooks/useAgeGroupName";

type PageParams = { ageGroupId: string; trainingId: string };

export default function TeamTrainingDetailPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { ageGroupId, trainingId } = use(params);
  const { name: ageGroupName } = useAgeGroupMeta(ageGroupId);

  return (
    <TrainingDetailView
      trainingId={trainingId}
      scope={{
        breadcrumbItemsPrefix: [
          { label: "Equipas", href: "/teams" },
          {
            label: ageGroupName ?? "Escalão",
            href: `/teams/${ageGroupId}`,
            shortLabel: ageGroupName ?? "Escalão",
          },
          {
            label: "Treinos",
            href: `/teams/${ageGroupId}/trainings`,
          },
        ],
        fallbackReturnHref: `/teams/${ageGroupId}/trainings`,
        returnToKey: `trainings:team:${ageGroupId}`,
        backLabel: "Voltar aos treinos",
      }}
    />
  );
}
