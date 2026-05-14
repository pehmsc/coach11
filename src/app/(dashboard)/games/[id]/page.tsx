"use client";

import { useParams } from "next/navigation";
import { GameDetailView } from "@/components/games/detail/GameDetailView";

export default function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <GameDetailView gameId={id} />;
}
