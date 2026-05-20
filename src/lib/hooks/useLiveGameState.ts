"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { getLiveKickoffState } from "@/lib/games/live-kickoff";
import {
  GAME_EVENT_SELECT_COLUMNS,
  normalizeStoredGameEventRowsForClient,
} from "@/lib/games/live-event-participants";
import { hydrateIsOnFieldFromEvents } from "@/lib/games/hydrate-is-on-field";
import { filterPersistentLiveStatsPlayers } from "@/lib/games/live-persistence";
import { toExternalLivePlayerId } from "@/lib/games/live-player-ids";
import { captureClientProductEvent } from "@/lib/observability/posthog-client";
import { exportMatchReportPDF } from "@/lib/pdf/matchReport";
import { useLiveClock } from "@/lib/hooks/live/useLiveClock";
import { useLiveEvents } from "@/lib/hooks/live/useLiveEvents";
import type { Game, Player, GameEvent, GameEventType } from "@/types/database";
import type {
  LivePlayer,
  MatchPhase,
  ClockState,
  PersistedClockState,
  BackendCheckpointState,
  LiveStatus,
  PlayerAvailability,
  LiveEventInput,
  FinalStatPayloadRow,
  ModalType,
} from "@/components/games/live/types";
import { EVENT_LABELS } from "@/components/games/live/types";
import {
  normalizeLiveStatus,
  isGoalEventType,
  isRunningPhase,
  parseMatchPhase,
  computeClockSecondsAt,
  loadPersistedClock,
  sortPlayersByName,
  mergeEvents,
  computeMinutesPlayed,
} from "@/components/games/live/utils";

