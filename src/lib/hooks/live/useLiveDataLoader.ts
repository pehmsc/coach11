"use client";

import { useState, useEffect, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import {
  GAME_EVENT_SELECT_COLUMNS,
  normalizeStoredGameEventRowsForClient,
} from "@/lib/games/live-event-participants";
import { hydrateIsOnFieldFromEvents } from "@/lib/games/hydrate-is-on-field";
import { toExternalLivePlayerId } from "@/lib/games/live-player-ids";
import {
  normalizeLiveStatus,
  isRunningPhase,
  parseMatchPhase,
  computeClockSecondsAt,
  loadPersistedClock,
  sanitizeHydratedClockState,
  isClockStateStale,
} from "@/components/games/live/utils";
import type { createClient } from "@/lib/supabase/client";
import type { Game, Player, GameEvent } from "@/types/database";
import type {
  LivePlayer,
  MatchPhase,
  ClockState,
  PersistedClockState,
  BackendCheckpointState,
} from "@/components/games/live/types";

type SupabaseClient = ReturnType<typeof createClient>;

interface UseLiveDataLoaderArgs {
  id: string;
  supabase: SupabaseClient;
  /** Do useRouter() do Next.js — apenas o método `replace` é necessário. */
  router: { replace: (url: string) => void };
  /** URL para onde redirecionar quando o jogo ja esta `completed` ao carregar. */
  summaryHref: string;

  // Callbacks do useLiveClock
  setClockHydrated: (hydrated: boolean) => void;
  setClockState: Dispatch<SetStateAction<ClockState>>;
  setNowMs: (now: number) => void;
  disableBackendCheckpoint: () => void;

  // Callbacks do useLiveLineup
  setConvocatedPlayers: Dispatch<SetStateAction<LivePlayer[]>>;
  setInitialStarterIds: (ids: string[]) => void;

  // Callbacks do useLiveEvents
  setEvents: Dispatch<SetStateAction<GameEvent[]>>;
  loadEventsFromBackend: () => Promise<GameEvent[]>;

  // Callbacks do useLivePhase
  setPhase: Dispatch<SetStateAction<MatchPhase>>;
  setKickoffError: Dispatch<SetStateAction<string | null>>;

  // Para useEffect de reconciliação
  events: GameEvent[];
  initialStarterIds: string[];
}

export interface UseLiveDataLoaderReturn {
  loading: boolean;
  game: Game | null;
  setGame: Dispatch<SetStateAction<Game | null>>;
  homeClubName: string | null;
  homeClubShortName: string | null;
  error: string | null;
  loadData: () => Promise<void>;
}

export function useLiveDataLoader({
  id,
  supabase,
  router,
  summaryHref,
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
}: UseLiveDataLoaderArgs): UseLiveDataLoaderReturn {
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [homeClubName, setHomeClubName] = useState<string | null>(null);
  const [homeClubShortName, setHomeClubShortName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setClockHydrated(false);
    setError(null);
    setKickoffError(null);

    const convRes = await fetch(`/api/games/${id}/convocation`, { cache: "no-store" });
    const convPayload = await convRes.json().catch(() => ({}));
    const gameData =
      convRes.ok && convPayload?.game ? (convPayload.game as Game) : null;

    if (!gameData) {
      setGame(null);
      setHomeClubName(null);
      setHomeClubShortName(null);
      setError(
        (convPayload as { error?: string } | null)?.error || "Jogo não encontrado.",
      );
      setLoading(false);
      return;
    }
    setGame(gameData);
    setHomeClubName(
      typeof convPayload?.homeClubName === "string" ? convPayload.homeClubName : null,
    );
    setHomeClubShortName(
      typeof convPayload?.homeClubShortName === "string"
        ? convPayload.homeClubShortName
        : null,
    );
    const gameStatus = (gameData as { status?: string }).status ?? null;
    if (gameStatus === "completed") {
      setPhase("completed");
      setClockState({ baseSeconds: 0, runningSinceMs: null });
      setClockHydrated(true);
      setLoading(false);
      return;
    }
    const now = Date.now();
    setNowMs(now);
    const convocationCheckpointRaw =
      convPayload && typeof convPayload === "object" && "liveCheckpoint" in convPayload
        ? (convPayload as { liveCheckpoint?: unknown }).liveCheckpoint
        : null;
    const convocationPersisted =
      convocationCheckpointRaw && typeof convocationCheckpointRaw === "object"
        ? (() => {
            const row = convocationCheckpointRaw as {
              phase?: unknown;
              baseSeconds?: unknown;
              runningSinceMs?: unknown;
              updatedAt?: unknown;
            };
            const parsedPhase = parseMatchPhase(row.phase);
            if (!parsedPhase) return null;
            if (typeof row.baseSeconds !== "number" || !Number.isFinite(row.baseSeconds)) {
              return null;
            }
            if (
              row.runningSinceMs !== null &&
              row.runningSinceMs !== undefined &&
              (typeof row.runningSinceMs !== "number" || !Number.isFinite(row.runningSinceMs))
            ) {
              return null;
            }
            const savedAtMs =
              typeof row.updatedAt === "string" && row.updatedAt
                ? new Date(row.updatedAt).getTime()
                : Date.now();
            return {
              version: 1 as const,
              phase: parsedPhase,
              baseSeconds: Math.max(0, Math.floor(row.baseSeconds)),
              runningSinceMs:
                typeof row.runningSinceMs === "number" ? Math.floor(row.runningSinceMs) : null,
              savedAt: Number.isFinite(savedAtMs) ? savedAtMs : Date.now(),
            } satisfies PersistedClockState;
          })()
        : null;
    const backendCheckpointPromise = fetch(`/api/games/${id}/live/checkpoint`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => null);
        if (payload?.missingTable === true) {
          disableBackendCheckpoint();
          return null;
        }
        if (!res.ok || !payload?.checkpoint) return null;
        const checkpoint = payload.checkpoint as Partial<BackendCheckpointState>;
        const parsedPhase = parseMatchPhase(checkpoint.phase);
        if (!parsedPhase) return null;
        if (typeof checkpoint.baseSeconds !== "number") return null;

        return {
          phase: parsedPhase,
          baseSeconds: Math.max(0, Math.floor(checkpoint.baseSeconds)),
          runningSinceMs:
            typeof checkpoint.runningSinceMs === "number" ? checkpoint.runningSinceMs : null,
          savedAt:
            typeof checkpoint.savedAt === "number" ? checkpoint.savedAt : Date.now(),
        } satisfies BackendCheckpointState;
      })
      .catch(() => null);

    // Players + lineup already come from convocation API (bypasses client-side RLS limitations)
    let enriched: LivePlayer[] = [];

    if (Array.isArray(convPayload?.players)) {
      const rawPlayers = convPayload.players as Array<
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
        typeof convPayload?.lineupStatuses === "object" && convPayload.lineupStatuses
          ? (convPayload.lineupStatuses as Record<string, string>)
          : {};
      const starterIdsFromBackend = Array.isArray(convPayload?.starterIds)
        ? convPayload.starterIds.filter((value: unknown): value is string => typeof value === "string")
        : [];

      const onFieldIds = new Set<string>();
      const benchIds = new Set<string>();

      for (const [playerId, status] of Object.entries(rawLineup)) {
        const normalized = normalizeLiveStatus(status);
        if (normalized === "on_field") onFieldIds.add(playerId);
        if (normalized === "substitute" || normalized === "substituted") {
          benchIds.add(playerId);
        }
      }

      enriched = convPlayers.map((player) => ({
        ...player,
        isOnField: onFieldIds.has(player.id),
        isInitialBench: benchIds.has(player.id),
      }));
      setInitialStarterIds(
        starterIdsFromBackend.length > 0 ? starterIdsFromBackend : Array.from(onFieldIds),
      );
    } else {
      // Fallback: direct queries (in case API returns error)
      const { data: convRows } = await supabase
        .from("convocations")
        .select("id, created_at")
        .eq("game_id", id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });

      let convPlayers: LivePlayer[] = [];
      const latestConvocationId = convRows?.[0]?.id ?? null;
      if (latestConvocationId) {
        const [{ data: cp }, { data: externalRows }] = await Promise.all([
          supabase
            .from("convocation_players")
            .select("player_id, players(*)")
            .eq("convocation_id", latestConvocationId),
          supabase
            .from("external_player_convocations")
            .select("id, name, jersey_number, position, lineup_status, created_at")
            .eq("game_id", id)
            .order("created_at", { ascending: true }),
        ]);

        const byPlayerId = new Map<string, LivePlayer>();
        (cp || []).forEach((row) => {
          const player = row.players as unknown as Player;
          if (!player?.id) return;
          byPlayerId.set(player.id, {
            ...player,
            isExternal: false,
            externalConvocationId: null,
            isOnField: false,
            isInitialBench: false,
          });
        });
        (externalRows || []).forEach((row) => {
          if (typeof row.id !== "string") return;
          const externalPlayerId = toExternalLivePlayerId(row.id);
          byPlayerId.set(externalPlayerId, {
            id: externalPlayerId,
            age_group_id: gameData.age_group_id ?? "",
            first_name: row.name || "Outro",
            last_name: "",
            jersey_number:
              typeof row.jersey_number === "number" ? row.jersey_number : undefined,
            preferred_position:
              typeof row.position === "string" ? row.position : undefined,
            status: "active",
            created_at:
              typeof row.created_at === "string"
                ? row.created_at
                : new Date().toISOString(),
            isExternal: true,
            externalConvocationId: row.id,
            isOnField: row.lineup_status === "on_field",
            isInitialBench: row.lineup_status !== "on_field",
          });
        });

        convPlayers = Array.from(byPlayerId.values()).sort(
          (a, b) =>
            a.first_name.localeCompare(b.first_name, "pt", { sensitivity: "base" }) ||
            a.last_name.localeCompare(b.last_name, "pt", { sensitivity: "base" }),
        );
      }

      const { data: liveStats } = await supabase
        .from("game_stats_live")
        .select("*")
        .eq("game_id", id);

      const normalizedStats = (liveStats || []).map((row) => ({
        player_id: row.player_id,
        status: normalizeLiveStatus(row.status),
        start_minute: row.start_minute,
      }));

      const onFieldIds = new Set<string>(
        normalizedStats
          .filter((s) => s.status === "on_field")
          .map((s) => s.player_id),
      );
      const benchIds = new Set<string>(
        normalizedStats
          .filter((s) => s.status === "substitute" || s.status === "substituted")
          .map((s) => s.player_id),
      );
      const starterIdsFromLive = new Set<string>(
        normalizedStats
          .filter((s) => s.start_minute === 0)
          .map((s) => s.player_id),
      );

      convPlayers.forEach((player) => {
        if (!player.isExternal || !player.externalConvocationId) return;
        if (player.isOnField) {
          onFieldIds.add(player.id);
          starterIdsFromLive.add(player.id);
          return;
        }
        benchIds.add(player.id);
      });

      enriched = convPlayers.map((player) => ({
        ...player,
        isOnField: onFieldIds.has(player.id),
        isInitialBench: benchIds.has(player.id),
      }));
      setInitialStarterIds(
        starterIdsFromLive.size > 0
          ? Array.from(starterIdsFromLive)
          : Array.from(onFieldIds),
      );
    }

    setConvocatedPlayers(enriched);

    // Fetch events (prefer backend API for consistent permissions)
    let orderedEvents: GameEvent[] = [];
    try {
      orderedEvents = await loadEventsFromBackend();
    } catch {
      const { data: evts } = await supabase
        .from("game_events")
        .select(GAME_EVENT_SELECT_COLUMNS)
        .eq("game_id", id)
        .order("minute", { ascending: true })
        .order("created_at", { ascending: true });
      orderedEvents = normalizeStoredGameEventRowsForClient(
        (evts || []) as Array<{
          id?: string;
          player_id?: string | null;
          related_player_id?: string | null;
          external_player_convocation_id?: string | null;
          external_related_player_convocation_id?: string | null;
        }>,
      ) as GameEvent[];
    }
    setEvents(orderedEvents);
    const backendPersisted = await backendCheckpointPromise;
    const localPersisted = loadPersistedClock(id);
    const fallbackMinute = orderedEvents.length
      ? Math.max(...orderedEvents.map((e) => Math.max(1, e.minute || 1)))
      : 1;
    const fallbackBaseSeconds = Math.max(0, (fallbackMinute - 1) * 60);

    if (gameStatus === "completed") {
      setPhase("completed");
      setClockState({
        baseSeconds: fallbackBaseSeconds,
        runningSinceMs: null,
      });
    } else {
      const persistedCandidates: PersistedClockState[] = [];

      if (backendPersisted) {
        persistedCandidates.push({
          version: 1,
          phase: backendPersisted.phase,
          baseSeconds: backendPersisted.baseSeconds,
          runningSinceMs: backendPersisted.runningSinceMs,
          savedAt: backendPersisted.savedAt,
        });
      }
      if (convocationPersisted) {
        persistedCandidates.push(convocationPersisted);
      }
      if (localPersisted) persistedCandidates.push(localPersisted);

      const persisted = persistedCandidates.sort((a, b) => b.savedAt - a.savedAt)[0] ?? null;

      if (persisted) {
        const persistedPhase: MatchPhase =
          persisted.phase === "completed" ? "review" : persisted.phase;
        const persistedClockState: ClockState = {
          baseSeconds: persisted.baseSeconds,
          runningSinceMs:
            isRunningPhase(persistedPhase)
              ? (persisted.runningSinceMs ?? now)
              : null,
        };
        const persistedSeconds = computeClockSecondsAt(persistedClockState, now);

        if (persistedSeconds < fallbackBaseSeconds) {
          // Events are ahead of local snapshot.
          setPhase(persistedPhase);
          const candidateState: ClockState = {
            baseSeconds: fallbackBaseSeconds,
            runningSinceMs: isRunningPhase(persistedPhase) ? now : null,
          };
          if (isClockStateStale(candidateState, now)) {
            toast.info(
              "Relógio retomado em pausa (sessão antiga detectada). Ajusta o minuto se necessário.",
            );
          }
          setClockState(sanitizeHydratedClockState(candidateState, now));
        } else {
          setPhase(persistedPhase);
          if (isClockStateStale(persistedClockState, now)) {
            toast.info(
              "Relógio retomado em pausa (sessão antiga detectada). Ajusta o minuto se necessário.",
            );
          }
          setClockState(sanitizeHydratedClockState(persistedClockState, now));
        }
      } else {
        setPhase("pre_match");
        setClockState({
          baseSeconds: fallbackBaseSeconds,
          runningSinceMs: null,
        });
      }
    }

    setClockHydrated(true);
    setLoading(false);
  }, [
    id,
    supabase,
    loadEventsFromBackend,
    setEvents,
    setConvocatedPlayers,
    setInitialStarterIds,
    setClockHydrated,
    setClockState,
    setNowMs,
    setPhase,
    setKickoffError,
    disableBackendCheckpoint,
  ]);

  // Effect 1: load on mount / id change. loadData chama setState mas via
  // async path — falso positivo do react-hooks/set-state-in-effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (id) void loadData();
  }, [id, loadData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Effect 2: reconciliação isOnField a partir de events + initialStarterIds.
  // Fecha o gap do PR #135 (refresh durante jogo live mostrava externo no
  // estado pre-jogo) e funciona como defesa contra divergencia entre
  // mutacoes locais e events.
  useEffect(() => {
    if (initialStarterIds.length === 0) return;
    setConvocatedPlayers((prev) =>
      hydrateIsOnFieldFromEvents(prev, events, initialStarterIds),
    );
  }, [events, initialStarterIds, setConvocatedPlayers]);

  // Effect 3: redirect para summary se status === completed
  useEffect(() => {
    if (game?.status === "completed") {
      router.replace(summaryHref);
    }
  }, [game?.status, router, summaryHref]);

  return {
    loading,
    game,
    setGame,
    homeClubName,
    homeClubShortName,
    error,
    loadData,
  };
}
