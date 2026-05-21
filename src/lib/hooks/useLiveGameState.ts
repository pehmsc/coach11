"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { filterPersistentLiveStatsPlayers } from "@/lib/games/live-persistence";
import { captureClientProductEvent } from "@/lib/observability/posthog-client";
import { exportMatchReportPDF } from "@/lib/pdf/matchReport";
import { useLivePhase } from "@/lib/hooks/live/useLivePhase";
import { useLiveClock } from "@/lib/hooks/live/useLiveClock";
import { useLiveEvents } from "@/lib/hooks/live/useLiveEvents";
import { useLiveLineup } from "@/lib/hooks/live/useLiveLineup";
import { useLiveDataLoader } from "@/lib/hooks/live/useLiveDataLoader";
import { useLiveDerivedState } from "@/lib/hooks/live/useLiveDerivedState";
import { useLiveEventModal } from "@/lib/hooks/live/useLiveEventModal";
import type {
  LivePlayer,
  FinalStatPayloadRow,
} from "@/components/games/live/types";
import {
  isGoalEventType,
  computeMinutesPlayed,
} from "@/components/games/live/utils";

export function useLiveGameState(id: string) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [finalizing, setFinalizing] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);

  // Shadow refs para callbacks de sub-hooks declarados depois do useLivePhase.
  // Necessário porque useLivePhase é o PRIMEIRO sub-hook (expõe `phase` como
  // input dos outros), mas `handleStartFirstHalf` precisa de chamar
  // persistInitialLineupSnapshot (useLiveLineup), setInitialStarterIds
  // (useLiveLineup) e startClock (useLiveClock). As refs são actualizadas
  // durante o render após cada sub-hook ser definido — sem race porque o
  // React garante sequência ordenada de hooks antes do retorno.
  const persistInitialLineupSnapshotShadow = useRef<
    (ids: string[]) => Promise<void>
  >(async () => {});
  const setInitialStarterIdsShadow = useRef<(ids: string[]) => void>(() => {});
  const startClockShadow = useRef<() => void>(() => {});
  // Lazy getter para playersOnField (vem do useLiveDerivedState chamado
  // depois). Quebra a dependência circular DerivedState↔Phase.
  const playersOnFieldRef = useRef<LivePlayer[]>([]);

  // 1. useLivePhase (PRIMEIRO — expõe `phase` aos outros sub-hooks)
  const {
    phase,
    setPhase,
    startingFirstHalf,
    kickoffError,
    setKickoffError,
    clearKickoffError,
    handleStartFirstHalf,
  } = useLivePhase({
    gameId: id,
    getPlayersOnField: () => playersOnFieldRef.current,
    persistInitialLineupSnapshot: (ids) =>
      persistInitialLineupSnapshotShadow.current(ids),
    setInitialStarterIds: (ids) => setInitialStarterIdsShadow.current(ids),
    startClock: () => startClockShadow.current(),
  });

  // 2. useLiveClock
  const {
    clockState,
    nowMs,
    clockSeconds,
    currentMinute,
    pauseClock,
    startClock,
    adjustClockBySeconds,
    setClockMinute,
    setClockState,
    setNowMs,
    setClockHydrated,
    disableBackendCheckpoint,
  } = useLiveClock({ id, phase });

  // Review phase
  const [playerRatings, setPlayerRatings] = useState<Record<string, number>>({});
  const [mvpPlayerId, setMvpPlayerId] = useState<string | null>(null);
  // Match sheet (ficha pós-jogo, Sprint 3) — hidratada do `game` uma só vez
  const [liveTacticalSystem, setLiveTacticalSystem] = useState<string>("");
  const [livePositiveAspects, setLivePositiveAspects] = useState<string>("");
  const [liveNegativeAspects, setLiveNegativeAspects] = useState<string>("");
  const [liveAspectsToImprove, setLiveAspectsToImprove] = useState<string>("");
  const [liveTeamNotes, setLiveTeamNotes] = useState<string>("");
  const [liveCoachNotes, setLiveCoachNotes] = useState<string>("");
  const hasHydratedMatchSheetRef = useRef(false);

  const {
    convocatedPlayers,
    setConvocatedPlayers,
    initialStarterIds,
    setInitialStarterIds,
    savingLineup,
    saveLivePlayerStatus,
    syncConvocatedPlayersFromBackend,
    persistInitialLineupSnapshot,
    toggleLineup,
  } = useLiveLineup({
    id,
    phase,
    onLineupChange: clearKickoffError,
  });

  // Actualizar shadow refs APÓS useLiveLineup e useLiveClock estarem
  // definidos. Acontece dentro do render — quando o utilizador clica
  // "Iniciar 1ª parte", as refs já apontam para as funções reais.
  persistInitialLineupSnapshotShadow.current = persistInitialLineupSnapshot;
  setInitialStarterIdsShadow.current = setInitialStarterIds;
  startClockShadow.current = startClock;

  const {
    events,
    setEvents,
    cascadeDeleteIds,
    loadEventsFromBackend,
    insertEventsToBackend,
    deleteEvent,
    confirmCascadeDelete,
    cancelCascadeDelete,
  } = useLiveEvents({
    id,
    convocatedPlayers,
    initialStarterIds,
    setConvocatedPlayers,
    saveLivePlayerStatus,
  });

  const {
    loading,
    game,
    setGame,
    homeClubName,
    homeClubShortName,
    error,
  } = useLiveDataLoader({
    id,
    supabase,
    router,
    setClockHydrated,
    setClockState,
    setNowMs,
    disableBackendCheckpoint,
    setConvocatedPlayers,
    setInitialStarterIds,
    setEvents,
    loadEventsFromBackend,
    setPhase,
    setKickoffError,
    events,
    initialStarterIds,
  });

  // Hidrata os campos da ficha do jogo a partir do `game` uma só vez quando
  // ele aparece. Usar ref evita re-hidratação se um refetch sobrepuser
  // edições locais não-guardadas no <ReviewPanel>.
  useEffect(() => {
    if (!game || hasHydratedMatchSheetRef.current) return;
    setLiveTacticalSystem(game.tactical_system ?? "");
    setLivePositiveAspects(game.positive_aspects ?? "");
    setLiveNegativeAspects(game.negative_aspects ?? "");
    setLiveAspectsToImprove(game.aspects_to_improve ?? "");
    setLiveTeamNotes(game.team_notes ?? "");
    setLiveCoachNotes(game.coach_notes ?? "");
    hasHydratedMatchSheetRef.current = true;
  }, [game]);

  const {
    score,
    displayEvents,
    yellowCardsByPlayer,
    getPlayerAvailability,
    playersOnField,
    playersOnBench,
    playersAvailableToEnter,
    suspendedBenchPlayers,
    hasExternalConvocatedPlayers,
    kickoffState,
    isLivePhase,
    canRegisterEvents,
    canRegisterSubstitutionOrCard,
    starterIds,
    computedMinutes,
    playersWhoNeedPersistentStats,
    concededGoalsByPlayer,
  } = useLiveDerivedState({
    game,
    phase,
    clockState,
    currentMinute,
    events,
    convocatedPlayers,
    initialStarterIds,
  });

  // Mantém playersOnFieldRef sincronizada com o valor mais recente
  // para o getter lazy do useLivePhase.handleStartFirstHalf.
  useEffect(() => {
    playersOnFieldRef.current = playersOnField;
  }, [playersOnField]);

  const {
    modalType,
    goalTeamSide,
    goalKind,
    goalStep,
    selectedScorerID,
    selectedAssistID,
    selectedSubOutId,
    selectedSubInId,
    savingEvent,
    setGoalTeamSide,
    setGoalKind,
    setGoalStep,
    setSelectedScorerID,
    setSelectedAssistID,
    setSelectedSubOutId,
    setSelectedSubInId,
    openModal,
    closeModal,
    confirmGoal,
    confirmCard,
    confirmSubstitution,
  } = useLiveEventModal({
    canRegisterEvents,
    canRegisterSubstitutionOrCard,
    currentMinute,
    events,
    setEvents,
    insertEventsToBackend,
    convocatedPlayers,
    setConvocatedPlayers,
    saveLivePlayerStatus,
    syncConvocatedPlayersFromBackend,
    getPlayerAvailability,
  });

  const isFinalized = game?.status === "completed";

  const allRatingsFilled = useMemo(
    () =>
      playersWhoNeedPersistentStats.every(
        (player) => playerRatings[player.id] !== undefined,
      ),
    [playerRatings, playersWhoNeedPersistentStats],
  );

  function buildFinalStatsPayload(finalMinute: number): FinalStatPayloadRow[] {
    const normalizedFinalMinute = Math.max(1, Math.floor(finalMinute));
    const minutesMap = computeMinutesPlayed(
      convocatedPlayers,
      events,
      starterIds,
      normalizedFinalMinute,
    );

    return filterPersistentLiveStatsPlayers(convocatedPlayers).map((player) => {
      const minutesPlayed = Math.max(
        0,
        Math.min(normalizedFinalMinute, minutesMap.get(player.id) ?? 0),
      );
      const goals = events.filter(
        (event) =>
          event.player_id === player.id &&
          !event.is_opponent_event &&
          isGoalEventType(event.event_type),
      ).length;
      const ownGoals = events.filter(
        (event) =>
          event.player_id === player.id &&
          !event.is_opponent_event &&
          event.event_type === "own_goal",
      ).length;
      const assists = events.filter(
        (event) =>
          event.related_player_id === player.id &&
          !event.is_opponent_event &&
          isGoalEventType(event.event_type),
      ).length;
      const yellowCards = events.filter(
        (event) =>
          event.player_id === player.id &&
          !event.is_opponent_event &&
          event.event_type === "yellow_card",
      ).length;
      const redCards = events.filter(
        (event) =>
          event.player_id === player.id &&
          !event.is_opponent_event &&
          event.event_type === "red_card",
      ).length;

      return {
        player_id: player.id,
        lineup_type: starterIds.has(player.id) ? "starter" : "substitute",
        minutes_played: minutesPlayed,
        goals,
        own_goals: ownGoals,
        assists,
        yellow_cards: yellowCards,
        red_cards: redCards,
        coach_rating: playerRatings[player.id] ?? null,
        is_mvp: player.id === mvpPlayerId,
        is_finalized: true,
      };
    });
  }

  async function finalizeGame() {
    if (!game || phase !== "review") {
      toast.error("Termina a 2ª parte antes de finalizar o jogo.");
      return;
    }

    if (!allRatingsFilled) {
      toast.error("Preenche a nota (0–10) de todos os jogadores que participaram.");
      return;
    }

    const confirmSave = window.confirm(
      "Confirmas que os eventos, notas e MVP estão corretos para gravar as estatísticas?",
    );
    if (!confirmSave) return;

    setFinalizing(true);
    try {
      // Match sheet (Sprint 3) — guardar antes da finalização para que não
      // dependa de extensão ao RPC rpc_finalize_game_auth. PATCH separado em
      // /api/games/[id]. Atomicidade frouxa: se este falhar, abortamos antes
      // de gravar estatísticas; se passar e o /live/finalize falhar, os
      // campos ficam guardados e o jogo continua não-finalizado (retoma).
      try {
        const patchRes = await fetch(`/api/games/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tactical_system: liveTacticalSystem.trim() || null,
            positive_aspects: livePositiveAspects.trim() || null,
            negative_aspects: liveNegativeAspects.trim() || null,
            aspects_to_improve: liveAspectsToImprove.trim() || null,
            team_notes: liveTeamNotes.trim() || null,
            coach_notes: liveCoachNotes.trim() || null,
          }),
        });
        if (!patchRes.ok) {
          const patchPayload = await patchRes.json().catch(() => null);
          const patchMessage =
            (patchPayload as { error?: string } | null)?.error ||
            "Erro ao guardar ficha do jogo.";
          toast.error(`Erro ao guardar ficha do jogo: ${patchMessage}`);
          setFinalizing(false);
          return;
        }
      } catch {
        toast.error("Erro ao guardar ficha do jogo.");
        setFinalizing(false);
        return;
      }

      const finalMinute = Math.max(1, Math.floor(currentMinute));
      const finalStatsPayload = buildFinalStatsPayload(finalMinute);

      console.info("[live.finalize] sending payload", {
        gameId: id,
        finalMinute,
        rows: finalStatsPayload.length,
        score,
      });

      const res = await fetch(`/api/games/${id}/live/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalStats: finalStatsPayload,
          score_home: score.home,
          score_away: score.away,
          final_minute: finalMinute,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (payload as { error?: string } | null)?.error ||
            "Erro ao persistir estatísticas finais.",
        );
      }

      pauseClock();
      setPhase("completed");
      setGame((prev) =>
        prev
          ? {
              ...prev,
              status: "completed",
              score_home: score.home,
              score_away: score.away,
            }
          : prev,
      );
      toast.success("Jogo finalizado e estatísticas guardadas!");
      router.push(`/games/${id}/summary`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro interno ao finalizar jogo.";
      console.error("[live.finalize] failed", {
        gameId: id,
        phase,
        minute: currentMinute,
        players: convocatedPlayers.length,
        error,
      });
      toast.error(`Erro ao finalizar jogo: ${message}`);
    } finally {
      setFinalizing(false);
    }
  }

  async function handleExportPDF() {
    if (!game) return;
    setExportingPDF(true);
    try {
      await exportMatchReportPDF({
        gameDatetime: game.game_datetime,
        opponentName: game.opponent_name || "Adversário",
        isHome: game.is_home,
        scoreHome: score.home,
        scoreAway: score.away,
        location: game.location,
        events: displayEvents.map((e) => {
          const pl = convocatedPlayers.find((p) => p.id === e.player_id);
          const rel = convocatedPlayers.find((p) => p.id === e.related_player_id);
          return {
            minute: e.minute,
            event_type: e.event_type,
            playerName: pl ? `${pl.first_name} ${pl.last_name}` : undefined,
            relatedPlayerName: rel ? `${rel.first_name} ${rel.last_name}` : undefined,
            is_opponent_event: e.is_opponent_event,
          };
        }),
        players: convocatedPlayers.map((p) => ({
          jersey_number: p.jersey_number,
          name: `${p.first_name} ${p.last_name}`,
          goals: events.filter(
            (e) => e.player_id === p.id && isGoalEventType(e.event_type),
          ).length,
          assists: events.filter(
            (e) => e.related_player_id === p.id && isGoalEventType(e.event_type),
          ).length,
          goals_conceded: concededGoalsByPlayer.get(p.id) ?? 0,
          yellow_cards: events.filter(
            (e) => e.player_id === p.id && e.event_type === "yellow_card",
          ).length,
          red_cards: events.filter(
            (e) => e.player_id === p.id && e.event_type === "red_card",
          ).length,
        })),
      });

      captureClientProductEvent("pdf_generated", {
        game_id: game.id,
        age_group_id: game.age_group_id ?? null,
        team_id: game.team_id ?? null,
        source: "match_report",
      });
    } catch {
      toast.error("Erro ao exportar PDF.");
    }
    setExportingPDF(false);
  }

  return {
    // State
    loading,
    game,
    homeClubName,
    homeClubShortName,
    convocatedPlayers,
    events,
    clockState,
    nowMs,
    phase,
    savingEvent,
    savingLineup,
    startingFirstHalf,
    kickoffError,
    finalizing,
    exportingPDF,
    error,
    modalType,
    goalTeamSide,
    goalKind,
    goalStep,
    selectedScorerID,
    selectedAssistID,
    selectedSubOutId,
    selectedSubInId,
    playerRatings,
    mvpPlayerId,
    clockSeconds,
    currentMinute,
    score,
    displayEvents,
    isLivePhase,
    canRegisterEvents,
    canRegisterSubstitutionOrCard,
    isFinalized,
    allRatingsFilled,
    playersOnField,
    playersOnBench,
    playersAvailableToEnter,
    suspendedBenchPlayers,
    hasExternalConvocatedPlayers,
    kickoffState,
    playersWhoNeedPersistentStats,
    computedMinutes,
    concededGoalsByPlayer,
    yellowCardsByPlayer,

    // Setters
    setPhase,
    setGoalTeamSide,
    setGoalKind,
    setGoalStep,
    setSelectedScorerID,
    setSelectedAssistID,
    setSelectedSubOutId,
    setSelectedSubInId,
    setPlayerRatings,
    setMvpPlayerId,
    // Match sheet (Sprint 3)
    liveTacticalSystem,
    setLiveTacticalSystem,
    livePositiveAspects,
    setLivePositiveAspects,
    liveNegativeAspects,
    setLiveNegativeAspects,
    liveAspectsToImprove,
    setLiveAspectsToImprove,
    liveTeamNotes,
    setLiveTeamNotes,
    liveCoachNotes,
    setLiveCoachNotes,

    // Actions
    pauseClock,
    startClock,
    adjustClockBySeconds,
    setClockMinute,
    handleStartFirstHalf,
    openModal,
    closeModal,
    confirmGoal,
    confirmCard,
    confirmSubstitution,
    toggleLineup,
    deleteEvent,
    cascadeDeleteIds,
    confirmCascadeDelete,
    cancelCascadeDelete,
    finalizeGame,
    handleExportPDF,
    getPlayerAvailability,
  };
}
