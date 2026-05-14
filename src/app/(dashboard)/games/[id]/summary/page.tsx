"use client";

import { useParams } from "next/navigation";
import { GameSummaryView } from "@/components/games/summary/GameSummaryView";

export default function GameSummaryPage() {
  const { id } = useParams<{ id: string }>();
  return <GameSummaryView gameId={id} />;
}
