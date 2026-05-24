"use client";

import { useState, useEffect, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import {
  clampToValidMatchMinute,
  mergeEvents,
} from "@/components/games/live/utils";
import { EVENT_LABELS } from "@/components/games/live/types";
import type {
  LivePlayer,
  LiveStatus,
  LiveEventInput,
  ModalType,
  PlayerAvailability,
} from "@/components/games/live/types";
import type { GameEvent, GameEventType } from "@/types/database";

interface UseLiveEventModalArgs {
  canRegisterEvents: boolean;
  canRegisterSubstitutionOrCard: boolean;

  currentMinute: number;

  events: GameEvent[];
  setEvents: Dispatch<SetStateAction<GameEvent[]>>;
  insertEventsToBackend: (input: LiveEventInput[]) => Promise<GameEvent[]>;

  convocatedPlayers: LivePlayer[];
  setConvocatedPlayers: Dispatch<SetStateAction<LivePlayer[]>>;
  saveLivePlayerStatus: (
    playerId: string,
    status: LiveStatus,
    options?: { startMinute?: number | null; endMinute?: number | null },
  ) => Promise<void>;
  syncConvocatedPlayersFromBackend: () => Promise<void>;

  getPlayerAvailability: (
    playerId: string | null | undefined,
  ) => PlayerAvailability;
}

export interface UseLiveEventModalReturn {
  modalType: ModalType | null;
  goalTeamSide: "ours" | "opponent" | null;
  goalKind: "goal" | "own_goal" | null;
  goalStep: "scorer" | "assist";
  selectedScorerID: string | null;
  selectedAssistID: string | null;
  selectedSubOutId: string | null;
  selectedSubInId: string | null;
  savingEvent: boolean;
  setGoalTeamSide: Dispatch<SetStateAction<"ours" | "opponent" | null>>;
  setGoalKind: Dispatch<SetStateAction<"goal" | "own_goal" | null>>;
  setGoalStep: Dispatch<SetStateAction<"scorer" | "assist">>;
  setSelectedScorerID: Dispatch<SetStateAction<string | null>>;
  setSelectedAssistID: Dispatch<SetStateAction<string | null>>;
  setSelectedSubOutId: Dispatch<SetStateAction<string | null>>;
  setSelectedSubInId: Dispatch<SetStateAction<string | null>>;
  openModal: (type: ModalType) => void;
  closeModal: () => void;
  confirmGoal: () => Promise<void>;
  confirmCard: (eventType: "yellow_card" | "red_card") => Promise<void>;
  confirmSubstitution: () => Promise<void>;
}

export function useLiveEventModal({
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
}: UseLiveEventModalArgs): UseLiveEventModalReturn {
  const [modalType, setModalType] = useState<ModalType | null>(null);
  const [goalTeamSide, setGoalTeamSide] = useState<"ours" | "opponent" | null>(
    null,
  );
  const [goalKind, setGoalKind] = useState<"goal" | "own_goal" | null>(null);
  const [goalStep, setGoalStep] = useState<"scorer" | "assist">("scorer");
  const [selectedScorerID, setSelectedScorerID] = useState<string | null>(null);
  const [selectedAssistID, setSelectedAssistID] = useState<string | null>(null);
  const [selectedSubOutId, setSelectedSubOutId] = useState<string | null>(null);
  const [selectedSubInId, setSelectedSubInId] = useState<string | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);

  const openModal = useCallback(
    (type: ModalType) => {
      const allowedInHalftime =
        type === "substitution" ||
        type === "yellow_card" ||
        type === "red_card";
      const allowed = allowedInHalftime
        ? canRegisterSubstitutionOrCard
        : canRegisterEvents;
      if (!allowed) {
        toast.error("Inicia a 1ª ou 2ª parte para registar eventos.");
        return;
      }
      setModalType(type);
      setGoalTeamSide(null);
      setGoalKind(null);
      setGoalStep("scorer");
      setSelectedScorerID(null);
      setSelectedAssistID(null);
      setSelectedSubOutId(null);
      setSelectedSubInId(null);
    },
    [canRegisterEvents, canRegisterSubstitutionOrCard],
  );

  const closeModal = useCallback(() => {
    setModalType(null);
    setGoalTeamSide(null);
    setGoalKind(null);
    setGoalStep("scorer");
    setSelectedScorerID(null);
    setSelectedAssistID(null);
    setSelectedSubOutId(null);
    setSelectedSubInId(null);
  }, []);

  // Limpa selections quando availability muda (ex: jogador expulso entre
  // seleccionar e confirmar). setState sincrono e intencional: o proximo
  // render reflecte a selecao desfeita.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!modalType) return;

    if (selectedScorerID && !getPlayerAvailability(selectedScorerID).selectable) {
      setSelectedScorerID(null);
    }
    if (selectedAssistID && !getPlayerAvailability(selectedAssistID).selectable) {
      setSelectedAssistID(null);
    }
    if (selectedSubOutId) {
      const availability = getPlayerAvailability(selectedSubOutId);
      if (!availability.selectable || availability.label !== "Em campo") {
        setSelectedSubOutId(null);
      }
    }
    if (selectedSubInId) {
      const availability = getPlayerAvailability(selectedSubInId);
      if (!availability.selectable || availability.label !== "Banco") {
        setSelectedSubInId(null);
      }
    }
  }, [
    modalType,
    selectedScorerID,
    selectedAssistID,
    selectedSubOutId,
    selectedSubInId,
    getPlayerAvailability,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const applySendOff = useCallback(
    async (playerId: string) => {
      const player = convocatedPlayers.find((item) => item.id === playerId);
      if (!player) return;

      setConvocatedPlayers((prev) =>
        prev.map((item) =>
          item.id === playerId ? { ...item, isOnField: false } : item,
        ),
      );

      try {
        await saveLivePlayerStatus(playerId, "substitute", {
          endMinute: player.isOnField
            ? clampToValidMatchMinute(currentMinute)
            : null,
        });
      } catch {
        // non-blocking: event is already stored
      }
    },
    [convocatedPlayers, currentMinute, saveLivePlayerStatus, setConvocatedPlayers],
  );

  const confirmGoal = useCallback(async () => {
    const isPenalty = modalType === "penalty_goal";
    if (modalType !== "goal" && !isPenalty) return;
    if (!goalTeamSide) {
      toast.error("Seleciona o lado.");
      return;
    }
    if (!isPenalty && !goalKind) {
      toast.error("Seleciona o tipo de golo.");
      return;
    }

    const eventType: GameEventType = isPenalty
      ? "penalty_goal"
      : (goalKind as GameEventType);
    const isOpponentEvent = isPenalty
      ? goalTeamSide === "opponent"
      : goalKind === "own_goal"
        ? goalTeamSide === "ours"
        : goalTeamSide === "opponent";
    let playerId: string | null = null;
    let relatedPlayerId: string | null = null;

    if (isPenalty && goalTeamSide === "ours") {
      if (!selectedScorerID) {
        toast.error("Seleciona o marcador do penálti.");
        return;
      }
      playerId = selectedScorerID;
      relatedPlayerId = null;
    } else if (isPenalty && goalTeamSide === "opponent") {
      // Penálti do adversário — jogador nosso opcional (tipicamente GR).
      playerId = selectedScorerID || null;
      relatedPlayerId = null;
    } else if (goalTeamSide === "ours" && goalKind === "goal") {
      if (!selectedScorerID) {
        toast.error("Seleciona o marcador.");
        return;
      }
      playerId = selectedScorerID;
      relatedPlayerId = selectedAssistID || null;
    } else if (goalTeamSide === "ours" && goalKind === "own_goal") {
      // Autogolo a nosso favor (do adversário): sem player adversário obrigatório.
      playerId = null;
      relatedPlayerId = null;
    } else if (goalTeamSide === "opponent" && goalKind === "goal") {
      // Opcional: jogador nosso associado (tipicamente GR).
      playerId = selectedScorerID || null;
      relatedPlayerId = null;
    } else if (goalTeamSide === "opponent" && goalKind === "own_goal") {
      if (!selectedScorerID) {
        toast.error("Seleciona o jogador que marcou autogolo.");
        return;
      }
      playerId = selectedScorerID;
      relatedPlayerId = null;
    }

    if (!eventType) {
      toast.error("Tipo de golo inválido.");
      return;
    }

    if (playerId && !getPlayerAvailability(playerId).selectable) {
      toast.error("Jogador expulso não pode ser selecionado.");
      return;
    }
    if (relatedPlayerId && !getPlayerAvailability(relatedPlayerId).selectable) {
      toast.error("Jogador expulso não pode ser selecionado.");
      return;
    }

    setSavingEvent(true);
    try {
      const inserted = await insertEventsToBackend([
        {
          event_type: eventType,
          player_id: playerId,
          related_player_id: relatedPlayerId,
          minute: currentMinute,
          is_opponent_event: isOpponentEvent,
        },
      ]);
      setEvents((prev) => mergeEvents(prev, inserted));
      toast.success(`${EVENT_LABELS[eventType] ?? eventType} — min. ${currentMinute}`);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message !== "live_events_insert_failed"
          ? error.message
          : "Erro ao registar golo.",
      );
    }
    setSavingEvent(false);
    closeModal();
  }, [
    modalType,
    goalTeamSide,
    goalKind,
    selectedScorerID,
    selectedAssistID,
    currentMinute,
    insertEventsToBackend,
    setEvents,
    getPlayerAvailability,
    closeModal,
  ]);

  const confirmCard = useCallback(
    async (eventType: "yellow_card" | "red_card") => {
      if (!selectedScorerID) {
        toast.error("Seleciona um jogador.");
        return;
      }
      if (!getPlayerAvailability(selectedScorerID).selectable) {
        toast.error("Jogador expulso não pode ser selecionado.");
        return;
      }
      setSavingEvent(true);
      try {
        const payload: LiveEventInput[] = [
          {
            event_type: eventType,
            player_id: selectedScorerID,
            minute: currentMinute,
            is_opponent_event: false,
          },
        ];

        if (eventType === "yellow_card") {
          const yellowCountBefore = events.filter(
            (event) =>
              !event.is_opponent_event &&
              event.event_type === "yellow_card" &&
              event.player_id === selectedScorerID,
          ).length;
          const alreadyRed = events.some(
            (event) =>
              !event.is_opponent_event &&
              event.event_type === "red_card" &&
              event.player_id === selectedScorerID,
          );
          if (!alreadyRed && yellowCountBefore + 1 >= 2) {
            payload.push({
              event_type: "red_card",
              player_id: selectedScorerID,
              minute: currentMinute,
              is_opponent_event: false,
            });
          }
        }

        const inserted = await insertEventsToBackend(payload);
        setEvents((prev) => mergeEvents(prev, inserted));
        toast.success(`${EVENT_LABELS[eventType]} — min. ${currentMinute}`);

        const hasRed = inserted.some((event) => event.event_type === "red_card");
        if (eventType === "red_card" || hasRed) {
          await applySendOff(selectedScorerID);
          if (eventType === "yellow_card" && hasRed) {
            toast.info("2º amarelo: vermelho automático aplicado.");
          }
        }
      } catch (error) {
        toast.error(
          error instanceof Error && error.message !== "live_events_insert_failed"
            ? error.message
            : "Erro ao registar cartão.",
        );
      }
      setSavingEvent(false);
      closeModal();
    },
    [
      selectedScorerID,
      currentMinute,
      events,
      insertEventsToBackend,
      setEvents,
      getPlayerAvailability,
      applySendOff,
      closeModal,
    ],
  );

  const confirmSubstitution = useCallback(async () => {
    if (!selectedSubInId || !selectedSubOutId) return;

    const outAvailability = getPlayerAvailability(selectedSubOutId);
    if (!outAvailability.selectable || outAvailability.label !== "Em campo") {
      toast.error("Jogador de saída tem de estar em campo e elegível.");
      return;
    }

    const inAvailability = getPlayerAvailability(selectedSubInId);
    if (!inAvailability.selectable || inAvailability.label !== "Banco") {
      toast.error("Jogador de entrada tem de estar no banco e elegível.");
      return;
    }

    setSavingEvent(true);

    let insertedEvents: GameEvent[] = [];
    try {
      insertedEvents = await insertEventsToBackend([
        {
          event_type: "substitution_out",
          player_id: selectedSubOutId,
          related_player_id: selectedSubInId,
          minute: currentMinute,
          is_opponent_event: false,
        },
        {
          event_type: "substitution_in",
          player_id: selectedSubInId,
          related_player_id: selectedSubOutId,
          minute: currentMinute,
          is_opponent_event: false,
        },
      ]);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message !== "live_events_insert_failed"
          ? error.message
          : "Erro ao registar substituição.",
      );
      setSavingEvent(false);
      return;
    }

    try {
      // Update live stats (current status only — minutes calc uses events).
      // Clamp defensivo: se o relógio estiver corrompido (ex: tab fechada
      // com `runningSinceMs` antigo), grava `null` em vez de valor absurdo.
      const clampedCurrentMinute = clampToValidMatchMinute(currentMinute);
      await saveLivePlayerStatus(selectedSubOutId, "substitute", {
        endMinute: clampedCurrentMinute,
      });
      await saveLivePlayerStatus(selectedSubInId, "on_field", {
        startMinute: clampedCurrentMinute,
        endMinute: null,
      });
    } catch {
      toast.error("Erro ao atualizar estado dos jogadores.");
      setSavingEvent(false);
      return;
    }

    setConvocatedPlayers((prev) =>
      prev.map((p) => {
        if (p.id === selectedSubOutId) return { ...p, isOnField: false };
        if (p.id === selectedSubInId) return { ...p, isOnField: true };
        return p;
      }),
    );

    if (insertedEvents.length > 0) {
      setEvents((prev) => mergeEvents(prev, insertedEvents));
    }

    toast.success(`Substituição — min. ${currentMinute}`);
    setSavingEvent(false);
    closeModal();
    void syncConvocatedPlayersFromBackend().catch(() => null);
  }, [
    selectedSubInId,
    selectedSubOutId,
    currentMinute,
    insertEventsToBackend,
    setEvents,
    saveLivePlayerStatus,
    setConvocatedPlayers,
    syncConvocatedPlayersFromBackend,
    getPlayerAvailability,
    closeModal,
  ]);

  return {
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
  };
}
