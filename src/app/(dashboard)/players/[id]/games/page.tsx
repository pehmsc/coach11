"use client";

import { use } from "react";
import { PlayerGamesHistoryView } from "@/components/players/history/PlayerGamesHistoryView";

type PageParams = { id: string };

export default function PlayerHistoryGamesPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { id } = use(params);

  return (
    <PlayerGamesHistoryView
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
