import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Game, GameEvent } from "@/types/database";
import type {
  ClockState,
  LivePlayer,
  MatchPhase,
} from "@/components/games/live/types";
import { useLiveDerivedState } from "./useLiveDerivedState";

const createPlayer = (overrides: Partial<LivePlayer> = {}): LivePlayer => ({
  id: "p1",
  age_group_id: "ag-1",
  first_name: "Test",
  last_name: "Player",
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  isOnField: false,
  isInitialBench: true,
  ...overrides,
});

const createGame = (overrides: Partial<Game> = {}): Game =>
  ({
    id: "g1",
    age_group_id: "ag-1",
    game_datetime: "2026-05-21T10:00:00Z",
    is_home: true,
    status: "scheduled",
    ...overrides,
  }) as Game;

const createEvent = (overrides: Partial<GameEvent> = {}): GameEvent => ({
  id: "ev1",
  game_id: "g1",
  event_type: "goal",
  minute: 30,
  is_opponent_event: false,
  created_at: "2026-05-21T10:30:00Z",
  ...overrides,
});

type ArgsOverrides = Partial<Parameters<typeof useLiveDerivedState>[0]>;

function createDefaultArgs(overrides: ArgsOverrides = {}) {
  return {
    game: createGame(),
    phase: "first_half" as MatchPhase,
    clockState: { baseSeconds: 0, runningSinceMs: null } as ClockState,
    currentMinute: 30,
    events: [] as GameEvent[],
    convocatedPlayers: [] as LivePlayer[],
    initialStarterIds: [] as string[],
    ...overrides,
  };
}

