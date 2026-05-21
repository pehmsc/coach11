"use client";

import { useState, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import {
  affectedPlayerKeysFromEvent,
  computeIsOnFieldAfterAllEvents,
  playerKeyFromEvent,
} from "@/lib/games/compute-on-field-at-event";
import type { GameEvent } from "@/types/database";
import type {
  LivePlayer,
  LiveStatus,
  LiveEventInput,
} from "@/components/games/live/types";

interface UseLiveEventsArgs {
  id: string;
  convocatedPlayers: LivePlayer[];
  initialStarterIds: string[];
  setConvocatedPlayers: Dispatch<SetStateAction<LivePlayer[]>>;
  saveLivePlayerStatus: (
    playerId: string,
    status: LiveStatus,
    options?: { startMinute?: number | null; endMinute?: number | null },
  ) => Promise<void>;
}

export interface UseLiveEventsReturn {
  events: GameEvent[];
  setEvents: Dispatch<SetStateAction<GameEvent[]>>;
  cascadeDeleteIds: string[] | null;
  loadEventsFromBackend: () => Promise<GameEvent[]>;
  insertEventsToBackend: (input: LiveEventInput[]) => Promise<GameEvent[]>;
  deleteEventsFromBackend: (ids: string[]) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  confirmCascadeDelete: () => Promise<void>;
  cancelCascadeDelete: () => void;
}

export function useLiveEvents({
  id,
  convocatedPlayers,
  initialStarterIds,
  setConvocatedPlayers,
  saveLivePlayerStatus,
}: UseLiveEventsArgs): UseLiveEventsReturn {
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [cascadeDeleteIds, setCascadeDeleteIds] = useState<string[] | null>(null);

  const loadEventsFromBackend = useCallback(async () => {
    const res = await fetch(`/api/games/${id}/live/events`, { cache: "no-store" });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(payload?.events)) {
      throw new Error("live_events_load_failed");
    }
    return payload.events as GameEvent[];
  }, [id]);

  const insertEventsToBackend = useCallback(
    async (eventsToInsert: LiveEventInput[]) => {
      const res = await fetch(`/api/games/${id}/live/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: eventsToInsert }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(payload?.events)) {
        throw new Error(
          (payload as { error?: string } | null)?.error || "live_events_insert_failed",
        );
      }
      return payload.events as GameEvent[];
    },
    [id],
  );

  const deleteEventsFromBackend = useCallback(
    async (eventIds: string[]) => {
      const res = await fetch(`/api/games/${id}/live/events`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventIds }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(
          (payload as { error?: string } | null)?.error || "live_events_delete_failed",
        );
      }
    },
    [id],
  );

  const performDelete = useCallback(
    async (idsToDelete: Set<string>) => {
      try {
        await deleteEventsFromBackend(Array.from(idsToDelete));
      } catch {
        toast.error("Erro ao apagar evento.");
        return;
      }

      const remainingEvents = events.filter(
        (event) => !idsToDelete.has(event.id),
      );
      setEvents(remainingEvents);

      // Reconstruir isOnField apenas para jogadores tocados pelos eventos
      // apagados. sentOffPlayerIds é useMemo derivado de events; auto-actualiza.
      const deletedEvents = events.filter((event) => idsToDelete.has(event.id));
      const affectedKeys = new Set<string>();
      deletedEvents.forEach((event) => {
        affectedPlayerKeysFromEvent(event).forEach((key) =>
          affectedKeys.add(key),
        );
      });

      if (affectedKeys.size === 0) return;

      const starterKeys =
        initialStarterIds.length > 0
          ? initialStarterIds
          : convocatedPlayers.filter((p) => p.isOnField).map((p) => p.id);

      const newIsOnFieldByPlayer = new Map<string, boolean>();
      affectedKeys.forEach((key) => {
        newIsOnFieldByPlayer.set(
          key,
          computeIsOnFieldAfterAllEvents(key, remainingEvents, starterKeys),
        );
      });

      const playersToSyncToServer: Array<{
        id: string;
        newIsOnField: boolean;
        previousIsOnField: boolean;
      }> = [];

      setConvocatedPlayers((prev) =>
        prev.map((player) => {
          if (!newIsOnFieldByPlayer.has(player.id)) return player;
          const newIsOnField = newIsOnFieldByPlayer.get(player.id) ?? false;
          if (player.isOnField === newIsOnField) return player;
          playersToSyncToServer.push({
            id: player.id,
            newIsOnField,
            previousIsOnField: player.isOnField,
          });
          return { ...player, isOnField: newIsOnField };
        }),
      );

      // Sincronizar com servidor (game_stats_live ou external_player_convocations)
      // para que recarregar a página reflicta o estado correcto. Falhas não
      // bloqueiam — refresh corrige; events já foram apagados.
      //
      // `endMinute: null` quando jogador vai para banco — ao apagar um evento
      // de substituição, o jogador "nunca saiu" do ponto de vista da nova
      // timeline. Escrever `currentMinute` aqui era semanticamente errado e,
      // se o relógio estivesse num estado anómalo (ex: tab fechada com
      // `runningSinceMs` antigo), gravava valores absurdos em
      // `game_stats_live.end_minute` (vistos 1408, 2011 no smoke test do Z4).
      for (const change of playersToSyncToServer) {
        try {
          await saveLivePlayerStatus(
            change.id,
            change.newIsOnField ? "on_field" : "substitute",
            {
              startMinute: change.newIsOnField ? 0 : null,
              endMinute: null,
            },
          );
        } catch (error) {
          console.error(
            "[deleteEvent] failed to sync player status after undo",
            { playerId: change.id, error },
          );
        }
      }
    },
    [
      events,
      convocatedPlayers,
      initialStarterIds,
      deleteEventsFromBackend,
      setConvocatedPlayers,
      saveLivePlayerStatus,
    ],
  );

  const collectPairedSubstitutionIds = useCallback(
    (eventToDelete: GameEvent, allEvents: GameEvent[]): Set<string> => {
      const ids = new Set<string>([eventToDelete.id]);
      if (eventToDelete.event_type === "substitution_out") {
        const pair = allEvents.find(
          (event) =>
            event.event_type === "substitution_in" &&
            event.minute === eventToDelete.minute &&
            event.player_id === eventToDelete.related_player_id &&
            event.related_player_id === eventToDelete.player_id,
        );
        if (pair?.id) ids.add(pair.id);
      }
      if (eventToDelete.event_type === "substitution_in") {
        const pair = allEvents.find(
          (event) =>
            event.event_type === "substitution_out" &&
            event.minute === eventToDelete.minute &&
            event.player_id === eventToDelete.related_player_id &&
            event.related_player_id === eventToDelete.player_id,
        );
        if (pair?.id) ids.add(pair.id);
      }
      return ids;
    },
    [],
  );

  /**
   * Detecta se apagar este yellow obrigaria a cascata (apaga também o 2º
   * yellow + red_card auto subsequente). Retorna IDs em ordem cronológica
   * inversa (mais recentes primeiro) para apagar em batch.
   */
  const collectYellowCascadeIds = useCallback(
    (eventToDelete: GameEvent, allEvents: GameEvent[]): string[] | null => {
      if (eventToDelete.event_type !== "yellow_card") return null;
      if (eventToDelete.is_opponent_event) return null;
      const playerKey = playerKeyFromEvent(eventToDelete);
      if (!playerKey) return null;

      const samePlayerYellows = allEvents
        .filter(
          (event) =>
            event.event_type === "yellow_card" &&
            !event.is_opponent_event &&
            playerKeyFromEvent(event) === playerKey,
        )
        .sort((a, b) => {
          const minuteCmp = (a.minute ?? 0) - (b.minute ?? 0);
          if (minuteCmp !== 0) return minuteCmp;
          return (a.created_at || "").localeCompare(b.created_at || "");
        });

      // Só dispara cascata quando o yellow a apagar é o 1º cronológico E
      // existem 2 yellows e um red para o mesmo jogador.
      if (samePlayerYellows.length < 2) return null;
      if (samePlayerYellows[0].id !== eventToDelete.id) return null;

      const samePlayerReds = allEvents.filter(
        (event) =>
          event.event_type === "red_card" &&
          !event.is_opponent_event &&
          playerKeyFromEvent(event) === playerKey,
      );
      if (samePlayerReds.length === 0) return null;

      return [
        ...samePlayerReds.map((event) => event.id),
        samePlayerYellows[1].id,
        eventToDelete.id,
      ];
    },
    [],
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      const eventToDelete = events.find((event) => event.id === eventId);
      if (!eventToDelete) return;

      const cascadeIds = collectYellowCascadeIds(eventToDelete, events);
      if (cascadeIds) {
        // Não apaga já — pede confirmação. UI consome cascadeDeleteIds.
        setCascadeDeleteIds(cascadeIds);
        return;
      }

      const idsToDelete = collectPairedSubstitutionIds(eventToDelete, events);
      await performDelete(idsToDelete);
    },
    [events, collectYellowCascadeIds, collectPairedSubstitutionIds, performDelete],
  );

  const confirmCascadeDelete = useCallback(async () => {
    if (!cascadeDeleteIds) return;
    const ids = new Set(cascadeDeleteIds);
    setCascadeDeleteIds(null);
    await performDelete(ids);
  }, [cascadeDeleteIds, performDelete]);

  const cancelCascadeDelete = useCallback(() => {
    setCascadeDeleteIds(null);
  }, []);

  return {
    events,
    setEvents,
    cascadeDeleteIds,
    loadEventsFromBackend,
    insertEventsToBackend,
    deleteEventsFromBackend,
    deleteEvent,
    confirmCascadeDelete,
    cancelCascadeDelete,
  };
}
