"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/http/apiFetch";
import { useMeContext } from "@/lib/hooks/useMeContext";
import { queryKeys } from "@/lib/query/keys";
import { useAgeGroup } from "@/contexts/AgeGroupContext";
import type { Player } from "@/types/database";
import type {
  AttendanceStats,
  GameStats,
  FinalStatRow,
  StatisticsPlayersResponse,
} from "@/components/statistics/types";
import { isGoalkeeper } from "@/components/statistics/utils";

export function useStatisticsData() {
  const meContextQuery = useMeContext();
  const { selectedAgeGroupId: contextAgeGroupId, ageGroups: accessibleAgeGroups } =
    useAgeGroup();
  // contextAgeGroupId reflecte o estado efectivo do ScopeToggle:
  //  - null  → user escolheu "Todos os escaloes" (RPC agrega tudo)
  //  - uuid  → escalao especifico
  // O AgeGroupContext ja faz fallback para defaultAgeGroupId no Provider.
  const ageGroupId = contextAgeGroupId;
  const isAllScopes = contextAgeGroupId === null;

  // Lookup nome de escalao por id, para mostrar subtitulo em "Todos os
  // escaloes" sem fetch extra. accessibleAgeGroups vem do AgeGroupContext
  // que ja filtra pelos escaloes a que o user tem acesso (RLS-aware).
  const ageGroupNameById = useMemo(() => {
    const map = new Map<string, string>();
    accessibleAgeGroups.forEach((ag) => map.set(ag.id, ag.name));
    return map;
  }, [accessibleAgeGroups]);
  const ageGroupName = isAllScopes
    ? "Todos os escalões"
    : meContextQuery.data?.ageGroup?.name ?? "Escalão";

  const statisticsQuery = useQuery({
    queryKey: isAllScopes
      ? [...queryKeys.statistics.root(), "players", "all"]
      : ageGroupId
        ? queryKeys.statistics.players(ageGroupId)
        : [...queryKeys.statistics.root(), "players", "none"],
    queryFn: () =>
      apiFetch<StatisticsPlayersResponse>(
        isAllScopes
          ? "/api/statistics/players?ageGroupId=all"
          : `/api/statistics/players?ageGroupId=${ageGroupId}`,
      ),
    enabled: isAllScopes || Boolean(ageGroupId),
    placeholderData: keepPreviousData,
  });

  const players = useMemo(
    () => statisticsQuery.data?.players ?? [],
    [statisticsQuery.data?.players],
  );

  const attendanceStats = useMemo(() => {
    const attRows = statisticsQuery.data?.attendanceRows ?? [];
    const attMap = new Map<string, AttendanceStats>();

    players.forEach((player) => {
      attMap.set(player.id, {
        player,
        presencas: 0,
        atrasados: 0,
        ausencias: 0,
        lesionados: 0,
        minutos: 0,
      });
    });

    attRows.forEach((row) => {
      const entry = attMap.get(row.player_id);
      if (!entry) return;
      if (row.status === "present") entry.presencas += 1;
      else if (row.status === "late") entry.atrasados += 1;
      else if (row.status === "absent") entry.ausencias += 1;
      else if (row.status === "injured") entry.lesionados += 1;
    });

    attMap.forEach((entry) => {
      entry.minutos = (entry.presencas + entry.atrasados) * 60;
    });

    return Array.from(attMap.values());
  }, [players, statisticsQuery.data?.attendanceRows]);

  const gameStats = useMemo(() => {
    const finalStats = statisticsQuery.data?.finalStats ?? [];
    const convocations = statisticsQuery.data?.convocations ?? [];
    const convocationPlayers = statisticsQuery.data?.convocationPlayers ?? [];
    const gameEvents = statisticsQuery.data?.gameEvents ?? [];

    const convGameIdsByPlayer = new Map<string, Set<string>>();
    const convocationToGame = new Map<string, string>();
    convocations.forEach((convocation) =>
      convocationToGame.set(convocation.id, convocation.game_id),
    );

    convocationPlayers.forEach((entry) => {
      const gameId = convocationToGame.get(entry.convocation_id);
      if (!gameId) return;
      if (!convGameIdsByPlayer.has(entry.player_id)) {
        convGameIdsByPlayer.set(entry.player_id, new Set());
      }
      convGameIdsByPlayer.get(entry.player_id)?.add(gameId);
    });

    const gameStatsMap = new Map<string, GameStats>();
    players.forEach((player) => {
      gameStatsMap.set(player.id, {
        player,
        golos: 0,
        autoGolos: 0,
        assistencias: 0,
        minutos: 0,
        gs: 0,
        titular: 0,
        suplente: 0,
        convocatorias: convGameIdsByPlayer.get(player.id)?.size ?? 0,
        mvp: 0,
        amarelos: 0,
        vermelhos: 0,
        totalJogos: 0,
        mediaNotaSum: 0,
        mediaNotaCount: 0,
      });
    });

    finalStats
      .filter((entry) => entry.is_finalized)
      .forEach((entry) => {
        const playerStats = gameStatsMap.get(entry.player_id);
        if (!playerStats) return;
        playerStats.golos += entry.goals ?? 0;
        playerStats.autoGolos += entry.own_goals ?? 0;
        playerStats.assistencias += entry.assists ?? 0;
        playerStats.minutos += entry.minutes_played ?? 0;
        playerStats.amarelos += entry.yellow_cards ?? 0;
        playerStats.vermelhos += entry.red_cards ?? 0;
        if (entry.lineup_type === "starter") playerStats.titular += 1;
        else playerStats.suplente += 1;
        if (entry.is_mvp) playerStats.mvp += 1;
        if (entry.coach_rating !== null && entry.coach_rating !== undefined) {
          playerStats.mediaNotaSum += entry.coach_rating;
          playerStats.mediaNotaCount += 1;
        }
        playerStats.totalJogos += 1;
      });

    const playerById = new Map(players.map((player: Player) => [player.id, player]));
    const fallbackGoalkeeperByGame = new Map<string, string>();
    const finalizedRows = finalStats.filter((row) => row.is_finalized);
    const rowsByGame = new Map<string, FinalStatRow[]>();

    finalizedRows.forEach((row) => {
      if (!row.game_id) return;
      if (!rowsByGame.has(row.game_id)) rowsByGame.set(row.game_id, []);
      rowsByGame.get(row.game_id)?.push(row);
    });

    rowsByGame.forEach((rows, gameId) => {
      const bestGoalkeeper = [...rows]
        .filter((row) => isGoalkeeper(playerById.get(row.player_id)))
        .sort((a, b) => (b.minutes_played ?? 0) - (a.minutes_played ?? 0))[0];

      if (bestGoalkeeper?.player_id) {
        fallbackGoalkeeperByGame.set(gameId, bestGoalkeeper.player_id);
      }
    });

    const isConcededEvent = (event: { is_opponent_event: boolean; event_type: string }) =>
      event.is_opponent_event &&
      (event.event_type === "goal" || event.event_type === "penalty_goal");

    gameEvents.filter(isConcededEvent).forEach((event) => {
      const directPlayerId =
        typeof event.player_id === "string" && event.player_id.length > 0
          ? event.player_id
          : null;
      const targetPlayerId =
        directPlayerId ?? fallbackGoalkeeperByGame.get(event.game_id) ?? null;
      if (!targetPlayerId) return;
      const entry = gameStatsMap.get(targetPlayerId);
      if (!entry) return;
      entry.gs += 1;
    });

    return Array.from(gameStatsMap.values());
  }, [
    players,
    statisticsQuery.data?.convocationPlayers,
    statisticsQuery.data?.convocations,
    statisticsQuery.data?.finalStats,
    statisticsQuery.data?.gameEvents,
  ]);

  const loading =
    meContextQuery.isPending ||
    ((isAllScopes || Boolean(ageGroupId)) &&
      statisticsQuery.isPending &&
      !statisticsQuery.data);

  // Yellow card alerts
  const yellowAlerts = useMemo(
    () => gameStats.filter((s) => s.amarelos >= 3),
    [gameStats],
  );

  return {
    ageGroupId,
    ageGroupName,
    players,
    attendanceStats,
    gameStats,
    loading,
    yellowAlerts,
    isAllScopes,
    ageGroupNameById,
  };
}
