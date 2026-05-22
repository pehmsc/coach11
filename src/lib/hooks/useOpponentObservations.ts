"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { GameOpponentObservation } from "@/types/database";
import type { PromoteTargetField } from "@/lib/schemas/observations";

interface UseOpponentObservationsArgs {
  opponentId: string | null | undefined;
  /** Filtra `promoted_to_opponent_at IS NULL` no GET. Default true. */
  onlyUnpromoted?: boolean;
  /** Quando false, não carrega automaticamente — útil para componentes que só
   *  querem a função `promote` (ex: orchestrator do review). Default true. */
  autoLoad?: boolean;
}

export interface UseOpponentObservationsReturn {
  observations: GameOpponentObservation[];
  loading: boolean;
  promoting: boolean;
  reload: () => Promise<void>;
  promote: (
    observationIds: string[],
    targetField: PromoteTargetField,
  ) => Promise<boolean>;
}

export function useOpponentObservations({
  opponentId,
  onlyUnpromoted = true,
  autoLoad = true,
}: UseOpponentObservationsArgs): UseOpponentObservationsReturn {
  const [observations, setObservations] = useState<GameOpponentObservation[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const reload = useCallback(async () => {
    if (!opponentId) return;
    setLoading(true);
    try {
      const qs = onlyUnpromoted ? "?promoted=false" : "";
      const res = await fetch(`/api/opponents/${opponentId}/observations${qs}`, {
        cache: "no-store",
      });
      const payload = await res.json().catch(() => null);
      if (res.ok && Array.isArray((payload as { observations?: unknown })?.observations)) {
        setObservations(
          (payload as { observations: GameOpponentObservation[] }).observations,
        );
      }
    } finally {
      setLoading(false);
    }
  }, [opponentId, onlyUnpromoted]);

  useEffect(() => {
    if (!autoLoad) return;
    void reload();
  }, [autoLoad, reload]);

  const promote = useCallback(
    async (
      observationIds: string[],
      targetField: PromoteTargetField,
    ): Promise<boolean> => {
      if (!opponentId) {
        toast.error("Sem adversário associado.");
        return false;
      }
      if (observationIds.length === 0) return false;
      setPromoting(true);
      try {
        const res = await fetch(
          `/api/opponents/${opponentId}/promote-observations`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ observationIds, targetField }),
          },
        );
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          toast.error(
            (payload as { error?: string } | null)?.error ??
              "Erro ao promover observações.",
          );
          return false;
        }
        toast.success("Observações promovidas para o perfil do adversário.");
        if (autoLoad) {
          await reload();
        }
        return true;
      } catch {
        toast.error("Erro de ligação ao promover observações.");
        return false;
      } finally {
        setPromoting(false);
      }
    },
    [opponentId, autoLoad, reload],
  );

  return { observations, loading, promoting, reload, promote };
}
