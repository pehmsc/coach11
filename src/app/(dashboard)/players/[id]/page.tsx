"use client";

import { useParams } from "next/navigation";
import { PlayerDetailView } from "@/components/players/detail/PlayerDetailView";

export default function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <PlayerDetailView playerId={id} />;
}
