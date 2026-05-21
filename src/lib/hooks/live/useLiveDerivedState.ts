"use client";

import { useMemo, useCallback } from "react";
import {
  isGoalEventType,
  computeMinutesPlayed,
} from "@/components/games/live/utils";
import { getLiveKickoffState } from "@/lib/games/live-kickoff";
import { filterPersistentLiveStatsPlayers } from "@/lib/games/live-persistence";
import { comparePlayersByFootballPriority } from "@/lib/games/sort-players-by-field-status";
import type { Game, GameEvent } from "@/types/database";
import type {
  ClockState,
  LivePlayer,
  MatchPhase,
  PlayerAvailability,
} from "@/components/games/live/types";

interface UseLiveDerivedStateArgs {
  game: Game | null;
  phase: MatchPhase;
  clockState: ClockState;
  currentMinute: number;
  events: GameEvent[];
  convocatedPlayers: LivePlayer[];
  initialStarterIds: string[];
}

export interface UseLiveDerivedStateReturn {
  // Group A — score, events display, yellow cards
  score: { home: number; away: number };
  displayEvents: GameEvent[];
  yellowCardsByPlayer: Map<string, number>;
  // Group B — discipline
  sentOffPlayerIds: Set<string>;
  // Group C — availability
  availabilityByPlayerId: Map<string, PlayerAvailability>;
  getPlayerAvailability: (
    playerId: string | null | undefined,
  ) => PlayerAvailability;
  // Group D — sorted lineups
  playersOnField: LivePlayer[];
  playersOnBench: LivePlayer[];
  playersAvailableToEnter: LivePlayer[];
  suspendedBenchPlayers: LivePlayer[];
  hasExternalConvocatedPlayers: boolean;
  kickoffState: ReturnType<typeof getLiveKickoffState>;
  // Group E — phase predicates
  isLivePhase: boolean;
  canRegisterEvents: boolean;
  canRegisterSubstitutionOrCard: boolean;
  // Group F — minutes & finalize support
  starterIds: Set<string>;
  minuteForComputedStats: number;
  computedMinutes: Map<string, number>;
  playersWhoPlayed: LivePlayer[];
  playersWhoNeedPersistentStats: LivePlayer[];
  concededGoalsByPlayer: Map<string, number>;
}

export function useLiveDerivedState({
  game,
  phase,
  clockState,
  currentMinute,
  events,
  convocatedPlayers,
  initialStarterIds,
}: UseLiveDerivedStateArgs): UseLiveDerivedStateReturn {
  // ─── Group A ───────────────────────────────────────────────────
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
      if (
        event.is_opponent_event ||
        event.event_type !== "yellow_card" ||
        !event.player_id
      ) {
        return;
      }
      map.set(event.player_id, (map.get(event.player_id) ?? 0) + 1);
    });
    return map;
  }, [events]);

  // ─── Group B ───────────────────────────────────────────────────
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

  // ─── Group C ───────────────────────────────────────────────────
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
      return (
        availabilityByPlayerId.get(playerId) ?? {
          label: "Banco",
          selectable: false,
        }
      );
    },
    [availabilityByPlayerId],
  );

  // ─── Group D ───────────────────────────────────────────────────
  const playersOnField = useMemo(
    () =>
      [
        ...convocatedPlayers.filter(
          (player) => player.isOnField && !sentOffPlayerIds.has(player.id),
        ),
      ].sort(comparePlayersByFootballPriority),
    [convocatedPlayers, sentOffPlayerIds],
  );
  const playersOnBench = useMemo(
    () =>
      [...convocatedPlayers.filter((player) => !player.isOnField)].sort(
        comparePlayersByFootballPriority,
      ),
    [convocatedPlayers],
  );
  const playersAvailableToEnter = useMemo(
    () =>
      [
        ...playersOnBench.filter((player) => !sentOffPlayerIds.has(player.id)),
      ].sort(comparePlayersByFootballPriority),
    [playersOnBench, sentOffPlayerIds],
  );
  const suspendedBenchPlayers = useMemo(
    () =>
      [
        ...playersOnBench.filter((player) => sentOffPlayerIds.has(player.id)),
      ].sort(comparePlayersByFootballPriority),
    [playersOnBench, sentOffPlayerIds],
  );
  const hasExternalConvocatedPlayers = useMemo(
    () => convocatedPlayers.some((player) => player.isExternal === true),
    [convocatedPlayers],
  );
  const kickoffState = useMemo(
    () => getLiveKickoffState({ starters: playersOnField }),
    [playersOnField],
  );

  // ─── Group E ───────────────────────────────────────────────────
  const isLivePhase = phase === "first_half" || phase === "second_half";
  const canRegisterEvents = isLivePhase || !!clockState.runningSinceMs;
  // Subs e cartoes tambem em halftime (subs tacticas no balneario +
  // cartoes disciplinares aplicados ao banco). Golos continuam restritos
  // a jogo activo. Pre_match e review ficam bloqueados como antes.
  const canRegisterSubstitutionOrCard =
    canRegisterEvents || phase === "halftime";

  // ─── Group F ───────────────────────────────────────────────────
  const starterIds = useMemo(() => {
    const s = new Set<string>(initialStarterIds);
    if (s.size === 0) {
      convocatedPlayers.forEach((player) => {
        if (player.isOnField) s.add(player.id);
      });
    }
    return s;
  }, [initialStarterIds, convocatedPlayers]);

  const minuteForComputedStats =
    phase === "pre_match" ? 0 : Math.max(1, currentMinute);

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
    () =>
      convocatedPlayers.filter((p) => (computedMinutes.get(p.id) ?? 0) > 0),
    [convocatedPlayers, computedMinutes],
  );
  const playersWhoNeedPersistentStats = useMemo(
    () => filterPersistentLiveStatsPlayers(playersWhoPlayed),
    [playersWhoPlayed],
  );

  const concededGoalsByPlayer = useMemo(() => {
    const byPlayer = new Map<string, number>();
    events.forEach((event) => {
      if (
        !event.player_id ||
        !event.is_opponent_event ||
        !isGoalEventType(event.event_type)
      ) {
        return;
      }
      byPlayer.set(event.player_id, (byPlayer.get(event.player_id) ?? 0) + 1);
    });
    return byPlayer;
  }, [events]);

  return {
    score,
    displayEvents,
    yellowCardsByPlayer,
    sentOffPlayerIds,
    availabilityByPlayerId,
    getPlayerAvailability,
    playersOnField,
    playersOnBench,
    playersAvailableToEnter,
    suspendedBenchPlayers,
    hasExternalConvocatedPlayers,
    kickoffState,
    isLivePhase,
    canRegisterEvents,
    canRegisterSubstitutionOrCard,
    starterIds,
    minuteForComputedStats,
    computedMinutes,
    playersWhoPlayed,
    playersWhoNeedPersistentStats,
    concededGoalsByPlayer,
  };
}
