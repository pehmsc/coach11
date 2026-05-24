"use client";

import { use } from "react";
import { LiveGameView } from "@/components/games/live/LiveGameView";
import { useAgeGroupMeta } from "@/hooks/useAgeGroupName";

type PageParams = { ageGroupId: string; gameId: string };

export default function TeamLiveGamePage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { ageGroupId, gameId } = use(params);
  const { name: ageGroupName } = useAgeGroupMeta(ageGroupId);

  return (
    <LiveGameView
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
        gameBaseHref: `/teams/${ageGroupId}/games/${gameId}`,
        returnToKey: `game:team:${ageGroupId}:${gameId}`,
        backLabel: "Voltar ao jogo",
      }}
    />
  );
}
