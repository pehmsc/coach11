"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerProfileHeader } from "@/components/players/profile/PlayerProfileHeader";
import {
  PlayerStatsGroup,
  type PlayerSeasonStats,
} from "@/components/players/profile/PlayerStatsGroup";
import { PlayerHistoryShortcuts } from "@/components/players/profile/PlayerHistoryShortcuts";
import type { Player } from "@/types/database";

interface PlayerResponse {
  success?: boolean;
  player?: Player;
  error?: string;
}

interface StatsResponse {
  success?: boolean;
  stats?: PlayerSeasonStats | null;
  error?: string;
}

export default function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [player, setPlayer] = useState<Player | null>(null);
  const [stats, setStats] = useState<PlayerSeasonStats | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [playerRes, statsRes] = await Promise.all([
        fetch(`/api/players/${id}`).then(
          (r) =>
            r.json().catch(() => null) as Promise<PlayerResponse | null>,
        ),
        fetch(`/api/players/${id}/stats/aggregate`).then(
          (r) =>
            r.json().catch(() => null) as Promise<StatsResponse | null>,
        ),
      ]);

      if (cancelled) return;

      if (!playerRes?.player) {
        setError(playerRes?.error || "Atleta não encontrado.");
        setLoading(false);
        return;
      }

      setPlayer(playerRes.player);
      setStats(statsRes?.stats ?? null);

      // O GET /api/players/[id] já valida que o user tem acesso ao escalão
      // do atleta (via accessibleAgeGroupIds) — se retornou 200, o user é
      // staff do escalão e a RLS de UPDATE permite editar. PR 2 pode
      // refinar este gate caso a regra mude.
      setCanEdit(true);

      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <StickyBackLink
        href="/players"
        label="Voltar ao plantel"
        wrapperClassName="-mx-4 mb-4 bg-slate-50/95 px-4 py-2 md:-mx-8 md:px-8"
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
          <AlertCircle
            size={28}
            className="mx-auto mb-2 text-red-400"
            aria-hidden="true"
          />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : player ? (
        <div className="space-y-5">
          <PlayerProfileHeader player={player} canEdit={canEdit} />
          <PlayerStatsGroup stats={stats} status={player.status} />
          <PlayerHistoryShortcuts />
        </div>
      ) : null}
    </div>
  );
}
