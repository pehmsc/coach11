"use client";

import { useState, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { normalizeLiveStatus } from "@/components/games/live/utils";
import type {
  LivePlayer,
  LiveStatus,
  MatchPhase,
} from "@/components/games/live/types";
import type { Player } from "@/types/database";

interface UseLiveLineupArgs {
  id: string;
  phase: MatchPhase;
  onLineupChange?: () => void;
}

export interface UseLiveLineupReturn {
  convocatedPlayers: LivePlayer[];
  setConvocatedPlayers: Dispatch<SetStateAction<LivePlayer[]>>;
  initialStarterIds: string[];
  setInitialStarterIds: Dispatch<SetStateAction<string[]>>;
  savingLineup: string | null;
  saveLivePlayerStatus: (
    playerId: string,
    status: LiveStatus,
    options?: { startMinute?: number | null; endMinute?: number | null },
  ) => Promise<void>;
  syncConvocatedPlayersFromBackend: () => Promise<void>;
  persistInitialLineupSnapshot: (starterPlayerIds: string[]) => Promise<void>;
  toggleLineup: (playerId: string) => Promise<void>;
}

export function useLiveLineup({
  id,
  phase,
  onLineupChange,
}: UseLiveLineupArgs): UseLiveLineupReturn {
  const [convocatedPlayers, setConvocatedPlayers] = useState<LivePlayer[]>([]);
  const [initialStarterIds, setInitialStarterIds] = useState<string[]>([]);
  const [savingLineup, setSavingLineup] = useState<string | null>(null);

  const saveLivePlayerStatus = useCallback(
    async (
      playerId: string,
      status: LiveStatus,
      options?: { startMinute?: number | null; endMinute?: number | null },
    ) => {
      const player = convocatedPlayers.find((entry) => entry.id === playerId);
      if (player?.isExternal) {
        // Modelo unificado (PR #134): externos não têm coluna
        // `lineup_status` persistida durante o live. Os events
        // (substitution_in/out) em game_events são fonte de verdade.
        // Hidratação após refresh deriva o "em campo agora" dos events.
        return;
      }

      const updatePayload: {
        playerId: string;
        status: LiveStatus;
        startMinute?: number | null;
        endMinute?: number | null;
      } = {
        playerId,
        status,
      };

      if (options && "startMinute" in options) {
        updatePayload.startMinute = options.startMinute ?? null;
      }
      if (options && "endMinute" in options) {
        updatePayload.endMinute = options.endMinute ?? null;
      }

      const res = await fetch(`/api/games/${id}/live/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [updatePayload] }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          (payload as { error?: string } | null)?.error || "live_player_status_save_failed",
        );
      }
    },
    [convocatedPlayers, id],
  );

  const syncConvocatedPlayersFromBackend = useCallback(async () => {
    const res = await fetch(`/api/games/${id}/convocation`, { cache: "no-store" });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(payload?.players)) {
      throw new Error("live_convocation_sync_failed");
    }

    const rawPlayers = payload.players as Array<
      Player & {
        isConvocated?: boolean;
        isExternal?: boolean;
        externalConvocationId?: string | null;
      }
    >;
    const convPlayers = rawPlayers
      .filter((player) => player?.isConvocated === true)
      .sort(
        (a, b) =>
          a.first_name.localeCompare(b.first_name, "pt", { sensitivity: "base" }) ||
          a.last_name.localeCompare(b.last_name, "pt", { sensitivity: "base" }),
      );

    const rawLineup =
      typeof payload?.lineupStatuses === "object" && payload.lineupStatuses
        ? (payload.lineupStatuses as Record<string, string>)
        : {};
    const starterIdsFromBackend = Array.isArray(payload?.starterIds)
      ? payload.starterIds.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const onFieldIds = new Set<string>();
    const benchIds = new Set<string>();
    for (const [playerId, status] of Object.entries(rawLineup)) {
      const normalized = normalizeLiveStatus(status);
      if (normalized === "on_field") onFieldIds.add(playerId);
      if (normalized === "substitute" || normalized === "substituted") benchIds.add(playerId);
    }

    setConvocatedPlayers(
      convPlayers.map((player) => ({
        ...player,
        isOnField: onFieldIds.has(player.id),
        isInitialBench: benchIds.has(player.id),
      })),
    );
    if (starterIdsFromBackend.length > 0) {
      setInitialStarterIds(starterIdsFromBackend);
    } else if (phase === "pre_match" || initialStarterIds.length === 0) {
      setInitialStarterIds(Array.from(onFieldIds));
    }
  }, [id, phase, initialStarterIds.length]);

  const persistInitialLineupSnapshot = useCallback(
    async (starterPlayerIds: string[]) => {
      const starterIdSet = new Set(starterPlayerIds);
      const internalPlayers = convocatedPlayers.filter(
        (player) => player.isExternal !== true,
      );
      const updates = internalPlayers.map((player) => {
        const isStarter = starterIdSet.has(player.id);
        return {
          playerId: player.id,
          status: isStarter ? ("on_field" as const) : ("substitute" as const),
          startMinute: isStarter ? 0 : null,
          endMinute: null,
        };
      });

      if (updates.length === 0) return;

      const res = await fetch(`/api/games/${id}/live/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          (payload as { error?: string } | null)?.error ||
            "live_lineup_snapshot_persist_failed",
        );
      }
    },
    [convocatedPlayers, id],
  );

  const toggleLineup = useCallback(
    async (playerId: string) => {
      const player = convocatedPlayers.find((p) => p.id === playerId);
      if (!player) return;

      const newIsOnField = !player.isOnField;
      const newStatus = newIsOnField ? "on_field" : "substitute";

      if (player.isExternal && !player.externalConvocationId) {
        toast.error("Jogador externo inválido para atualizar lineup.");
        return;
      }

      setSavingLineup(playerId);

      try {
        const endpoint = player.isExternal
          ? `/api/games/${id}/convocation/external/lineup`
          : `/api/games/${id}/convocation/lineup`;
        const body = player.isExternal
          ? {
              externalConvocationId: player.externalConvocationId,
              lineupStatus: newStatus,
            }
          : {
              playerId,
              lineupStatus: newStatus,
            };
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(
            (payload as { error?: string } | null)?.error || "lineup_save_failed",
          );
        }
        const nextPlayers = convocatedPlayers.map((p) =>
          p.id === playerId
            ? { ...p, isOnField: newIsOnField, isInitialBench: !newIsOnField }
            : p,
        );
        setConvocatedPlayers(nextPlayers);
        onLineupChange?.();
        if (phase === "pre_match") {
          setInitialStarterIds(
            nextPlayers
              .filter((playerItem) => playerItem.isOnField)
              .map((playerItem) => playerItem.id),
          );
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message !== "lineup_save_failed"
            ? error.message
            : "Erro ao guardar titular/banco.";
        toast.error(message);
      }
      setSavingLineup(null);
    },
    [convocatedPlayers, id, phase, onLineupChange],
  );

  return {
    convocatedPlayers,
    setConvocatedPlayers,
    initialStarterIds,
    setInitialStarterIds,
    savingLineup,
    saveLivePlayerStatus,
    syncConvocatedPlayersFromBackend,
    persistInitialLineupSnapshot,
    toggleLineup,
  };
}