describe("useLiveDerivedState", () => {
  describe("Group A — score / displayEvents / yellowCardsByPlayer", () => {
    it("score: home goals quando is_home=true", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            game: createGame({ is_home: true }),
            events: [
              createEvent({ event_type: "goal", is_opponent_event: false }),
              createEvent({
                id: "ev2",
                event_type: "goal",
                is_opponent_event: false,
              }),
            ],
          }),
        ),
      );
      expect(result.current.score).toEqual({ home: 2, away: 0 });
    });

    it("score: away goals quando is_home=false", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            game: createGame({ is_home: false }),
            events: [
              createEvent({ event_type: "goal", is_opponent_event: false }),
            ],
          }),
        ),
      );
      expect(result.current.score).toEqual({ home: 0, away: 1 });
    });

    it("score: autogolo do adversário conta como golo nosso", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            game: createGame({ is_home: true }),
            events: [
              createEvent({
                event_type: "own_goal",
                is_opponent_event: true,
              }),
            ],
          }),
        ),
      );
      expect(result.current.score).toEqual({ home: 1, away: 0 });
    });

    it("displayEvents: filtra substitution_in paired", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            events: [
              createEvent({
                id: "so",
                event_type: "substitution_out",
                player_id: "p1",
                related_player_id: "p2",
                minute: 30,
              }),
              createEvent({
                id: "si",
                event_type: "substitution_in",
                player_id: "p2",
                related_player_id: "p1",
                minute: 30,
              }),
            ],
          }),
        ),
      );
      const ids = result.current.displayEvents.map((e) => e.id);
      expect(ids).toEqual(["so"]);
    });

    it("displayEvents: mantém substitution_in unpaired", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            events: [
              createEvent({
                id: "si",
                event_type: "substitution_in",
                player_id: "p2",
                related_player_id: "p1",
                minute: 30,
              }),
            ],
          }),
        ),
      );
      expect(result.current.displayEvents.length).toBe(1);
    });

    it("yellowCardsByPlayer: conta por player, ignora opponent events", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            events: [
              createEvent({
                event_type: "yellow_card",
                player_id: "p1",
                minute: 10,
              }),
              createEvent({
                id: "ev2",
                event_type: "yellow_card",
                player_id: "p1",
                minute: 50,
              }),
              createEvent({
                id: "ev3",
                event_type: "yellow_card",
                player_id: "p2",
                minute: 20,
              }),
              createEvent({
                id: "ev4",
                event_type: "yellow_card",
                is_opponent_event: true,
                minute: 30,
              }),
            ],
          }),
        ),
      );
      expect(result.current.yellowCardsByPlayer.get("p1")).toBe(2);
      expect(result.current.yellowCardsByPlayer.get("p2")).toBe(1);
      expect(result.current.yellowCardsByPlayer.size).toBe(2);
    });
  });

  describe("Group B — sentOffPlayerIds", () => {
    it("inclui jogadores com red_card directo", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            events: [
              createEvent({
                event_type: "red_card",
                player_id: "p1",
                minute: 45,
              }),
            ],
          }),
        ),
      );
      expect(result.current.sentOffPlayerIds.has("p1")).toBe(true);
    });

    it("inclui jogadores com 2 yellow_cards (cascade)", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            events: [
              createEvent({
                id: "y1",
                event_type: "yellow_card",
                player_id: "p1",
                minute: 10,
              }),
              createEvent({
                id: "y2",
                event_type: "yellow_card",
                player_id: "p1",
                minute: 50,
              }),
            ],
          }),
        ),
      );
      expect(result.current.sentOffPlayerIds.has("p1")).toBe(true);
    });

    it("não inclui opponent red_card events", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            events: [
              createEvent({
                event_type: "red_card",
                is_opponent_event: true,
                minute: 45,
              }),
            ],
          }),
        ),
      );
      expect(result.current.sentOffPlayerIds.size).toBe(0);
    });
  });

  describe("Group C — availability", () => {
    it("Em campo para isOnField=true não expulso", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            convocatedPlayers: [createPlayer({ id: "p1", isOnField: true })],
          }),
        ),
      );
      expect(result.current.getPlayerAvailability("p1")).toEqual({
        label: "Em campo",
        selectable: true,
      });
    });

    it("Banco para isOnField=false não expulso", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            convocatedPlayers: [createPlayer({ id: "p1", isOnField: false })],
          }),
        ),
      );
      expect(result.current.getPlayerAvailability("p1")).toEqual({
        label: "Banco",
        selectable: true,
      });
    });

    it("Expulso quando em sentOffPlayerIds", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            convocatedPlayers: [createPlayer({ id: "p1", isOnField: true })],
            events: [
              createEvent({
                event_type: "red_card",
                player_id: "p1",
                minute: 45,
              }),
            ],
          }),
        ),
      );
      expect(result.current.getPlayerAvailability("p1")).toEqual({
        label: "Expulso",
        selectable: false,
      });
    });

    it("getPlayerAvailability: null id retorna Banco selectable=false", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(createDefaultArgs()),
      );
      expect(result.current.getPlayerAvailability(null)).toEqual({
        label: "Banco",
        selectable: false,
      });
      expect(result.current.getPlayerAvailability(undefined)).toEqual({
        label: "Banco",
        selectable: false,
      });
    });

    it("getPlayerAvailability: id desconhecido retorna Banco selectable=false", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            convocatedPlayers: [createPlayer({ id: "p1" })],
          }),
        ),
      );
      expect(result.current.getPlayerAvailability("inexistente")).toEqual({
        label: "Banco",
        selectable: false,
      });
    });
  });

  describe("Group D — sorted lineups & flags", () => {
    it("playersOnField: ordena via comparePlayersByFootballPriority", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            convocatedPlayers: [
              createPlayer({
                id: "p10",
                jersey_number: 10,
                preferred_position: "AV",
                isOnField: true,
              }),
              createPlayer({
                id: "gr",
                jersey_number: 1,
                preferred_position: "GR",
                isOnField: true,
              }),
              createPlayer({
                id: "p3",
                jersey_number: 3,
                preferred_position: "DEF",
                isOnField: true,
              }),
            ],
          }),
        ),
      );
      // GR primeiro, depois os outros por jersey
      expect(result.current.playersOnField[0].id).toBe("gr");
    });

    it("playersOnField: exclui jogadores expulsos", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            convocatedPlayers: [
              createPlayer({ id: "p1", isOnField: true }),
              createPlayer({ id: "p2", isOnField: true }),
            ],
            events: [
              createEvent({
                event_type: "red_card",
                player_id: "p1",
                minute: 45,
              }),
            ],
          }),
        ),
      );
      const ids = result.current.playersOnField.map((p) => p.id);
      expect(ids).toEqual(["p2"]);
    });

    it("playersOnBench: inclui expulsos (bench geral)", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            convocatedPlayers: [
              createPlayer({ id: "p1", isOnField: false }),
              createPlayer({ id: "p2", isOnField: false }),
            ],
            events: [
              createEvent({
                event_type: "red_card",
                player_id: "p1",
                minute: 45,
              }),
            ],
          }),
        ),
      );
      const ids = result.current.playersOnBench.map((p) => p.id);
      expect(new Set(ids)).toEqual(new Set(["p1", "p2"]));
    });

    it("playersAvailableToEnter: exclui expulsos", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            convocatedPlayers: [
              createPlayer({ id: "p1", isOnField: false }),
              createPlayer({ id: "p2", isOnField: false }),
            ],
            events: [
              createEvent({
                event_type: "red_card",
                player_id: "p1",
                minute: 45,
              }),
            ],
          }),
        ),
      );
      expect(
        result.current.playersAvailableToEnter.map((p) => p.id),
      ).toEqual(["p2"]);
    });

    it("suspendedBenchPlayers: só expulsos no banco", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            convocatedPlayers: [
              createPlayer({ id: "p1", isOnField: false }),
              createPlayer({ id: "p2", isOnField: false }),
            ],
            events: [
              createEvent({
                event_type: "red_card",
                player_id: "p1",
                minute: 45,
              }),
            ],
          }),
        ),
      );
      expect(result.current.suspendedBenchPlayers.map((p) => p.id)).toEqual([
        "p1",
      ]);
    });

    it("hasExternalConvocatedPlayers: true quando há isExternal", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            convocatedPlayers: [
              createPlayer({ id: "p1" }),
              createPlayer({
                id: "ext-1",
                isExternal: true,
                externalConvocationId: "ec-1",
              }),
            ],
          }),
        ),
      );
      expect(result.current.hasExternalConvocatedPlayers).toBe(true);
    });

    it("hasExternalConvocatedPlayers: false sem externos", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            convocatedPlayers: [createPlayer({ id: "p1" })],
          }),
        ),
      );
      expect(result.current.hasExternalConvocatedPlayers).toBe(false);
    });

    it("kickoffState: deriva de playersOnField", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            convocatedPlayers: [createPlayer({ id: "p1", isOnField: true })],
          }),
        ),
      );
      expect(result.current.kickoffState).toHaveProperty("canStart");
      expect(result.current.kickoffState).toHaveProperty("reason");
    });
  });

  describe("Group E — phase predicates", () => {
    it("isLivePhase: true em first_half/second_half", () => {
      const fh = renderHook(() =>
        useLiveDerivedState(createDefaultArgs({ phase: "first_half" })),
      );
      const sh = renderHook(() =>
        useLiveDerivedState(createDefaultArgs({ phase: "second_half" })),
      );
      expect(fh.result.current.isLivePhase).toBe(true);
      expect(sh.result.current.isLivePhase).toBe(true);
    });

    it("isLivePhase: false em pre_match/halftime/review", () => {
      const pm = renderHook(() =>
        useLiveDerivedState(createDefaultArgs({ phase: "pre_match" })),
      );
      const ht = renderHook(() =>
        useLiveDerivedState(createDefaultArgs({ phase: "halftime" })),
      );
      const rv = renderHook(() =>
        useLiveDerivedState(createDefaultArgs({ phase: "review" })),
      );
      expect(pm.result.current.isLivePhase).toBe(false);
      expect(ht.result.current.isLivePhase).toBe(false);
      expect(rv.result.current.isLivePhase).toBe(false);
    });

    it("canRegisterEvents: true em first_half (live)", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(createDefaultArgs({ phase: "first_half" })),
      );
      expect(result.current.canRegisterEvents).toBe(true);
    });

    it("canRegisterEvents: false em halftime mesmo com clock parado", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            phase: "halftime",
            clockState: { baseSeconds: 2700, runningSinceMs: null },
          }),
        ),
      );
      expect(result.current.canRegisterEvents).toBe(false);
    });

    it("canRegisterSubstitutionOrCard: true em halftime", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            phase: "halftime",
            clockState: { baseSeconds: 2700, runningSinceMs: null },
          }),
        ),
      );
      expect(result.current.canRegisterSubstitutionOrCard).toBe(true);
    });

    it("canRegisterSubstitutionOrCard: false em pre_match", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(createDefaultArgs({ phase: "pre_match" })),
      );
      expect(result.current.canRegisterSubstitutionOrCard).toBe(false);
    });
  });

  describe("Group F — minutes & finalize support", () => {
    it("starterIds: usa initialStarterIds quando há", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            initialStarterIds: ["p1", "p2"],
            convocatedPlayers: [
              createPlayer({ id: "p1", isOnField: true }),
              createPlayer({ id: "p3", isOnField: true }),
            ],
          }),
        ),
      );
      expect(Array.from(result.current.starterIds)).toEqual(["p1", "p2"]);
    });

    it("starterIds: fallback para isOnField quando initialStarterIds vazio", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            initialStarterIds: [],
            convocatedPlayers: [
              createPlayer({ id: "p1", isOnField: true }),
              createPlayer({ id: "p2", isOnField: false }),
            ],
          }),
        ),
      );
      expect(Array.from(result.current.starterIds)).toEqual(["p1"]);
    });

    it("minuteForComputedStats: 0 em pre_match", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({ phase: "pre_match", currentMinute: 45 }),
        ),
      );
      expect(result.current.minuteForComputedStats).toBe(0);
    });

    it("minuteForComputedStats: max(1, currentMinute) em first_half", () => {
      const r1 = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({ phase: "first_half", currentMinute: 45 }),
        ),
      );
      const r2 = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({ phase: "first_half", currentMinute: 0 }),
        ),
      );
      expect(r1.result.current.minuteForComputedStats).toBe(45);
      expect(r2.result.current.minuteForComputedStats).toBe(1);
    });

    it("playersWhoPlayed: apenas com minutos > 0", () => {
      // starter joga, suplente que nunca entrou tem 0 minutos
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            phase: "first_half",
            currentMinute: 30,
            initialStarterIds: ["p1"],
            convocatedPlayers: [
              createPlayer({ id: "p1", isOnField: true }),
              createPlayer({ id: "p2", isOnField: false }),
            ],
          }),
        ),
      );
      const ids = result.current.playersWhoPlayed.map((p) => p.id);
      expect(ids).toContain("p1");
      expect(ids).not.toContain("p2");
    });

    it("concededGoalsByPlayer: conta goals do adversário com player_id (GR)", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            events: [
              createEvent({
                event_type: "goal",
                is_opponent_event: true,
                player_id: "gr",
                minute: 20,
              }),
              createEvent({
                id: "ev2",
                event_type: "goal",
                is_opponent_event: true,
                player_id: "gr",
                minute: 40,
              }),
            ],
          }),
        ),
      );
      expect(result.current.concededGoalsByPlayer.get("gr")).toBe(2);
    });

    it("concededGoalsByPlayer: ignora opponent goals sem player_id", () => {
      const { result } = renderHook(() =>
        useLiveDerivedState(
          createDefaultArgs({
            events: [
              createEvent({
                event_type: "goal",
                is_opponent_event: true,
                minute: 20,
              }),
            ],
          }),
        ),
      );
      expect(result.current.concededGoalsByPlayer.size).toBe(0);
    });
  });
});
