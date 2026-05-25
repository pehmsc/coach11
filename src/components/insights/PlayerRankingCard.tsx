"use client";

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Goal,
  Sparkles,
  Clock,
  Dumbbell,
  UserMinus,
  HeartPulse,
  Timer,
  Trophy,
  Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/insights/PlayerAvatar";
import type {
  ClubPlayerRanking,
  ClubRankingMetric,
} from "@/types/database";

type MetricMeta = {
  label: string;
  icon: typeof Goal;
  suffix: (n: number) => string;
};

const METRIC_META: Record<ClubRankingMetric, MetricMeta> = {
  goals: {
    label: "Marcadores",
    icon: Goal,
    suffix: (n) => (n === 1 ? "golo" : "golos"),
  },
  assists: {
    label: "Assistências",
    icon: Sparkles,
    suffix: (n) => (n === 1 ? "assistência" : "assistências"),
  },
  minutes: {
    label: "Minutos",
    icon: Clock,
    suffix: () => "min",
  },
  matches: {
    label: "Jogos",
    icon: Trophy,
    suffix: (n) => (n === 1 ? "jogo" : "jogos"),
  },
  trainings_present: {
    label: "Presenças",
    icon: Dumbbell,
    suffix: (n) => (n === 1 ? "treino" : "treinos"),
  },
  trainings_absent: {
    label: "Ausências",
    icon: UserMinus,
    suffix: (n) => (n === 1 ? "falta" : "faltas"),
  },
  trainings_injured: {
    label: "Lesionados",
    icon: HeartPulse,
    suffix: (n) => (n === 1 ? "treino" : "treinos"),
  },
  trainings_late: {
    label: "Atrasos",
    icon: Timer,
    suffix: (n) => (n === 1 ? "atraso" : "atrasos"),
  },
};

type Props = {
  clubId: string;
  /** uuid do escalão escolhido; null = todas as equipas do clube. */
  ageGroupId: string | null;
  /** Mostra o nome do escalão de cada atleta (relevante quando ageGroupId=null). */
  showAgeGroupName: boolean;
  /** Métricas disponíveis nas pills (define o conjunto e a ordem). */
  metrics: ClubRankingMetric[];
  limit?: number;
};

export function PlayerRankingCard({
  clubId,
  ageGroupId,
  showAgeGroupName,
  metrics,
  limit = 10,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [metric, setMetric] = useState<ClubRankingMetric>(metrics[0]);

  // Se o conjunto de métricas mudar (mudança de tab) e a métrica seleccionada
  // já não pertencer ao novo conjunto, volta à primeira da lista.
  useEffect(() => {
    if (!metrics.includes(metric)) {
      setMetric(metrics[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics]);

  const rankingQuery = useQuery({
    queryKey: [
      "insights",
      "rankings",
      clubId,
      "metric",
      metric,
      "ageGroup",
      ageGroupId,
      "limit",
      limit,
    ],
    queryFn: async (): Promise<ClubPlayerRanking[]> => {
      const { data, error } = await supabase.rpc("get_club_player_rankings", {
        p_club_id: clubId,
        p_metric: metric,
        p_season: null,
        p_age_group_id: ageGroupId,
        p_limit: limit,
      });
      if (error) throw error;
      return (data as ClubPlayerRanking[] | null) ?? [];
    },
    enabled: Boolean(clubId),
    placeholderData: keepPreviousData,
  });

  const rows = rankingQuery.data ?? [];
  const isLoading = rankingQuery.isLoading || rankingQuery.isFetching;

  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
            Rankings
          </p>
          {isLoading ? (
            <Loader2 size={14} className="animate-spin text-slate-300" />
          ) : null}
        </div>

        <div
          role="tablist"
          aria-label="Métrica do ranking"
          className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto"
        >
          {metrics.map((m) => {
            const meta = METRIC_META[m];
            const Icon = meta.icon;
            const active = metric === m;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMetric(m)}
                className={`flex-1 min-w-[5rem] flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon size={13} /> {meta.label}
              </button>
            );
          })}
        </div>

        {rows.length === 0 && !isLoading ? (
          <p className="text-sm text-slate-500 text-center py-4">
            Sem dados de atletas para este escopo.
          </p>
        ) : (
          <ol className="space-y-2">
            {rows.map((row, index) => {
              const suffix = METRIC_META[metric].suffix(row.metric_value);
              return (
                <li
                  key={`${row.player_id}-${row.age_group_id}`}
                  className="flex items-center gap-3"
                >
                  <span className="w-6 text-center text-xs font-bold text-slate-400">
                    {index + 1}
                  </span>
                  <PlayerAvatar
                    avatarUrl={row.avatar_url}
                    photoConsentGiven={row.photo_consent_given}
                    fullName={row.full_name}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">
                      {row.full_name}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {row.preferred_position
                        ? `${row.preferred_position}`
                        : "—"}
                      {row.jersey_number ? ` · #${row.jersey_number}` : ""}
                      {showAgeGroupName ? ` · ${row.age_group_name}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-slate-900 whitespace-nowrap">
                    {row.metric_value}{" "}
                    <span className="text-[11px] font-medium text-slate-500">
                      {suffix}
                    </span>
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
