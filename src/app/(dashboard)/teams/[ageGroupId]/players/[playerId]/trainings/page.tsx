"use client";

import { use } from "react";
import { PlayerTrainingsHistoryView } from "@/components/players/history/PlayerTrainingsHistoryView";
import { useAgeGroupMeta } from "@/hooks/useAgeGroupName";

type PageParams = { ageGroupId: string; playerId: string };

export default function TeamPlayerHistoryTrainingsPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { ageGroupId, playerId } = use(params);
  const { name: ageGroupName } = useAgeGroupMeta(ageGroupId);

  return (
    <PlayerTrainingsHistoryView
      playerId={playerId}
      scope={{
        breadcrumbItemsPrefix: [
          { label: "Equipas", href: "/teams" },
          {
            label: ageGroupName ?? "Escalão",
            href: `/teams/${ageGroupId}`,
            shortLabel: ageGroupName ?? "Escalão",
          },
          {
            label: "Plantel",
            href: `/teams/${ageGroupId}/players`,
          },
          {
            label: "Atleta",
            href: `/teams/${ageGroupId}/players/${playerId}`,
          },
        ],
        fallbackReturnHref: `/teams/${ageGroupId}/players/${playerId}`,
        returnToKey: `player:team:${ageGroupId}:${playerId}`,
        backLabel: "Voltar ao perfil",
      }}
    />
  );
}
