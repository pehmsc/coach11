"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { GameOpponentObservation } from "@/types/database";

interface UseLiveObservationsArgs {
  gameId: string;
  /** True quando `game.opponent_id` está definido. */
  hasOpponent: boolean;
}

export interface UseLiveObservationsReturn {
  observations: GameOpponentObservation[];
  loadingObservations: boolean;
  savingObservation: boolean;
  observationModalOpen: boolean;
  openObservationModal: () => void;
  closeObservationModal: () => void;
  createObservation: (text: string, minute: number | null) => Promise<void>;
  deleteObservation: (obsId: string) => Promise<void>;
}

export function useLiveObservations({
  gameId,
  hasOpponent,
}: UseLiveObservationsArgs): UseLiveObservationsReturn {
  const [observations, setObservations] = useState<GameOpponentObservation[]>([]);
  const [loadingObservations, setLoadingObservations] = useState(false);
  const [savingObservation, setSavingObservation] = useState(false);
  const [observationModalOpen, setObservationModalOpen] = useState(false);

  // Ref para snapshot estável em rollback de optimistic delete — evita
  // captura do valor pós-update em ambientes React StrictMode.
  const observationsRef = useRef<GameOpponentObservation[]>([]);
  useEffect(() => {
    observationsRef.current = observations;
  }, [observations]);

  const loadObservations = useCallback(async () => {
    if (!gameId) return;
    setLoadingObservations(true);
    try {
      const res = await fetch(`/api/games/${gameId}/observations`, {
        cache: "no-store",
      });
      const payload = await res.json().catch(() => null);
      if (res.ok && Array.isArray((payload as { observations?: unknown })?.observations)) {
        setObservations(
          (payload as { observations: GameOpponentObservation[] }).observations,
        );
      }
    } catch {
      // Silent — listagem volta a tentar no próximo trigger.
    } finally {
      setLoadingObservations(false);
    }
  }, [gameId]);

  useEffect(() => {
    void loadObservations();
  }, [loadObservations]);

  const openObservationModal = useCallback(() => {
    if (!hasOpponent) {
      toast.error("Este jogo não tem adversário associado.");
      return;
    }
    setObservationModalOpen(true);
  }, [hasOpponent]);

  const closeObservationModal = useCallback(() => {
    setObservationModalOpen(false);
  }, []);

  const createObservation = useCallback(
    async (text: string, minute: number | null) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setSavingObservation(true);
      try {
        const res = await fetch(`/api/games/${gameId}/observations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ observation: trimmed, minute }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(
            (payload as { error?: string } | null)?.error ??
              "Erro ao guardar observação.",
          );
          return;
        }
        const inserted = (payload as { observation?: GameOpponentObservation } | null)
          ?.observation;
        if (inserted) {
          setObservations((prev) => [...prev, inserted]);
        }
        toast.success("Observação guardada.");
        setObservationModalOpen(false);
      } catch {
        toast.error("Erro de ligação ao guardar observação.");
      } finally {
        setSavingObservation(false);
      }
    },
    [gameId],
  );

  const deleteObservation = useCallback(
    async (obsId: string) => {
      const snapshot = observationsRef.current;
      setObservations(snapshot.filter((o) => o.id !== obsId));
      try {
        const res = await fetch(`/api/games/${gameId}/observations/${obsId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          setObservations(snapshot);
          toast.error("Erro ao apagar observação.");
        }
      } catch {
        setObservations(snapshot);
        toast.error("Erro de ligação ao apagar observação.");
      }
    },
    [gameId],
  );

  return {
    observations,
    loadingObservations,
    savingObservation,
    observationModalOpen,
    openObservationModal,
    closeObservationModal,
    createObservation,
    deleteObservation,
  };
}
