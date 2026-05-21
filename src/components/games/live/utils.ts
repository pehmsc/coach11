import type {
  LivePlayer,
  MatchPhase,
  ClockState,
  PersistedClockState,
  LiveStatus,
  PlayerAvailabilityLabel,
} from "./types";
import type { GameEvent } from "@/types/database";

export function normalizeLiveStatus(value: string | null | undefined): LiveStatus | null {
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

export function isGoalEventType(eventType: string | null | undefined) {
  return eventType === "goal" || eventType === "penalty_goal";
}

export function getAvailabilityBadgeClasses(label: PlayerAvailabilityLabel) {
  if (label === "Expulso") return "bg-red-100 text-red-600";
  if (label === "Em campo") return "bg-emerald-100 text-emerald-700";
  return "bg-slate-100 text-slate-500";
}

export function formatClock(totalSeconds: number) {
  const min = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const sec = (totalSeconds % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

export function isRunningPhase(phase: MatchPhase) {
  return phase === "first_half" || phase === "second_half";
}

export function parseMatchPhase(value: unknown): MatchPhase | null {
  if (typeof value !== "string") return null;
  if (
    value === "pre_match" ||
    value === "first_half" ||
    value === "halftime" ||
    value === "second_half" ||
    value === "review" ||
    value === "completed"
  ) {
    return value;
  }
  return null;
}

export function computeClockSecondsAt(state: ClockState, atMs: number) {
  if (!state.runningSinceMs) return Math.max(0, state.baseSeconds);
  const runningSeconds = Math.max(0, Math.floor((atMs - state.runningSinceMs) / 1000));
  return Math.max(0, state.baseSeconds + runningSeconds);
}

/**
 * Defesa contra relógio corrupto: se `minute` for um valor absurdo
 * (>200 min), devolve `null` para que campos derivados em
 * `game_stats_live` fiquem `null` em vez de gravarem lixo.
 *
 * Contexto: `useLiveClock` mantém `runningSinceMs` quando a tab fecha
 * (faz flush sem pausar). Se o coach volta horas/dias depois sem ter
 * pausado o jogo, `currentMinute` pode chegar a milhares, gravando
 * valores impossíveis (1408, 2011) em `game_stats_live`. Os cálculos
 * de minutos jogados derivam de `game_events`, não destes campos —
 * por isso o clamp é seguro.
 *
 * Limite: 200 min cobre prolongamento + intervalos longos. Acima é
 * claramente um relógio corrompido.
 */
const MAX_PLAUSIBLE_MATCH_MINUTE = 200;

export function clampToValidMatchMinute(
  minute: number | null | undefined,
): number | null {
  if (typeof minute !== "number") return null;
  if (!Number.isFinite(minute)) return null;
  if (minute < 0) return null;
  if (minute > MAX_PLAUSIBLE_MATCH_MINUTE) return null;
  return Math.floor(minute);
}

export function clockStorageKey(gameId: string) {
  return `coach11:live-clock:${gameId}`;
}

export function loadPersistedClock(gameId: string): PersistedClockState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(clockStorageKey(gameId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedClockState>;
    if (parsed.version !== 1) return null;
    const parsedPhase = parseMatchPhase(parsed.phase);
    if (!parsedPhase) return null;
    if (typeof parsed.baseSeconds !== "number") return null;
    return {
      version: 1,
      phase: parsedPhase,
      baseSeconds: Math.max(0, Math.floor(parsed.baseSeconds)),
      runningSinceMs: typeof parsed.runningSinceMs === "number" ? parsed.runningSinceMs : null,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function persistClock(gameId: string, payload: PersistedClockState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(clockStorageKey(gameId), JSON.stringify(payload));
  } catch {
    // ignore storage errors (private mode / quota)
  }
}

export function sortPlayersByName(players: LivePlayer[]) {
  return [...players].sort(
    (a, b) =>
      a.first_name.localeCompare(b.first_name, "pt", { sensitivity: "base" }) ||
      a.last_name.localeCompare(b.last_name, "pt", { sensitivity: "base" }),
  );
}

export function mergeEvents(prev: GameEvent[], incoming: GameEvent[]) {
  const byId = new Map<string, GameEvent>();
  prev.forEach((event) => byId.set(event.id, event));
  incoming.forEach((event) => byId.set(event.id, event));
  return Array.from(byId.values()).sort((a, b) => {
    if (a.minute !== b.minute) return a.minute - b.minute;
    return (a.created_at || "").localeCompare(b.created_at || "");
  });
}

/** Calculates minutes played per player from game_events substitution events */
export function computeMinutesPlayed(
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
