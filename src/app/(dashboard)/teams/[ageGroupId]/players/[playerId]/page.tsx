"use client";

import { use } from "react";
import { PlayerDetailView } from "@/components/players/detail/PlayerDetailView";
import { useAgeGroupMeta } from "@/hooks/useAgeGroupName";

type PageParams = { ageGroupId: string; playerId: string };

export default function TeamPlayerDetailPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { ageGroupId, playerId } = use(params);
  const { name: ageGroupName } = useAgeGroupMeta(ageGroupId);

  return (
    <PlayerDetailView
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
        ],
        fallbackReturnHref: `/teams/${ageGroupId}/players`,
        returnToKey: `players:team:${ageGroupId}`,
        backLabel: "Voltar ao plantel",
      }}
    />
  );
}