export function useLiveGameState(id: string) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [homeClubName, setHomeClubName] = useState<string | null>(null);
  const [homeClubShortName, setHomeClubShortName] = useState<string | null>(null);
  const [convocatedPlayers, setConvocatedPlayers] = useState<LivePlayer[]>([]);
  const [initialStarterIds, setInitialStarterIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<MatchPhase>("pre_match");
  const {
    clockState,
    nowMs,
    clockSeconds,
    currentMinute,
    pauseClock,
    startClock,
    adjustClockBySeconds,
    setClockState,
    setNowMs,
    setClockHydrated,
    disableBackendCheckpoint,
  } = useLiveClock({ id, phase });
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingLineup, setSavingLineup] = useState<string | null>(null);
  const [startingFirstHalf, setStartingFirstHalf] = useState(false);
  const [kickoffError, setKickoffError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Event modal state
  const [modalType, setModalType] = useState<ModalType | null>(null);
  const [goalTeamSide, setGoalTeamSide] = useState<"ours" | "opponent" | null>(null);
  const [goalKind, setGoalKind] = useState<"goal" | "own_goal" | null>(null);
  // Goal flow: step 1 = scorer, step 2 = assist
  const [goalStep, setGoalStep] = useState<"scorer" | "assist">("scorer");
  const [selectedScorerID, setSelectedScorerID] = useState<string | null>(null);
  const [selectedAssistID, setSelectedAssistID] = useState<string | null>(null);
  // Substitution
  const [selectedSubOutId, setSelectedSubOutId] = useState<string | null>(null);
  const [selectedSubInId, setSelectedSubInId] = useState<string | null>(null);

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
        //
        // Logo este branch é NO-OP durante live. O estado em RAM
        // (convocatedPlayers[i].isOnField) continua a actualizar via o
        // caller (handleSubstitution / applySendOff), e os events já
        // são gravados via /live/events.
        //
        // Pré-jogo o lineup é actualizado via /convocation/lineup
        // (chamado em outros pontos do hook, não aqui).
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
    currentMinute,
    convocatedPlayers,
    initialStarterIds,
    setConvocatedPlayers,
    saveLivePlayerStatus,
  });

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
          setClockState({
            baseSeconds: fallbackBaseSeconds,
            runningSinceMs: isRunningPhase(persistedPhase) ? now : null,
          });
        } else {
          setPhase(persistedPhase);
          setClockState(persistedClockState);
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
    setClockHydrated,
    setClockState,
    setNowMs,
    disableBackendCheckpoint,
  ]);

  useEffect(() => {
    if (id) void loadData();
  }, [id, loadData]);

  // Reconciliacao: deriva isOnField de events + initialStarterIds sempre que
  // events ou initialStarterIds mudam. Fecha o gap documentado no PR #135
  // (refresh durante jogo live mostrava externo no estado pre-jogo) e funciona
  // como defesa contra divergencia entre mutacoes locais e events.
  useEffect(() => {
    if (initialStarterIds.length === 0) return;
    setConvocatedPlayers((prev) =>
      hydrateIsOnFieldFromEvents(prev, events, initialStarterIds),
    );
  }, [events, initialStarterIds]);

  useEffect(() => {
    if (game?.status === "completed") {
      router.replace(`/games/${id}/summary`);
    }
  }, [game?.status, id, router]);

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

  useEffect(() => {
    if (phase !== "pre_match" && kickoffError) {
      setKickoffError(null);
    }
  }, [kickoffError, phase]);

  // Score from events
  const score = useMemo(() => {
    let home = 0;
    let away = 0;
    const ourTeamIsHome = game?.is_home ?? true;

    const incrementScore = (isOurTeamGoal: boolean) => {
      if (ourTeamIsHome) {
        if (isOurTeamGoal) home++;
        else away++;
      } else {
        if (isOurTeamGoal) away++;
        else home++;
      }
    };

    events.forEach((e) => {
      if (e.event_type === "own_goal") {
        // Opponent own goal => our goal; own team own goal => opponent goal.
        incrementScore(e.is_opponent_event);
      } else if (isGoalEventType(e.event_type)) {
        // Normal goal events follow event side: opponent vs our team.
        incrementScore(!e.is_opponent_event);
      }
    });
    return { home, away };
  }, [events, game?.is_home]);

  const displayEvents = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.minute - b.minute);
    return sorted.filter((event) => {
      if (event.event_type !== "substitution_in") return true;
      return !sorted.some(
        (other) =>
          other.event_type === "substitution_out" &&
          other.minute === event.minute &&
          other.player_id === event.related_player_id &&
          other.related_player_id === event.player_id,
      );
    });
  }, [events]);

  const yellowCardsByPlayer = useMemo(() => {
    const map = new Map<string, number>();
    events.forEach((event) => {
      if (event.is_opponent_event || event.event_type !== "yellow_card" || !event.player_id) {
        return;
      }
      map.set(event.player_id, (map.get(event.player_id) ?? 0) + 1);
    });
    return map;
  }, [events]);

  const sentOffPlayerIds = useMemo(() => {
    const set = new Set<string>();
    events.forEach((event) => {
      if (event.is_opponent_event || !event.player_id) return;
      if (event.event_type === "red_card") {
        set.add(event.player_id);
      }
    });
    yellowCardsByPlayer.forEach((count, playerId) => {
      if (count >= 2) set.add(playerId);
    });
    return set;
  }, [events, yellowCardsByPlayer]);

  const availabilityByPlayerId = useMemo(() => {
    const map = new Map<string, PlayerAvailability>();
    convocatedPlayers.forEach((player) => {
      if (sentOffPlayerIds.has(player.id)) {
        map.set(player.id, { label: "Expulso", selectable: false });
        return;
      }
      map.set(player.id, {
        label: player.isOnField ? "Em campo" : "Banco",
        selectable: true,
      });
    });
    return map;
  }, [convocatedPlayers, sentOffPlayerIds]);

  const getPlayerAvailability = useCallback(
    (playerId: string | null | undefined): PlayerAvailability => {
      if (!playerId) return { label: "Banco", selectable: false };
      return availabilityByPlayerId.get(playerId) ?? { label: "Banco", selectable: false };
    },
    [availabilityByPlayerId],
  );

  const playersOnField = sortPlayersByName(
    convocatedPlayers.filter(
      (player) => player.isOnField && !sentOffPlayerIds.has(player.id),
    ),
  );
  const playersOnBench = sortPlayersByName(
    convocatedPlayers.filter((player) => !player.isOnField),
  );
  const playersAvailableToEnter = sortPlayersByName(
    playersOnBench.filter((player) => !sentOffPlayerIds.has(player.id)),
  );
  const suspendedBenchPlayers = sortPlayersByName(
    playersOnBench.filter((player) => sentOffPlayerIds.has(player.id)),
  );
  const hasExternalConvocatedPlayers = convocatedPlayers.some(
    (player) => player.isExternal === true,
  );
  const kickoffState = getLiveKickoffState({
    starters: playersOnField,
  });

  const isLivePhase = phase === "first_half" || phase === "second_half";
  const canRegisterEvents = isLivePhase || !!clockState.runningSinceMs;
  // Subs e cartoes tambem em halftime (subs tacticas no balneario +
  // cartoes disciplinares aplicados ao banco). Golos continuam restritos
  // a jogo activo. Pre_match e review ficam bloqueados como antes.
  const canRegisterSubstitutionOrCard =
    canRegisterEvents || phase === "halftime";
  const isFinalized = game?.status === "completed";

  // Review: players who actually played (minutes > 0)
  const starterIds = useMemo(() => {
    const s = new Set<string>(initialStarterIds);
    if (s.size === 0) {
      convocatedPlayers.forEach((player) => {
        if (player.isOnField) s.add(player.id);
      });
    }
    return s;
  }, [initialStarterIds, convocatedPlayers]);
  const minuteForComputedStats = phase === "pre_match" ? 0 : Math.max(1, currentMinute);

  const computedMinutes = useMemo(
    () =>
      computeMinutesPlayed(
        convocatedPlayers,
        events,
        starterIds,
        minuteForComputedStats,
      ),
    [convocatedPlayers, events, starterIds, minuteForComputedStats],
  );

  const playersWhoPlayed = useMemo(
    () => convocatedPlayers.filter((p) => (computedMinutes.get(p.id) ?? 0) > 0),
    [convocatedPlayers, computedMinutes],
  );
  const playersWhoNeedPersistentStats = useMemo(
    () => filterPersistentLiveStatsPlayers(playersWhoPlayed),
    [playersWhoPlayed],
  );

  const concededGoalsByPlayer = useMemo(() => {
    const byPlayer = new Map<string, number>();
    events.forEach((event) => {
      if (!event.player_id || !event.is_opponent_event || !isGoalEventType(event.event_type)) {
        return;
      }
      byPlayer.set(event.player_id, (byPlayer.get(event.player_id) ?? 0) + 1);
    });
    return byPlayer;
  }, [events]);

  const allRatingsFilled = useMemo(
    () =>
      playersWhoNeedPersistentStats.every(
        (player) => playerRatings[player.id] !== undefined,
      ),
    [playerRatings, playersWhoNeedPersistentStats],
  );

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

  async function handleStartFirstHalf() {
    const kickoffState = getLiveKickoffState({
      starters: playersOnField,
    });
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
        gameId: id,
        starterCount: starterPlayerIds.length,
        error,
      });
      setKickoffError(message);
      toast.error(`Erro ao iniciar jogo: ${message}`);
    } finally {
      setStartingFirstHalf(false);
    }
  }

  // ── Event handlers ──

  function openModal(type: ModalType) {
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
  }

  function closeModal() {
    setModalType(null);
    setGoalTeamSide(null);
    setGoalKind(null);
    setGoalStep("scorer");
    setSelectedScorerID(null);
    setSelectedAssistID(null);
    setSelectedSubOutId(null);
    setSelectedSubInId(null);
  }

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

  async function confirmGoal() {
    if (modalType !== "goal") return;
    if (!goalTeamSide || !goalKind) {
      toast.error("Seleciona o lado e o tipo de golo.");
      return;
    }

    const eventType: GameEventType = goalKind;
    const isOpponentEvent =
      goalKind === "own_goal"
        ? goalTeamSide === "ours"
        : goalTeamSide === "opponent";
    let playerId: string | null = null;
    let relatedPlayerId: string | null = null;

    if (goalTeamSide === "ours" && goalKind === "goal") {
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
  }

  async function applySendOff(playerId: string) {
    const player = convocatedPlayers.find((item) => item.id === playerId);
    if (!player) return;

    setConvocatedPlayers((prev) =>
      prev.map((item) =>
        item.id === playerId ? { ...item, isOnField: false } : item,
      ),
    );

    try {
      await saveLivePlayerStatus(playerId, "substitute", {
        endMinute: player.isOnField ? currentMinute : null,
      });
    } catch {
      // non-blocking: event is already stored
    }
  }

  async function confirmCard(eventType: "yellow_card" | "red_card") {
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
  }

  async function confirmSubstitution() {
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
      // Update live stats (current status only — minutes calc uses events)
      await saveLivePlayerStatus(selectedSubOutId, "substitute", {
        endMinute: currentMinute,
      });
      await saveLivePlayerStatus(selectedSubInId, "on_field", {
        startMinute: currentMinute,
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
  }

  async function toggleLineup(playerId: string) {
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
      if (kickoffError) {
        setKickoffError(null);
      }
      if (phase === "pre_match") {
        setInitialStarterIds(
          nextPlayers.filter((playerItem) => playerItem.isOnField).map((playerItem) => playerItem.id),
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
  }

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
