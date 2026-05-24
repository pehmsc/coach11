"use client";

import { use } from "react";
import { LiveGameView } from "@/components/games/live/LiveGameView";

type PageParams = { id: string };

export default function LiveGamePage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { id } = use(params);

  return (
    <LiveGameView
      gameId={id}
      scope={{
        breadcrumbItemsPrefix: [{ label: "Jogos", href: "/games" }],
        gameBaseHref: `/games/${id}`,
        returnToKey: `game:${id}`,
        backLabel: "Voltar ao jogo",
      }}
    />
  );
}
