"use client";

import { use } from "react";
import { GameSummaryView } from "@/components/games/summary/GameSummaryView";
import { useAgeGroupMeta } from "@/hooks/useAgeGroupName";

type PageParams = { ageGroupId: string; gameId: string };

export default function TeamGameSummaryPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { ageGroupId, gameId } = use(params);
  const { name: ageGroupName } = useAgeGroupMeta(ageGroupId);

  return (
    <GameSummaryView
      gameId={gameId}
      scope={{
        breadcrumbItemsPrefix: [
          { label: "Equipas", href: "/teams" },
          {
            label: ageGroupName ?? "Escalão",
            href: `/teams/${ageGroupId}`,
            shortLabel: ageGroupName ?? "Escalão",
          },
          {
            label: "Jogos",
            href: `/teams/${ageGroupId}/games`,
          },
        ],
        detailHref: `/teams/${ageGroupId}/games/${gameId}`,
        returnToKey: `games:team:${ageGroupId}`,
        backLabel: "Voltar ao jogo",
      }}
    />
  );
}
