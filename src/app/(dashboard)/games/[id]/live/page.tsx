"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { format, parseISO } from "date-fns";
import { pt } from "date-fns/locale";
import {
  ArrowLeft,
  Plus,
  Minus,
  X,
  Check,
  Loader2,
  AlertCircle,
  ArrowLeftRight,
  FileDown,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { exportMatchReportPDF } from "@/lib/pdf/matchReport";
import type { Game, Player, GameEvent, GameEventType } from "@/types/database";

interface LivePlayer extends Player {
  isOnField: boolean;
  isInitialBench: boolean; // was set as bench in pre-match
}

type MatchPhase =
  | "pre_match"
  | "first_half"
  | "halftime"
  | "second_half"
  | "review"
  | "completed";

type ClockState = {
  baseSeconds: number;
  runningSinceMs: number | null;
};

type PersistedClockState = {
  version: 1;
  phase: MatchPhase;
  baseSeconds: number;
  runningSinceMs: number | null;
  savedAt: number;
};

type BackendCheckpointState = {
  phase: MatchPhase;
  baseSeconds: number;
  runningSinceMs: number | null;
  savedAt: number;
};

const EVENT_LABELS: Record<string, string> = {
  goal: "⚽ Golo",
  assist: "🅰️ Assistência",
  own_goal: "⚽ Autogolo",
  yellow_card: "🟨 Cartão Amarelo",
  red_card: "🟥 Cartão Vermelho",
  substitution_in: "🔄 Substituição (entra)",
  substitution_out: "🔄 Substituição (sai)",
};

type LiveStatus = "on_field" | "substitute" | "substituted";

function normalizeLiveStatus(value: string | null | undefined): LiveStatus | null {
  if (!value) return null;
  if (
    value === "on_field" ||
    value === "starter" ||
    value === "titular" ||
    value === "playing"
  ) {
    return "on_field";
  }
  if (
    value === "substitute" ||
    value === "bench" ||
    value === "suplente" ||
    value === "on_bench"
  ) {
    return "substitute";
  }
  if (value === "substituted" || value === "substituted_out") return "substituted";
  return null;
}

function isGoalEventType(eventType: string | null | undefined) {
  return eventType === "goal" || eventType === "penalty_goal";
}

function formatClock(totalSeconds: number) {
  const min = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const sec = (totalSeconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function isRunningPhase(phase: MatchPhase) {
  return phase === "first_half" || phase === "second_half";
}

function computeClockSecondsAt(state: ClockState, atMs: number) {
  if (!state.runningSinceMs) return Math.max(0, state.baseSeconds);
  const runningSeconds = Math.max(0, Math.floor((atMs - state.runningSinceMs) / 1000));
  return Math.max(0, state.baseSeconds + runningSeconds);
}

function clockStorageKey(gameId: string) {
  return `coach11:live-clock:${gameId}`;
}

function loadPersistedClock(gameId: string): PersistedClockState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(clockStorageKey(gameId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedClockState>;
    if (parsed.version !== 1) return null;
    if (typeof parsed.phase !== "string") return null;
    if (typeof parsed.baseSeconds !== "number") return null;
    return {
      version: 1,
      phase: parsed.phase as MatchPhase,
      baseSeconds: Math.max(0, Math.floor(parsed.baseSeconds)),
      runningSinceMs: typeof parsed.runningSinceMs === "number" ? parsed.runningSinceMs : null,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

function persistClock(gameId: string, payload: PersistedClockState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(clockStorageKey(gameId), JSON.stringify(payload));
  } catch {
    // ignore storage errors (private mode / quota)
  }
}

type LiveEventInput = {
  event_type: string;
  player_id?: string | null;
  related_player_id?: string | null;
  minute: number;
  is_opponent_event: boolean;
};

type FinalStatPayloadRow = {
  player_id: string;
  lineup_type: "starter" | "substitute";
  minutes_played: number;
  goals: number;
  own_goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  coach_rating: number | null;
  is_mvp: boolean;
  is_finalized: boolean;
};

function mergeEvents(prev: GameEvent[], incoming: GameEvent[]) {
  const byId = new Map<string, GameEvent>();
  prev.forEach((event) => byId.set(event.id, event));
  incoming.forEach((event) => byId.set(event.id, event));
  return Array.from(byId.values()).sort((a, b) => {
    if (a.minute !== b.minute) return a.minute - b.minute;
    return (a.created_at || "").localeCompare(b.created_at || "");
  });
}

/** Calculates minutes played per player from game_events substitution events */
function computeMinutesPlayed(
  players: LivePlayer[],
  events: GameEvent[],
  starterIds: Set<string>,
  finalMinute: number,
): Map<string, number> {
  type SubTransition = {
    minute: number;
    outPlayerId: string;
    inPlayerId: string | null;
    createdAt: string;
    order: number;
  };

  const rawTransitions: SubTransition[] = [];

  events.forEach((event, index) => {
    if (event.is_opponent_event) return;
    if (event.event_type === "substitution_out" && typeof event.player_id === "string") {
      rawTransitions.push({
        minute: Math.max(0, Math.floor(event.minute || 0)),
        outPlayerId: event.player_id,
        inPlayerId:
          typeof event.related_player_id === "string" ? event.related_player_id : null,
        createdAt: event.created_at || "",
        order: index,
      });
      return;
    }
    // Compatibilidade com registos antigos.
    if (
      (event.event_type as string) === "substitution" &&
      typeof event.player_id === "string" &&
      typeof event.related_player_id === "string"
    ) {
      rawTransitions.push({
        minute: Math.max(0, Math.floor(event.minute || 0)),
        outPlayerId: event.related_player_id,
        inPlayerId: event.player_id,
        createdAt: event.created_at || "",
        order: index,
      });
      return;
    }
    // Fallback: some datasets may have only substitution_in.
    if (
      event.event_type === "substitution_in" &&
      typeof event.player_id === "string" &&
      typeof event.related_player_id === "string"
    ) {
      const minute = Math.max(0, Math.floor(event.minute || 0));
      const outPlayerId = event.related_player_id;
      const inPlayerId = event.player_id;
      const hasMatchingOut = rawTransitions.some(
        (item) =>
          item.minute === minute &&
          item.outPlayerId === outPlayerId &&
          item.inPlayerId === inPlayerId,
      );
      if (!hasMatchingOut) {
        rawTransitions.push({
          minute,
          outPlayerId,
          inPlayerId,
          createdAt: event.created_at || "",
          order: index,
        });
      }
    }
  });

  const substitutions = rawTransitions.sort((a, b) => {
    if (a.minute !== b.minute) return a.minute - b.minute;
    const createdCmp = (a.createdAt || "").localeCompare(b.createdAt || "");
    if (createdCmp !== 0) return createdCmp;
    return a.order - b.order;
  });

  const normalizedFinalMinute = Math.max(0, Math.floor(finalMinute));

  const result = new Map<string, number>();

  for (const player of players) {
    let currentStart: number | null = starterIds.has(player.id) ? 0 : null;
    let total = 0;

    for (const ev of substitutions) {
      const minute = Math.max(0, Math.min(normalizedFinalMinute, ev.minute));
      if (ev.inPlayerId === player.id) {
        if (currentStart !== null) {
          // Defensive close if malformed data says "in" while already active.
          total += Math.max(0, minute - currentStart);
        }
        currentStart = minute;
      }
      if (ev.outPlayerId === player.id) {
        if (currentStart === null) continue;
        total += Math.max(0, minute - currentStart);
        currentStart = null;
      }
    }

    if (currentStart !== null) {
      total += Math.max(0, normalizedFinalMinute - currentStart);
    }

    result.set(player.id, Math.max(0, Math.min(total, normalizedFinalMinute)));
  }

  return result;
}

export default function LiveGamePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | null>(null);
  const [convocatedPlayers, setConvocatedPlayers] = useState<LivePlayer[]>([]);
  const [initialStarterIds, setInitialStarterIds] = useState<string[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [clockState, setClockState] = useState<ClockState>({
    baseSeconds: 0,
    runningSinceMs: null,
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [clockHydrated, setClockHydrated] = useState(false);
  const [phase, setPhase] = useState<MatchPhase>("pre_match");
  const [savingEvent, setSavingEvent] = useState(false);
  const [savingLineup, setSavingLineup] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Event modal state
  type ModalType = GameEventType | "substitution";
  const [modalType, setModalType] = useState<ModalType | null>(null);
  const [modalIsOpponent, setModalIsOpponent] = useState(false);
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
  const checkpointBackendEnabledRef = useRef(true);
  const lastCheckpointFingerprintRef = useRef<string | null>(null);
  const clockSeconds = useMemo(
    () => computeClockSecondsAt(clockState, nowMs),
    [clockState, nowMs],
  );
  const elapsedMinutes = Math.floor(clockSeconds / 60);
  const currentMinute = elapsedMinutes + 1; // 1-based minute for UI and game_events

  const persistCheckpointToBackend = useCallback(
    async (
      snapshot: { phase: MatchPhase; baseSeconds: number; runningSinceMs: number | null },
      options?: { keepalive?: boolean },
    ) => {
      if (!checkpointBackendEnabledRef.current) return;
      try {
        const res = await fetch(`/api/games/${id}/live/checkpoint`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot),
          cache: "no-store",
          keepalive: options?.keepalive,
        });

        const payload = await res.json().catch(() => null);
        if (payload?.missingTable === true) {
          checkpointBackendEnabledRef.current = false;
        }
      } catch {
        // Ignore transient backend failures. Local checkpoint stays active.
      }
    },
    [id],
  );

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

  const syncConvocatedPlayersFromBackend = useCallback(async () => {
    const res = await fetch(`/api/games/${id}/convocation`, { cache: "no-store" });
    const payload = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(payload?.players)) {
      throw new Error("live_convocation_sync_failed");
    }

    const rawPlayers = payload.players as Array<Player & { isConvocated?: boolean }>;
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

    const convRes = await fetch(`/api/games/${id}/convocation`, { cache: "no-store" });
    const convPayload = await convRes.json().catch(() => ({}));
    const gameData =
      convRes.ok && convPayload?.game ? (convPayload.game as Game) : null;

    if (!gameData) {
      setGame(null);
      setError(
        (convPayload as { error?: string } | null)?.error || "Jogo não encontrado.",
      );
      setLoading(false);
      return;
    }
    setGame(gameData);
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
    const backendCheckpointPromise = fetch(`/api/games/${id}/live/checkpoint`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => null);
        if (payload?.missingTable === true) {
          checkpointBackendEnabledRef.current = false;
          return null;
        }
        if (!res.ok || !payload?.checkpoint) return null;
        const checkpoint = payload.checkpoint as Partial<BackendCheckpointState>;
        if (typeof checkpoint.phase !== "string") return null;
        if (typeof checkpoint.baseSeconds !== "number") return null;

        return {
          phase: checkpoint.phase as MatchPhase,
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
      const rawPlayers = convPayload.players as Array<Player & { isConvocated?: boolean }>;
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

      let convPlayers: Player[] = [];
      const latestConvocationId = convRows?.[0]?.id ?? null;
      if (latestConvocationId) {
        const { data: cp } = await supabase
          .from("convocation_players")
          .select("player_id, players(*)")
          .eq("convocation_id", latestConvocationId);

        const byPlayerId = new Map<string, Player>();
        (cp || []).forEach((row) => {
          const player = row.players as unknown as Player;
          if (!player?.id) return;
          byPlayerId.set(player.id, player);
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

      const onFieldIds = new Set(
        normalizedStats
          .filter((s) => s.status === "on_field")
          .map((s) => s.player_id),
      );
      const benchIds = new Set(
        normalizedStats
          .filter((s) => s.status === "substitute" || s.status === "substituted")
          .map((s) => s.player_id),
      );
      const starterIdsFromLive = new Set(
        normalizedStats
          .filter((s) => s.start_minute === 0)
          .map((s) => s.player_id),
      );

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
        .select("*")
        .eq("game_id", id)
        .order("minute", { ascending: true });
      orderedEvents = evts || [];
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

    lastCheckpointFingerprintRef.current = null;
    setClockHydrated(true);
    setLoading(false);
  }, [id, supabase, loadEventsFromBackend]);

  useEffect(() => {
    if (id) void loadData();
  }, [id, loadData]);

  useEffect(() => {
    if (game?.status === "completed") {
      router.replace(`/games/${id}/summary`);
    }
  }, [game?.status, id, router]);

  useEffect(() => {
    if (!clockHydrated) return;
    persistClock(id, {
      version: 1,
      phase,
      baseSeconds: clockState.baseSeconds,
      runningSinceMs: clockState.runningSinceMs,
      savedAt: Date.now(),
    });
  }, [id, phase, clockState.baseSeconds, clockState.runningSinceMs, clockHydrated]);

  useEffect(() => {
    if (!clockHydrated || !checkpointBackendEnabledRef.current) return;
    const fingerprint = `${phase}|${clockState.baseSeconds}|${clockState.runningSinceMs ?? "null"}`;
    if (lastCheckpointFingerprintRef.current === fingerprint) return;
    lastCheckpointFingerprintRef.current = fingerprint;
    void persistCheckpointToBackend({
      phase,
      baseSeconds: clockState.baseSeconds,
      runningSinceMs: clockState.runningSinceMs,
    });
  }, [
    phase,
    clockState.baseSeconds,
    clockState.runningSinceMs,
    clockHydrated,
    persistCheckpointToBackend,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !clockHydrated || !checkpointBackendEnabledRef.current) {
      return;
    }

    const flushOnPageHide = () => {
      void persistCheckpointToBackend(
        {
          phase,
          baseSeconds: clockState.baseSeconds,
          runningSinceMs: clockState.runningSinceMs,
        },
        { keepalive: true },
      );
    };

    window.addEventListener("pagehide", flushOnPageHide);
    return () => window.removeEventListener("pagehide", flushOnPageHide);
  }, [
    phase,
    clockState.baseSeconds,
    clockState.runningSinceMs,
    clockHydrated,
    persistCheckpointToBackend,
  ]);

  const pauseClock = useCallback(() => {
    const now = Date.now();
    setNowMs(now);
    setClockState((prev) => {
      if (!prev.runningSinceMs) return prev;
      const extra = Math.max(0, Math.floor((now - prev.runningSinceMs) / 1000));
      return {
        baseSeconds: prev.baseSeconds + extra,
        runningSinceMs: null,
      };
    });
  }, []);

  const startClock = useCallback(() => {
    const now = Date.now();
    setNowMs(now);
    setClockState((prev) => {
      if (prev.runningSinceMs) return prev;
      return {
        baseSeconds: prev.baseSeconds,
        runningSinceMs: now,
      };
    });
  }, []);

  const adjustClockBySeconds = useCallback((deltaSeconds: number) => {
    const now = Date.now();
    setNowMs(now);
    setClockState((prev) => {
      const current = computeClockSecondsAt(prev, now);
      const next = Math.max(0, current + deltaSeconds);
      return {
        baseSeconds: next,
        runningSinceMs: prev.runningSinceMs ? now : null,
      };
    });
  }, []);

  const saveLivePlayerStatus = useCallback(
    async (
      playerId: string,
      status: LiveStatus,
      options?: { startMinute?: number | null; endMinute?: number | null },
    ) => {
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
    [id],
  );

  useEffect(() => {
    if (!isRunningPhase(phase) || !clockState.runningSinceMs) return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, clockState.runningSinceMs]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncNow = () => setNowMs(Date.now());
    const onVisibility = () => {
      if (!document.hidden) syncNow();
    };

    window.addEventListener("focus", syncNow);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", syncNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Score from events
  const score = useMemo(() => {
    let home = 0;
    let away = 0;
    events.forEach((e) => {
      if (e.event_type === "own_goal") {
        if (e.is_opponent_event) home++;
        else away++;
      } else if (isGoalEventType(e.event_type)) {
        if (e.is_opponent_event) away++;
        else home++;
      }
    });
    return { home, away };
  }, [events]);

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

  const playersOnField = convocatedPlayers.filter((p) => p.isOnField);
  // ALL not-on-field players are available to enter (revolving subs)
  const playersAvailableToEnter = convocatedPlayers.filter((p) => !p.isOnField);

  const isLivePhase = phase === "first_half" || phase === "second_half";
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
    () => playersWhoPlayed.every((p) => playerRatings[p.id] !== undefined),
    [playersWhoPlayed, playerRatings],
  );

  const persistInitialLineupSnapshot = useCallback(
    async (starterPlayerIds: string[]) => {
      const starterIdSet = new Set(starterPlayerIds);
      const updates = convocatedPlayers.map((player) => {
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
    const starterPlayerIds = playersOnField.map((player) => player.id);
    if (starterPlayerIds.length === 0) {
      toast.error("Seleciona pelo menos 1 titular.");
      return;
    }

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
      toast.error(`Erro ao iniciar jogo: ${message}`);
    }
  }

  // ── Event handlers ──

  function openModal(type: ModalType, isOpponent: boolean) {
    if (phase !== "first_half" && phase !== "second_half") {
      toast.error("Inicia a 1ª ou 2ª parte para registar eventos.");
      return;
    }
    setModalType(type);
    setModalIsOpponent(isOpponent);
    setGoalStep("scorer");
    setSelectedScorerID(null);
    setSelectedAssistID(null);
    setSelectedSubOutId(null);
    setSelectedSubInId(null);

    if (type === "goal" && isOpponent) {
      const firstOnField = playersOnField[0] ?? null;
      const preferredGoalkeeper =
        playersOnField.find((player) =>
          /gr|gk|guarda/i.test(player.preferred_position ?? ""),
        ) ?? firstOnField;
      setSelectedScorerID(preferredGoalkeeper?.id ?? null);
    }
  }

  function closeModal() {
    setModalType(null);
    setGoalStep("scorer");
    setSelectedScorerID(null);
    setSelectedAssistID(null);
    setSelectedSubOutId(null);
    setSelectedSubInId(null);
  }

  async function confirmGoal() {
    const goalEventType: GameEventType = modalType === "own_goal" ? "own_goal" : "goal";
    if (goalEventType === "goal" && !selectedScorerID) {
      toast.error(
        modalIsOpponent
          ? "Seleciona o jogador associado ao golo adversário."
          : "Seleciona o marcador do golo.",
      );
      return;
    }
    if (goalEventType === "own_goal" && !selectedScorerID) {
      toast.error("Seleciona o jogador do autogolo.");
      return;
    }

    setSavingEvent(true);
    try {
      const inserted = await insertEventsToBackend([
        {
          event_type: goalEventType,
          player_id: selectedScorerID || null,
          related_player_id:
            goalEventType === "goal" && !modalIsOpponent ? selectedAssistID || null : null,
          minute: currentMinute,
          is_opponent_event: modalIsOpponent,
        },
      ]);
      setEvents((prev) => mergeEvents(prev, inserted));
      toast.success(`${EVENT_LABELS[goalEventType] ?? goalEventType} — min. ${currentMinute}`);
    } catch {
      toast.error("Erro ao registar golo.");
    }
    setSavingEvent(false);
    closeModal();
  }

  async function confirmCard(eventType: "yellow_card" | "red_card") {
    if (!selectedScorerID && !modalIsOpponent) return;
    setSavingEvent(true);
    try {
      const inserted = await insertEventsToBackend([
        {
          event_type: eventType,
          player_id: selectedScorerID || null,
          minute: currentMinute,
          is_opponent_event: modalIsOpponent,
        },
      ]);
      setEvents((prev) => mergeEvents(prev, inserted));
      toast.success(`${EVENT_LABELS[eventType]} — min. ${currentMinute}`);
    } catch {
      toast.error("Erro ao registar cartão.");
    }
    setSavingEvent(false);
    closeModal();
  }

  async function confirmSubstitution() {
    if (!selectedSubInId || !selectedSubOutId) return;
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
    } catch {
      toast.error("Erro ao registar substituição.");
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
    setSavingLineup(playerId);

    const newIsOnField = !player.isOnField;
    const newStatus = newIsOnField ? "on_field" : "substitute";

    try {
      const res = await fetch(`/api/games/${id}/convocation/lineup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, lineupStatus: newStatus }),
      });
      if (!res.ok) {
        throw new Error("lineup_save_failed");
      }
      const nextPlayers = convocatedPlayers.map((p) =>
        p.id === playerId
          ? { ...p, isOnField: newIsOnField, isInitialBench: !newIsOnField }
          : p,
      );
      setConvocatedPlayers(nextPlayers);
      if (phase === "pre_match") {
        setInitialStarterIds(
          nextPlayers.filter((playerItem) => playerItem.isOnField).map((playerItem) => playerItem.id),
        );
      }
    } catch {
      toast.error("Erro ao guardar titular/banco.");
    }
    setSavingLineup(null);
  }

  async function deleteEvent(eventId: string) {
    const eventToDelete = events.find((event) => event.id === eventId);
    const idsToDelete = new Set<string>([eventId]);

    if (eventToDelete?.event_type === "substitution_out") {
      const pair = events.find(
        (event) =>
          event.event_type === "substitution_in" &&
          event.minute === eventToDelete.minute &&
          event.player_id === eventToDelete.related_player_id &&
          event.related_player_id === eventToDelete.player_id,
      );
      if (pair?.id) idsToDelete.add(pair.id);
    }

    if (eventToDelete?.event_type === "substitution_in") {
      const pair = events.find(
        (event) =>
          event.event_type === "substitution_out" &&
          event.minute === eventToDelete.minute &&
          event.player_id === eventToDelete.related_player_id &&
          event.related_player_id === eventToDelete.player_id,
      );
      if (pair?.id) idsToDelete.add(pair.id);
    }

    try {
      await deleteEventsFromBackend(Array.from(idsToDelete));
      setEvents((prev) => prev.filter((event) => !idsToDelete.has(event.id)));
    } catch {
      toast.error("Erro ao apagar evento.");
    }
  }

  function buildFinalStatsPayload(finalMinute: number): FinalStatPayloadRow[] {
    const normalizedFinalMinute = Math.max(1, Math.floor(finalMinute));
    const minutesMap = computeMinutesPlayed(
      convocatedPlayers,
      events,
      starterIds,
      normalizedFinalMinute,
    );

    return convocatedPlayers.map((player) => {
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
      const finalMinute = Math.max(1, Math.floor(currentMinute));
      const finalStatsPayload = buildFinalStatsPayload(finalMinute);

      if (finalStatsPayload.length === 0) {
        throw new Error("Sem jogadores convocados para fechar o jogo.");
      }

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
          return {
            minute: e.minute,
            event_type: e.event_type,
            playerName: pl ? `${pl.first_name} ${pl.last_name}` : undefined,
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
          yellow_cards: events.filter(
            (e) => e.player_id === p.id && e.event_type === "yellow_card",
          ).length,
          red_cards: events.filter(
            (e) => e.player_id === p.id && e.event_type === "red_card",
          ).length,
        })),
      });
    } catch {
      toast.error("Erro ao exportar PDF.");
    }
    setExportingPDF(false);
  }

  // ── Loading / error states ──

  if (loading) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-32 w-full rounded-xl" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error || !game) {
    return (
      <div className="p-4 text-center py-16">
        <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
        <p className="text-slate-700">{error || "Erro ao carregar jogo."}</p>
      </div>
    );
  }

  if (game.status === "completed") {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <p className="text-sm text-slate-600">A redirecionar para o sumário do jogo...</p>
      </div>
    );
  }

  const gameStartAt = game.game_datetime ? parseISO(game.game_datetime) : null;
  const liveUnlocked = gameStartAt
    ? new Date() >= new Date(gameStartAt.getTime() - 10 * 60 * 1000)
    : true;

  if (!isFinalized && !liveUnlocked) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm mb-4"
        >
          <ArrowLeft size={16} /> Voltar
        </button>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          O live deste jogo só fica disponível 10 minutos antes do início.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto pb-24">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm mb-4"
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Scoreboard */}
      <div className="rounded-2xl bg-slate-900 text-white p-5 mb-5 text-center">
        <p className="text-slate-400 text-sm mb-1">
          {game.opponent_name ? `vs ${game.opponent_name}` : "Jogo"}
          {game.game_datetime &&
            ` · ${format(parseISO(game.game_datetime), "d MMM", { locale: pt })}`}
        </p>
        <div className="text-5xl font-black tracking-tight">
          {score.home} – {score.away}
        </div>
        <p className="text-slate-300 text-sm mt-2">
          Relógio: {formatClock(clockSeconds)} · Minuto {currentMinute}&apos;
        </p>
        {isFinalized && (
          <span className="mt-2 inline-block text-xs bg-emerald-500 text-white px-3 py-0.5 rounded-full">
            Finalizado
          </span>
        )}
      </div>

      {/* ── PRE-MATCH: Lineup selection ── */}
      {phase === "pre_match" && convocatedPlayers.length > 0 && (
        <div className="mb-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-900 text-sm">Escalação inicial</p>
              <p className="text-xs text-slate-500">Toca para alternar Titular / Banco</p>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-emerald-600">{playersOnField.length}</span>
              <span className="text-xs text-slate-400"> titulares</span>
              {playersAvailableToEnter.length > 0 && (
                <>
                  <span className="text-slate-300 mx-1">·</span>
                  <span className="text-sm font-bold text-slate-500">
                    {playersAvailableToEnter.length}
                  </span>
                  <span className="text-xs text-slate-400"> banco</span>
                </>
              )}
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {convocatedPlayers.map((player) => (
              <button
                key={player.id}
                onClick={() => toggleLineup(player.id)}
                disabled={savingLineup === player.id}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  player.isOnField
                    ? "bg-emerald-50 hover:bg-emerald-100"
                    : "bg-white hover:bg-slate-50"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    player.isOnField ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {player.jersey_number || "—"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {player.first_name} {player.last_name}
                  </p>
                  {player.preferred_position && (
                    <p className="text-xs text-slate-400">{player.preferred_position}</p>
                  )}
                </div>
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ${
                    player.isOnField
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {savingLineup === player.id ? "..." : player.isOnField ? "Titular" : "Banco"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Clock + Phase controls ── */}
      {!isFinalized && (
        <div className="mb-5 p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600 flex-1">Minuto de jogo</span>
            <button
              onClick={() => adjustClockBySeconds(-60)}
              className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center"
            >
              <Minus size={14} />
            </button>
            <span className="w-10 text-center font-bold text-lg text-slate-900">
              {currentMinute}&apos;
            </span>
            <button
              onClick={() => adjustClockBySeconds(60)}
              className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {phase === "pre_match" && (
              <Button
                onClick={() => {
                  void handleStartFirstHalf();
                }}
                disabled={playersOnField.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500"
              >
                {playersOnField.length === 0
                  ? "Seleciona pelo menos 1 titular"
                  : `Iniciar 1ª parte (${playersOnField.length} titulares)`}
              </Button>
            )}
            {phase === "first_half" && (
              <Button
                onClick={() => {
                  pauseClock();
                  setPhase("halftime");
                }}
                className="w-full bg-amber-600 hover:bg-amber-700"
              >
                Terminar 1ª parte
              </Button>
            )}
            {phase === "halftime" && (
              <Button
                onClick={() => {
                  setPhase("second_half");
                  startClock();
                }}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Iniciar 2ª parte
              </Button>
            )}
            {phase === "second_half" && (
              <Button
                onClick={() => {
                  pauseClock();
                  setPhase("review");
                }}
                className="w-full bg-slate-800 hover:bg-slate-700"
              >
                Terminar 2ª parte
              </Button>
            )}
          </div>

          {isLivePhase && (
            <Button
              variant="outline"
              onClick={() => {
                if (clockState.runningSinceMs) {
                  pauseClock();
                } else {
                  startClock();
                }
              }}
              className="w-full"
            >
              {clockState.runningSinceMs ? "Pausar relógio (debug)" : "Retomar relógio (debug)"}
            </Button>
          )}

          {phase === "halftime" && (
            <p className="text-xs text-center text-amber-700">
              Intervalo. Retoma o jogo para continuar a registar eventos.
            </p>
          )}
          {phase === "review" && (
            <p className="text-xs text-center text-slate-600">
              Revê os dados, preenche notas e MVP, depois finaliza.
            </p>
          )}
        </div>
      )}

      {/* ── Event buttons ── */}
      {!isFinalized && (
        <div className="grid grid-cols-2 gap-2 mb-5">
          <button
            onClick={() => openModal("goal", false)}
            disabled={!isLivePhase}
            className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-40"
          >
            ⚽ Golo nosso
          </button>
          <button
            onClick={() => openModal("goal", true)}
            disabled={!isLivePhase}
            className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-40"
          >
            ⚽ Golo adversário
          </button>
          <button
            onClick={() => openModal("yellow_card", false)}
            disabled={!isLivePhase}
            className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors disabled:opacity-40"
          >
            🟨 Amarelo
          </button>
          <button
            onClick={() => openModal("red_card", false)}
            disabled={!isLivePhase}
            className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-40"
          >
            🟥 Vermelho
          </button>
          <button
            onClick={() => openModal("substitution", false)}
            disabled={!isLivePhase}
            className="col-span-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors disabled:opacity-40"
          >
            🔄 Substituição
          </button>
        </div>
      )}

      {/* ── Players list (mid-game / completed) ── */}
      {phase !== "pre_match" && convocatedPlayers.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Convocados ({convocatedPlayers.length})
          </h3>
          <div className="space-y-1">
            {convocatedPlayers.map((p) => {
              const mins = computedMinutes.get(p.id) ?? 0;
              const conceded = concededGoalsByPlayer.get(p.id) ?? 0;
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-2.5 rounded-xl text-sm ${
                    p.isOnField
                      ? "bg-emerald-50 border border-emerald-200"
                      : "bg-white border border-slate-100"
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      p.isOnField ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {p.jersey_number || "—"}
                  </span>
                  <span className="flex-1 font-medium text-slate-800 truncate">
                    {p.first_name} {p.last_name}
                  </span>
                  <span className="text-xs text-slate-400">
                    {p.isOnField ? "Em campo" : "Banco"}
                  </span>
                  {mins > 0 && (
                    <span className="text-xs text-slate-500 font-mono">{mins}&apos;</span>
                  )}
                  {conceded > 0 && (
                    <span className="text-xs text-rose-600 font-mono">-{conceded} GS</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Events log ── */}
      {displayEvents.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Eventos
          </h3>
          <div className="space-y-1">
            {displayEvents.map((ev) => {
              const pl = convocatedPlayers.find((p) => p.id === ev.player_id);
              const assist = convocatedPlayers.find((p) => p.id === ev.related_player_id);
              return (
                <div
                  key={ev.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100"
                >
                  <span className="text-xs text-slate-400 w-8 text-right flex-shrink-0">
                    {ev.minute}&apos;
                  </span>
                  <span className="text-sm flex-1">
                    {EVENT_LABELS[ev.event_type] || ev.event_type}
                    {ev.is_opponent_event
                      ? pl
                        ? ` — Adversário (sofreu: ${pl.first_name} ${pl.last_name})`
                        : " — Adversário"
                      : pl
                        ? ` — ${pl.first_name} ${pl.last_name}`
                        : ""}
                    {assist && ev.event_type === "goal" ? ` (🅰️ ${assist.first_name} ${assist.last_name})` : ""}
                    {ev.event_type === "substitution_out" && assist ? ` → ${assist.first_name} ${assist.last_name}` : ""}
                    {ev.event_type === "substitution_in" && assist ? ` ← ${assist.first_name} ${assist.last_name}` : ""}
                  </span>
                  {!isFinalized && (
                    <button
                      onClick={() => void deleteEvent(ev.id)}
                      className="p-1 hover:bg-red-50 rounded-lg transition-colors group"
                    >
                      <X size={14} className="text-slate-300 group-hover:text-red-500" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── REVIEW: Ratings + MVP ── */}
      {phase === "review" && playersWhoPlayed.length > 0 && (
        <>
          {/* Notas */}
          <div className="mb-5 rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
              <p className="font-bold text-slate-900 text-sm">Notas dos jogadores</p>
              <p className="text-xs text-slate-500">
                Obrigatório para todos que participaram · {playersWhoPlayed.filter(p => playerRatings[p.id] !== undefined).length}/{playersWhoPlayed.length} preenchidos
              </p>
            </div>
            <div className="divide-y divide-slate-50">
              {playersWhoPlayed.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">
                    {p.jersey_number || "—"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {p.first_name} {p.last_name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {computedMinutes.get(p.id) ?? 0} min
                      {(concededGoalsByPlayer.get(p.id) ?? 0) > 0 &&
                        ` · -${concededGoalsByPlayer.get(p.id)} GS`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.5"
                      placeholder="—"
                      value={playerRatings[p.id] ?? ""}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val >= 0 && val <= 10) {
                          setPlayerRatings((prev) => ({ ...prev, [p.id]: val }));
                        } else if (e.target.value === "") {
                          setPlayerRatings((prev) => {
                            const next = { ...prev };
                            delete next[p.id];
                            return next;
                          });
                        }
                      }}
                      className="w-16 text-center border border-slate-200 rounded-lg px-2 py-1.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-slate-400">/10</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* MVP */}
          <div className="mb-5 rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
              <p className="font-bold text-slate-900 text-sm">MVP do jogo</p>
              <p className="text-xs text-slate-500">Seleciona o melhor jogador</p>
            </div>
            <div className="divide-y divide-slate-50">
              {playersWhoPlayed.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setMvpPlayerId((prev) => (prev === p.id ? null : p.id))}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    mvpPlayerId === p.id
                      ? "bg-amber-50 hover:bg-amber-100"
                      : "bg-white hover:bg-slate-50"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      mvpPlayerId === p.id ? "bg-amber-400 text-white" : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {mvpPlayerId === p.id ? <Star size={14} /> : (p.jersey_number || "—")}
                  </div>
                  <span className="flex-1 text-sm font-medium text-slate-800 truncate">
                    {p.first_name} {p.last_name}
                  </span>
                  {mvpPlayerId === p.id && (
                    <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                      MVP
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Finalize button ── */}
      {!isFinalized && (
        <Button
          onClick={() => void finalizeGame()}
          disabled={finalizing || phase !== "review" || !allRatingsFilled}
          className="w-full bg-slate-900 hover:bg-slate-800"
        >
          {finalizing ? (
            <Loader2 size={16} className="animate-spin mr-2" />
          ) : (
            <Check size={16} className="mr-2" />
          )}
          {phase !== "review"
            ? "Termina a 2ª parte para finalizar"
            : !allRatingsFilled
              ? `Faltam notas (${playersWhoPlayed.length - playersWhoPlayed.filter(p => playerRatings[p.id] !== undefined).length} em falta)`
              : `Finalizar jogo (${score.home}–${score.away})`}
        </Button>
      )}

      {isFinalized && (
        <Button
          onClick={() => void handleExportPDF()}
          disabled={exportingPDF}
          variant="outline"
          className="w-full"
        >
          {exportingPDF ? (
            <Loader2 size={16} className="animate-spin mr-2" />
          ) : (
            <FileDown size={16} className="mr-2" />
          )}
          Exportar relatório PDF
        </Button>
      )}

      {/* ── EVENT MODAL ── */}
      {modalType && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
              <h3 className="font-bold text-slate-900">
                {modalType === "substitution"
                  ? "🔄 Substituição"
                  : modalIsOpponent
                    ? `${EVENT_LABELS[modalType]} — Adversário`
                    : EVENT_LABELS[modalType] ?? modalType}
                {modalType === "goal" && !modalIsOpponent && goalStep === "assist"
                  ? " — Assistência?"
                  : ""}
              </h3>
              <button onClick={closeModal}>
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* SUBSTITUTION */}
              {modalType === "substitution" && (
                <>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                      Sai (em campo)
                    </p>
                    {playersOnField.length === 0 ? (
                      <p className="text-xs text-slate-400">Nenhum jogador em campo.</p>
                    ) : (
                      playersOnField.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedSubOutId(p.id)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                            selectedSubOutId === p.id
                              ? "bg-red-50 border-2 border-red-300"
                              : "bg-slate-50 border border-slate-100"
                          }`}
                        >
                          <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {p.jersey_number || "—"}
                          </span>
                          <span className="text-sm font-medium">
                            {p.first_name} {p.last_name}
                          </span>
                          {selectedSubOutId === p.id && (
                            <ArrowLeftRight size={14} className="text-red-500 ml-auto" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                      Entra (banco)
                    </p>
                    {playersAvailableToEnter.length === 0 ? (
                      <p className="text-xs text-slate-400">Todos os jogadores estão em campo.</p>
                    ) : (
                      playersAvailableToEnter.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedSubInId(p.id)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                            selectedSubInId === p.id
                              ? "bg-emerald-50 border-2 border-emerald-300"
                              : "bg-slate-50 border border-slate-100"
                          }`}
                        >
                          <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {p.jersey_number || "—"}
                          </span>
                          <span className="text-sm font-medium">
                            {p.first_name} {p.last_name}
                          </span>
                          {selectedSubInId === p.id && (
                            <Check size={14} className="text-emerald-500 ml-auto" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  <Button
                    onClick={() => void confirmSubstitution()}
                    disabled={savingEvent || !selectedSubInId || !selectedSubOutId}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {savingEvent ? <Loader2 size={16} className="animate-spin" /> : "Confirmar substituição"}
                  </Button>
                </>
              )}

              {/* GOAL (own team) — 2-step: scorer → assist */}
              {modalType === "goal" && !modalIsOpponent && (
                <>
                  {goalStep === "scorer" && (
                    <>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                        Marcador
                      </p>
                      {convocatedPlayers.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedScorerID(p.id)}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                            selectedScorerID === p.id
                              ? "bg-emerald-50 border-2 border-emerald-300"
                              : "bg-slate-50 border border-slate-100"
                          }`}
                        >
                          <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {p.jersey_number || "—"}
                          </span>
                          <span className="text-sm font-medium truncate">
                            {p.first_name} {p.last_name}
                          </span>
                          {selectedScorerID === p.id && (
                            <Check size={14} className="text-emerald-500 ml-auto" />
                          )}
                        </button>
                      ))}
                      <div className="flex gap-2 pt-1">
                        <Button
                          onClick={() => setGoalStep("assist")}
                          disabled={!selectedScorerID}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                          Seguinte →
                        </Button>
                        <Button variant="outline" onClick={closeModal}>
                          Cancelar
                        </Button>
                      </div>
                    </>
                  )}

                  {goalStep === "assist" && (
                    <>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                        Assistência (opcional)
                      </p>
                      {convocatedPlayers
                        .filter((p) => p.id !== selectedScorerID)
                        .map((p) => (
                          <button
                            key={p.id}
                            onClick={() =>
                              setSelectedAssistID((prev) => (prev === p.id ? null : p.id))
                            }
                            className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                              selectedAssistID === p.id
                                ? "bg-blue-50 border-2 border-blue-300"
                                : "bg-slate-50 border border-slate-100"
                            }`}
                          >
                            <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {p.jersey_number || "—"}
                            </span>
                            <span className="text-sm font-medium truncate">
                              {p.first_name} {p.last_name}
                            </span>
                            {selectedAssistID === p.id && (
                              <Check size={14} className="text-blue-500 ml-auto" />
                            )}
                          </button>
                        ))}
                      <div className="flex gap-2 pt-1">
                        <Button
                          onClick={() => void confirmGoal()}
                          disabled={savingEvent}
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                          {savingEvent ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            "Confirmar golo"
                          )}
                        </Button>
                        <Button variant="outline" onClick={() => setGoalStep("scorer")}>
                          ← Voltar
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* GOAL (opponent) / own_goal */}
              {((modalType === "goal" && modalIsOpponent) || modalType === "own_goal") && (
                <>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                    {modalType === "goal" && modalIsOpponent
                      ? "Jogador associado ao golo sofrido"
                      : "Jogador (autogolo)"}
                  </p>
                  {(modalType === "goal" && modalIsOpponent
                    ? playersOnField.length > 0
                      ? playersOnField
                      : convocatedPlayers
                    : convocatedPlayers
                  ).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedScorerID(p.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                        selectedScorerID === p.id
                          ? "bg-emerald-50 border-2 border-emerald-300"
                          : "bg-slate-50 border border-slate-100"
                      }`}
                    >
                      <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {p.jersey_number || "—"}
                      </span>
                      <span className="text-sm font-medium truncate">
                        {p.first_name} {p.last_name}
                      </span>
                      {selectedScorerID === p.id && (
                        <Check size={14} className="text-emerald-500 ml-auto" />
                      )}
                    </button>
                  ))}
                  {modalType === "goal" && modalIsOpponent && playersOnField.length === 0 && (
                    <p className="text-xs text-amber-600">
                      Sem jogadores marcados em campo. Mostramos todos os convocados.
                    </p>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => void confirmGoal()}
                      disabled={savingEvent || !selectedScorerID}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {savingEvent ? <Loader2 size={16} className="animate-spin" /> : "Confirmar"}
                    </Button>
                    <Button variant="outline" onClick={closeModal}>
                      Cancelar
                    </Button>
                  </div>
                </>
              )}

              {/* YELLOW / RED CARD */}
              {(modalType === "yellow_card" || modalType === "red_card") && (
                <>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                    Jogador
                  </p>
                  {convocatedPlayers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedScorerID(p.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl mb-1 text-left transition-colors ${
                        selectedScorerID === p.id
                          ? "bg-emerald-50 border-2 border-emerald-300"
                          : "bg-slate-50 border border-slate-100"
                      }`}
                    >
                      <span className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {p.jersey_number || "—"}
                      </span>
                      <span className="text-sm font-medium truncate">
                        {p.first_name} {p.last_name}
                      </span>
                      {selectedScorerID === p.id && (
                        <Check size={14} className="text-emerald-500 ml-auto" />
                      )}
                    </button>
                  ))}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => void confirmCard(modalType)}
                      disabled={savingEvent || !selectedScorerID}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    >
                      {savingEvent ? <Loader2 size={16} className="animate-spin" /> : "Confirmar"}
                    </Button>
                    <Button variant="outline" onClick={closeModal}>
                      Cancelar
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
