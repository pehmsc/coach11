"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { StickyBackLink } from "@/components/navigation/StickyBackLink";
import { Breadcrumb, type BreadcrumbItem } from "@/components/navigation/Breadcrumb";
import { getReturnTo } from "@/hooks/useReturnTo";
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

/**
 * Scope override permite à rota escalão (/teams/[id]/players/[playerId])
 * personalizar breadcrumb e returnHref sem duplicar a view inteira.
 */
export type PlayerDetailScope = {
  /** Breadcrumb items para mostrar acima do conteúdo. */
  breadcrumbItemsPrefix: BreadcrumbItem[];
  /** URL de fallback para "Voltar" quando sessionStorage não tem nada. */
  fallbackReturnHref: string;
  /** Chave do useReturnTo (default: "players" no contexto global). */
  returnToKey: string;
  /** Label do StickyBackLink. */
  backLabel: string;
};

const GLOBAL_SCOPE: PlayerDetailScope = {
  breadcrumbItemsPrefix: [{ label: "Plantel", href: "/players" }],
  fallbackReturnHref: "/players",
  returnToKey: "players",
  backLabel: "Voltar ao plantel",
};

interface Props {
  playerId: string;
  /** Quando definido, sobrepõe o scope global. */
  scope?: PlayerDetailScope;
}

export function PlayerDetailView({ playerId, scope = GLOBAL_SCOPE }: Props) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [stats, setStats] = useState<PlayerSeasonStats | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [returnHref] = useState(() =>
    getReturnTo(scope.returnToKey, scope.fallbackReturnHref),
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [playerRes, statsRes] = await Promise.all([
        fetch(`/api/players/${playerId}`).then(
          (r) => r.json().catch(() => null) as Promise<PlayerResponse | null>,
        ),
        fetch(`/api/players/${playerId}/stats/aggregate`).then(
          (r) => r.json().catch(() => null) as Promise<StatsResponse | null>,
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
      setCanEdit(true);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const playerLabel = player
    ? `${player.first_name} ${player.last_name}`.trim() || "Atleta"
    : "Atleta";

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <StickyBackLink
        href={returnHref}
        label={scope.backLabel}
        wrapperClassName="-mx-4 mb-4 bg-slate-50/95 px-4 py-2 md:-mx-8 md:px-8"
      >
        <Breadcrumb
          items={[
            ...scope.breadcrumbItemsPrefix,
            { label: playerLabel },
          ]}
        />
      </StickyBackLink>

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
          <PlayerProfileHeader
            player={player}
            canEdit={canEdit}
            onSaved={(updated) => setPlayer(updated)}
          />
          <PlayerStatsGroup stats={stats} status={player.status} />
          <PlayerHistoryShortcuts playerId={playerId} />
        </div>
      ) : null}
    </div>
  );
}
