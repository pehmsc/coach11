"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLivePhase } from "@/lib/hooks/live/useLivePhase";
import { useLiveClock } from "@/lib/hooks/live/useLiveClock";
import { useLiveEvents } from "@/lib/hooks/live/useLiveEvents";
import { useLiveLineup } from "@/lib/hooks/live/useLiveLineup";
import { useLiveDataLoader } from "@/lib/hooks/live/useLiveDataLoader";
import { useLiveDerivedState } from "@/lib/hooks/live/useLiveDerivedState";
import { useLiveEventModal } from "@/lib/hooks/live/useLiveEventModal";
import { useLiveObservations } from "@/lib/hooks/live/useLiveObservations";
import { useOpponentObservations } from "@/lib/hooks/useOpponentObservations";
import { useLiveFinalize } from "@/lib/hooks/live/useLiveFinalize";
import type { LivePlayer } from "@/components/games/live/types";

export function useLiveGameState(id: string) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // Shadow refs para callbacks de sub-hooks declarados depois do useLivePhase.
  // Necessário porque useLivePhase é o PRIMEIRO sub-hook (expõe `phase` como
  // input dos outros), mas `handleStartFirstHalf` precisa de chamar
  // persistInitialLineupSnapshot (useLiveLineup), setInitialStarterIds
  // (useLiveLineup) e startClock (useLiveClock). As refs são actualizadas
  // num useEffect (após commit) — sem race porque handleStartFirstHalf só
  // é chamado no click do utilizador, momento em que as refs já apontam
  // para as funções reais.
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
  // definidos. useEffect garante que a actualização ocorre após commit
  // (não durante o render). handleStartFirstHalf só é chamado no click
  // do utilizador, momento em que as refs já apontam para as funções
  // reais.
  useEffect(() => {
    persistInitialLineupSnapshotShadow.current = persistInitialLineupSnapshot;
    setInitialStarterIdsShadow.current = setInitialStarterIds;
    startClockShadow.current = startClock;
  }, [persistInitialLineupSnapshot, setInitialStarterIds, startClock]);

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

  // Observações sobre o adversário (PR B1). Posicionado após o
  // useLiveDataLoader porque precisa de `game?.opponent_id`.
  const {
    observations,
    savingObservation,
    observationModalOpen,
    openObservationModal,
    closeObservationModal,
    createObservation,
    deleteObservation,
  } = useLiveObservations({
    gameId: id,
    hasOpponent: Boolean(game?.opponent_id),
  });

  // Promoção de observações (PR B2). `autoLoad: false` — não precisamos da
  // listagem aqui (já vem do useLiveObservations), só a função `promote`.
  const {
    promote: promoteObservations,
    promoting: promotingObservations,
  } = useOpponentObservations({
    opponentId: game?.opponent_id ?? null,
    autoLoad: false,
  });

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

  const {
    playerRatings,
    setPlayerRatings,
    mvpPlayerId,
    setMvpPlayerId,
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
    finalizing,
    exportingPDF,
    allRatingsFilled,
    finalizeGame,
    handleExportPDF,
  } = useLiveFinalize({
    id,
    router,
    game,
    setGame,
    phase,
    setPhase,
    currentMinute,
    pauseClock,
    events,
    convocatedPlayers,
    score,
    displayEvents,
    starterIds,
    concededGoalsByPlayer,
    playersWhoNeedPersistentStats,
  });

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

    // Observações sobre o adversário (PR B1)
    observations,
    savingObservation,
    observationModalOpen,
    openObservationModal,
    closeObservationModal,
    createObservation,
    deleteObservation,

    // Promoção (PR B2)
    promoteObservations,
    promotingObservations,

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