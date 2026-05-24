"use client";

import { use } from "react";
import { PlayerTrainingsHistoryView } from "@/components/players/history/PlayerTrainingsHistoryView";

type PageParams = { id: string };

export default function PlayerHistoryTrainingsPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { id } = use(params);

  return (
    <PlayerTrainingsHistoryView
      playerId={id}
      scope={{
        breadcrumbItemsPrefix: [
          { label: "Plantel", href: "/players" },
          { label: "Atleta", href: `/players/${id}` },
        ],
        fallbackReturnHref: `/players/${id}`,
        returnToKey: `player:${id}`,
        backLabel: "Voltar ao perfil",
      }}
    />
  );
}
