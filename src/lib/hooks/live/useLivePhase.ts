"use client";

import { useState, useEffect, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { getLiveKickoffState } from "@/lib/games/live-kickoff";
import type { LivePlayer, MatchPhase } from "@/components/games/live/types";

interface UseLivePhaseArgs {
  gameId: string;
  /**
   * Lazy getter para o estado mais recente de `playersOnField` no
   * momento do click em "Iniciar 1ª parte". Necessário porque
   * `playersOnField` vem do `useLiveDerivedState` que é chamado
   * DEPOIS deste sub-hook (recebe `phase` como input).
   */
  getPlayersOnField: () => LivePlayer[];
  /** Do useLiveLineup */
  persistInitialLineupSnapshot: (starterIds: string[]) => Promise<void>;
  setInitialStarterIds: (ids: string[]) => void;
  /** Do useLiveClock */
  startClock: () => void;
}

export interface UseLivePhaseReturn {
  phase: MatchPhase;
  setPhase: Dispatch<SetStateAction<MatchPhase>>;
  startingFirstHalf: boolean;
  kickoffError: string | null;
  setKickoffError: Dispatch<SetStateAction<string | null>>;
  clearKickoffError: () => void;
  handleStartFirstHalf: () => Promise<void>;
}

export function useLivePhase({
  gameId,
  getPlayersOnField,
  persistInitialLineupSnapshot,
  setInitialStarterIds,
  startClock,
}: UseLivePhaseArgs): UseLivePhaseReturn {
  const [phase, setPhase] = useState<MatchPhase>("pre_match");
  const [startingFirstHalf, setStartingFirstHalf] = useState(false);
  const [kickoffError, setKickoffError] = useState<string | null>(null);

  // Limpa kickoffError quando phase deixa de ser pre_match.
  useEffect(() => {
    if (phase !== "pre_match" && kickoffError) {
      setKickoffError(null);
    }
  }, [phase, kickoffError]);

  const clearKickoffError = useCallback(() => {
    setKickoffError(null);
  }, []);

  const handleStartFirstHalf = useCallback(async () => {
    const playersOnField = getPlayersOnField();
    const kickoffState = getLiveKickoffState({ starters: playersOnField });
    const starterPlayerIds = playersOnField.map((player) => player.id);

    if (!kickoffState.canStart) {
      setKickoffError(kickoffState.reason);
      toast.error(kickoffState.reason);
      return;
    }

    setStartingFirstHalf(true);
    setKickoffError(null);
    try {
      await persistInitialLineupSnapshot(starterPlayerIds);
      setInitialStarterIds(starterPlayerIds);
      setPhase("first_half");
      startClock();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao guardar titulares iniciais.";
      console.error("[live.kickoff] failed to persist starters", {
        gameId,
        starterCount: starterPlayerIds.length,
        error,
      });
      setKickoffError(message);
      toast.error(`Erro ao iniciar jogo: ${message}`);
    } finally {
      setStartingFirstHalf(false);
    }
  }, [
    gameId,
    getPlayersOnField,
    persistInitialLineupSnapshot,
    setInitialStarterIds,
    startClock,
  ]);

  return {
    phase,
    setPhase,
    startingFirstHalf,
    kickoffError,
    setKickoffError,
    clearKickoffError,
    handleStartFirstHalf,
  };
}
