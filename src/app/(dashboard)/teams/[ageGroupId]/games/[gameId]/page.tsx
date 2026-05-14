"use client";

import { use } from "react";
import { GameDetailView } from "@/components/games/detail/GameDetailView";
import { useAgeGroupMeta } from "@/hooks/useAgeGroupName";

type PageParams = { ageGroupId: string; gameId: string };

export default function TeamGameDetailPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { ageGroupId, gameId } = use(params);
  const { name: ageGroupName } = useAgeGroupMeta(ageGroupId);

  return (
    <GameDetailView
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
        fallbackReturnHref: `/teams/${ageGroupId}/games`,
        returnToKey: `games:team:${ageGroupId}`,
        backLabel: "Voltar aos jogos",
        gameBaseHref: `/teams/${ageGroupId}/games/${gameId}`,
      }}
    />
  );
}
