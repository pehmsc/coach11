import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { GameEvent } from "@/types/database";
import type {
  LivePlayer,
  PlayerAvailability,
} from "@/components/games/live/types";
import { useLiveEventModal } from "./useLiveEventModal";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const createEvent = (overrides: Partial<GameEvent> = {}): GameEvent => ({
  id: "evt-1",
  game_id: "game-1",
  event_type: "goal",
  minute: 1,
  is_opponent_event: false,
  created_at: "2026-05-21T10:00:00Z",
  ...overrides,
});

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

type ArgsOverrides = Partial<Parameters<typeof useLiveEventModal>[0]>;

function createDefaultArgs(overrides: ArgsOverrides = {}) {
  return {
    canRegisterEvents: true,
    canRegisterSubstitutionOrCard: true,
    currentMinute: 30,
    events: [] as GameEvent[],
    setEvents: vi.fn(),
    insertEventsToBackend: vi
      .fn<(input: unknown[]) => Promise<GameEvent[]>>()
      .mockResolvedValue([]),
    convocatedPlayers: [] as LivePlayer[],
    setConvocatedPlayers: vi.fn(),
    saveLivePlayerStatus: vi.fn().mockResolvedValue(undefined),
    syncConvocatedPlayersFromBackend: vi.fn().mockResolvedValue(undefined),
    getPlayerAvailability: vi.fn(
      (): PlayerAvailability => ({
        label: "Em campo",
        selectable: true,
      }),
    ),
    ...overrides,
  };
}

describe("useLiveEventModal", () => {
  describe("initial state", () => {
    it("all modal state starts null/scorer/false", () => {
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs()),
      );
      expect(result.current.modalType).toBeNull();
      expect(result.current.goalTeamSide).toBeNull();
      expect(result.current.goalKind).toBeNull();
      expect(result.current.goalStep).toBe("scorer");
      expect(result.current.selectedScorerID).toBeNull();
      expect(result.current.selectedAssistID).toBeNull();
      expect(result.current.selectedSubOutId).toBeNull();
      expect(result.current.selectedSubInId).toBeNull();
      expect(result.current.savingEvent).toBe(false);
    });
  });

  describe("openModal", () => {
    it("opens goal modal when canRegisterEvents=true", () => {
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs()),
      );
      act(() => result.current.openModal("goal"));
      expect(result.current.modalType).toBe("goal");
    });

    it("blocks goal modal when canRegisterEvents=false", () => {
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs({ canRegisterEvents: false })),
      );
      act(() => result.current.openModal("goal"));
      expect(result.current.modalType).toBeNull();
    });

    it("allows substitution when canRegisterSubstitutionOrCard=true and canRegisterEvents=false", () => {
      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            canRegisterEvents: false,
            canRegisterSubstitutionOrCard: true,
          }),
        ),
      );
      act(() => result.current.openModal("substitution"));
      expect(result.current.modalType).toBe("substitution");
    });

    it("blocks substitution when both flags false", () => {
      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            canRegisterEvents: false,
            canRegisterSubstitutionOrCard: false,
          }),
        ),
      );
      act(() => result.current.openModal("substitution"));
      expect(result.current.modalType).toBeNull();
    });

    it("resets all selections on open", () => {
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs()),
      );
      act(() => {
        result.current.setSelectedScorerID("dirty");
        result.current.setSelectedAssistID("dirty");
        result.current.setSelectedSubOutId("dirty");
        result.current.setSelectedSubInId("dirty");
        result.current.setGoalTeamSide("ours");
        result.current.setGoalKind("goal");
        result.current.setGoalStep("assist");
      });
      act(() => result.current.openModal("goal"));
      expect(result.current.selectedScorerID).toBeNull();
      expect(result.current.selectedAssistID).toBeNull();
      expect(result.current.selectedSubOutId).toBeNull();
      expect(result.current.selectedSubInId).toBeNull();
      expect(result.current.goalTeamSide).toBeNull();
      expect(result.current.goalKind).toBeNull();
      expect(result.current.goalStep).toBe("scorer");
    });
  });

  describe("closeModal", () => {
    it("resets all state", () => {
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs()),
      );
      act(() => result.current.openModal("goal"));
      act(() => result.current.setSelectedScorerID("p1"));
      act(() => result.current.closeModal());
      expect(result.current.modalType).toBeNull();
      expect(result.current.selectedScorerID).toBeNull();
    });
  });

  describe("availability effect", () => {
    it("clears selectedScorerID when availability becomes non-selectable", () => {
      const baseArgs = createDefaultArgs();
      type AvailabilityFn = (
        id: string | null | undefined,
      ) => PlayerAvailability;
      const okFn: AvailabilityFn = () => ({
        label: "Em campo",
        selectable: true,
      });
      const expelledFn: AvailabilityFn = () => ({
        label: "Expulso",
        selectable: false,
      });

      const { result, rerender } = renderHook(
        ({ availabilityFn }: { availabilityFn: AvailabilityFn }) =>
          useLiveEventModal({
            ...baseArgs,
            getPlayerAvailability: availabilityFn,
          }),
        { initialProps: { availabilityFn: okFn } },
      );
      act(() => result.current.openModal("goal"));
      act(() => result.current.setSelectedScorerID("p1"));

      rerender({ availabilityFn: expelledFn });

      expect(result.current.selectedScorerID).toBeNull();
    });

    it("clears selectedSubOutId when availability changes from Em campo", () => {
      const baseArgs = createDefaultArgs();
      type AvailabilityFn = (
        id: string | null | undefined,
      ) => PlayerAvailability;
      const onFieldFn: AvailabilityFn = () => ({
        label: "Em campo",
        selectable: true,
      });
      const bancoFn: AvailabilityFn = () => ({
        label: "Banco",
        selectable: true,
      });

      const { result, rerender } = renderHook(
        ({ availabilityFn }: { availabilityFn: AvailabilityFn }) =>
          useLiveEventModal({
            ...baseArgs,
            getPlayerAvailability: availabilityFn,
          }),
        { initialProps: { availabilityFn: onFieldFn } },
      );
      act(() => result.current.openModal("substitution"));
      act(() => result.current.setSelectedSubOutId("p1"));

      rerender({ availabilityFn: bancoFn });

      expect(result.current.selectedSubOutId).toBeNull();
    });

    it("does nothing when modalType is null", () => {
      const args = createDefaultArgs();
      const { result } = renderHook(() => useLiveEventModal(args));
      // Sem modal aberto: setar manualmente não dispara o cleanup
      act(() => result.current.setSelectedScorerID("p1"));
      expect(result.current.selectedScorerID).toBe("p1");
    });
  });

  describe("confirmGoal — ours/goal", () => {
    it("rejects when no scorer selected", async () => {
      const insertEventsToBackend = vi.fn().mockResolvedValue([]);
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs({ insertEventsToBackend })),
      );
      act(() => result.current.openModal("goal"));
      act(() => {
        result.current.setGoalTeamSide("ours");
        result.current.setGoalKind("goal");
      });
      await act(async () => {
        await result.current.confirmGoal();
      });
      expect(insertEventsToBackend).not.toHaveBeenCalled();
    });

    it("inserts event with scorer + optional assist", async () => {
      const insertEventsToBackend = vi
        .fn()
        .mockResolvedValue([createEvent({ event_type: "goal" })]);
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs({ insertEventsToBackend })),
      );
      act(() => result.current.openModal("goal"));
      act(() => {
        result.current.setGoalTeamSide("ours");
        result.current.setGoalKind("goal");
        result.current.setSelectedScorerID("p1");
        result.current.setSelectedAssistID("p2");
      });
      await act(async () => {
        await result.current.confirmGoal();
      });
      expect(insertEventsToBackend).toHaveBeenCalledWith([
        expect.objectContaining({
          event_type: "goal",
          player_id: "p1",
          related_player_id: "p2",
          is_opponent_event: false,
        }),
      ]);
    });

    it("closes modal on success", async () => {
      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            insertEventsToBackend: vi
              .fn()
              .mockResolvedValue([createEvent({ event_type: "goal" })]),
          }),
        ),
      );
      act(() => result.current.openModal("goal"));
      act(() => {
        result.current.setGoalTeamSide("ours");
        result.current.setGoalKind("goal");
        result.current.setSelectedScorerID("p1");
      });
      await act(async () => {
        await result.current.confirmGoal();
      });
      expect(result.current.modalType).toBeNull();
    });

    it("rejects expelled scorer", async () => {
      const insertEventsToBackend = vi.fn();
      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            insertEventsToBackend,
            getPlayerAvailability: vi.fn(
              (): PlayerAvailability => ({
                label: "Expulso",
                selectable: false,
              }),
            ),
          }),
        ),
      );
      act(() => result.current.openModal("goal"));
      // Setar selectedScorerID manualmente sem trigger do useEffect:
      // o effect só corre quando algum dos selecteds está set + modal aberto.
      // Vamos manipular a state directamente após abrir.
      act(() => {
        result.current.setGoalTeamSide("ours");
        result.current.setGoalKind("goal");
        result.current.setSelectedScorerID("p1");
      });
      // O useEffect deve ter limpado selectedScorerID — confirmGoal vai
      // entao falhar com "Seleciona o marcador".
      await act(async () => {
        await result.current.confirmGoal();
      });
      expect(insertEventsToBackend).not.toHaveBeenCalled();
    });
  });

  describe("confirmGoal — ours/own_goal", () => {
    it("inserts event without players", async () => {
      const insertEventsToBackend = vi
        .fn()
        .mockResolvedValue([createEvent({ event_type: "own_goal" })]);
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs({ insertEventsToBackend })),
      );
      act(() => result.current.openModal("goal"));
      act(() => {
        result.current.setGoalTeamSide("ours");
        result.current.setGoalKind("own_goal");
      });
      await act(async () => {
        await result.current.confirmGoal();
      });
      expect(insertEventsToBackend).toHaveBeenCalledWith([
        expect.objectContaining({
          event_type: "own_goal",
          player_id: null,
          related_player_id: null,
          is_opponent_event: true,
        }),
      ]);
    });
  });

  describe("confirmGoal — opponent/goal", () => {
    it("allows null player_id (optional GR association)", async () => {
      const insertEventsToBackend = vi
        .fn()
        .mockResolvedValue([createEvent({ event_type: "goal" })]);
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs({ insertEventsToBackend })),
      );
      act(() => result.current.openModal("goal"));
      act(() => {
        result.current.setGoalTeamSide("opponent");
        result.current.setGoalKind("goal");
      });
      await act(async () => {
        await result.current.confirmGoal();
      });
      expect(insertEventsToBackend).toHaveBeenCalledWith([
        expect.objectContaining({
          event_type: "goal",
          player_id: null,
          is_opponent_event: true,
        }),
      ]);
    });
  });

  describe("confirmGoal — opponent/own_goal", () => {
    it("requires selectedScorerID", async () => {
      const insertEventsToBackend = vi.fn();
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs({ insertEventsToBackend })),
      );
      act(() => result.current.openModal("goal"));
      act(() => {
        result.current.setGoalTeamSide("opponent");
        result.current.setGoalKind("own_goal");
      });
      await act(async () => {
        await result.current.confirmGoal();
      });
      expect(insertEventsToBackend).not.toHaveBeenCalled();
    });

    it("inserts event with player_id when set", async () => {
      const insertEventsToBackend = vi
        .fn()
        .mockResolvedValue([createEvent({ event_type: "own_goal" })]);
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs({ insertEventsToBackend })),
      );
      act(() => result.current.openModal("goal"));
      act(() => {
        result.current.setGoalTeamSide("opponent");
        result.current.setGoalKind("own_goal");
        result.current.setSelectedScorerID("p1");
      });
      await act(async () => {
        await result.current.confirmGoal();
      });
      expect(insertEventsToBackend).toHaveBeenCalledWith([
        expect.objectContaining({
          event_type: "own_goal",
          player_id: "p1",
          is_opponent_event: false,
        }),
      ]);
    });
  });

  describe("confirmGoal — penalty_goal", () => {
    it("rejects when modal aberto sem lado escolhido", async () => {
      const insertEventsToBackend = vi.fn();
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs({ insertEventsToBackend })),
      );
      act(() => result.current.openModal("penalty_goal"));
      await act(async () => {
        await result.current.confirmGoal();
      });
      expect(insertEventsToBackend).not.toHaveBeenCalled();
    });

    it("rejects ours penalty sem marcador", async () => {
      const insertEventsToBackend = vi.fn();
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs({ insertEventsToBackend })),
      );
      act(() => result.current.openModal("penalty_goal"));
      act(() => {
        result.current.setGoalTeamSide("ours");
      });
      await act(async () => {
        await result.current.confirmGoal();
      });
      expect(insertEventsToBackend).not.toHaveBeenCalled();
    });

    it("ours: grava event_type=penalty_goal sem assistência", async () => {
      const insertEventsToBackend = vi
        .fn()
        .mockResolvedValue([createEvent({ event_type: "penalty_goal" })]);
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs({ insertEventsToBackend })),
      );
      act(() => result.current.openModal("penalty_goal"));
      act(() => {
        result.current.setGoalTeamSide("ours");
        result.current.setSelectedScorerID("p1");
        // Mesmo que se tentasse marcar assistência, o fluxo do penálti
        // ignora-a e grava related_player_id=null.
        result.current.setSelectedAssistID("p2");
      });
      await act(async () => {
        await result.current.confirmGoal();
      });
      expect(insertEventsToBackend).toHaveBeenCalledWith([
        expect.objectContaining({
          event_type: "penalty_goal",
          player_id: "p1",
          related_player_id: null,
          is_opponent_event: false,
        }),
      ]);
    });

    it("opponent: grava penalty_goal com is_opponent_event=true e GR opcional", async () => {
      const insertEventsToBackend = vi
        .fn()
        .mockResolvedValue([createEvent({ event_type: "penalty_goal" })]);
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs({ insertEventsToBackend })),
      );
      act(() => result.current.openModal("penalty_goal"));
      act(() => {
        result.current.setGoalTeamSide("opponent");
        // GR não obrigatório — deixamos null
      });
      await act(async () => {
        await result.current.confirmGoal();
      });
      expect(insertEventsToBackend).toHaveBeenCalledWith([
        expect.objectContaining({
          event_type: "penalty_goal",
          player_id: null,
          related_player_id: null,
          is_opponent_event: true,
        }),
      ]);
    });
  });

  describe("confirmCard", () => {
    it("rejects when no scorer selected", async () => {
      const insertEventsToBackend = vi.fn();
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs({ insertEventsToBackend })),
      );
      await act(async () => {
        await result.current.confirmCard("yellow_card");
      });
      expect(insertEventsToBackend).not.toHaveBeenCalled();
    });

    it("inserts single yellow_card event", async () => {
      const insertEventsToBackend = vi
        .fn()
        .mockResolvedValue([createEvent({ event_type: "yellow_card" })]);
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs({ insertEventsToBackend })),
      );
      act(() => result.current.setSelectedScorerID("p1"));
      await act(async () => {
        await result.current.confirmCard("yellow_card");
      });
      expect(insertEventsToBackend).toHaveBeenCalledWith([
        expect.objectContaining({
          event_type: "yellow_card",
          player_id: "p1",
        }),
      ]);
    });

    it("auto-inserts red_card on 2nd yellow", async () => {
      const existingYellow = createEvent({
        id: "y1",
        event_type: "yellow_card",
        player_id: "p1",
        minute: 20,
      });
      const insertEventsToBackend = vi.fn().mockResolvedValue([
        createEvent({ id: "y2", event_type: "yellow_card", minute: 45 }),
        createEvent({ id: "r1", event_type: "red_card", minute: 45 }),
      ]);
      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            events: [existingYellow],
            insertEventsToBackend,
            convocatedPlayers: [createPlayer({ id: "p1", isOnField: true })],
          }),
        ),
      );
      act(() => result.current.setSelectedScorerID("p1"));
      await act(async () => {
        await result.current.confirmCard("yellow_card");
      });
      expect(insertEventsToBackend).toHaveBeenCalledWith([
        expect.objectContaining({ event_type: "yellow_card" }),
        expect.objectContaining({ event_type: "red_card" }),
      ]);
    });

    it("does NOT auto-red when already has red", async () => {
      const existingYellow = createEvent({
        id: "y1",
        event_type: "yellow_card",
        player_id: "p1",
        minute: 20,
      });
      const existingRed = createEvent({
        id: "r1",
        event_type: "red_card",
        player_id: "p1",
        minute: 30,
      });
      const insertEventsToBackend = vi
        .fn()
        .mockResolvedValue([createEvent({ id: "y2", event_type: "yellow_card" })]);
      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            events: [existingYellow, existingRed],
            insertEventsToBackend,
          }),
        ),
      );
      act(() => result.current.setSelectedScorerID("p1"));
      await act(async () => {
        await result.current.confirmCard("yellow_card");
      });
      const call = insertEventsToBackend.mock.calls[0][0] as Array<{
        event_type: string;
      }>;
      expect(call).toHaveLength(1);
      expect(call[0].event_type).toBe("yellow_card");
    });

    it("calls applySendOff (setConvocatedPlayers + saveLivePlayerStatus) on red", async () => {
      const insertEventsToBackend = vi
        .fn()
        .mockResolvedValue([createEvent({ event_type: "red_card" })]);
      const setConvocatedPlayers = vi.fn();
      const saveLivePlayerStatus = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            insertEventsToBackend,
            setConvocatedPlayers,
            saveLivePlayerStatus,
            convocatedPlayers: [createPlayer({ id: "p1", isOnField: true })],
          }),
        ),
      );
      act(() => result.current.setSelectedScorerID("p1"));
      await act(async () => {
        await result.current.confirmCard("red_card");
      });
      expect(setConvocatedPlayers).toHaveBeenCalled();
      expect(saveLivePlayerStatus).toHaveBeenCalledWith(
        "p1",
        "substitute",
        expect.objectContaining({ endMinute: 30 }),
      );
    });
  });

  describe("confirmSubstitution", () => {
    it("rejects when ids not set", async () => {
      const insertEventsToBackend = vi.fn();
      const { result } = renderHook(() =>
        useLiveEventModal(createDefaultArgs({ insertEventsToBackend })),
      );
      await act(async () => {
        await result.current.confirmSubstitution();
      });
      expect(insertEventsToBackend).not.toHaveBeenCalled();
    });

    it("rejects when sub_out not Em campo", async () => {
      const insertEventsToBackend = vi.fn();
      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            insertEventsToBackend,
            getPlayerAvailability: vi.fn(
              (id: string | null | undefined): PlayerAvailability =>
                id === "out-id"
                  ? { label: "Banco", selectable: true }
                  : { label: "Banco", selectable: true },
            ),
          }),
        ),
      );
      act(() => {
        result.current.setSelectedSubOutId("out-id");
        result.current.setSelectedSubInId("in-id");
      });
      await act(async () => {
        await result.current.confirmSubstitution();
      });
      expect(insertEventsToBackend).not.toHaveBeenCalled();
    });

    it("inserts paired substitution events", async () => {
      const insertEventsToBackend = vi.fn().mockResolvedValue([
        createEvent({ id: "so", event_type: "substitution_out" }),
        createEvent({ id: "si", event_type: "substitution_in" }),
      ]);
      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            insertEventsToBackend,
            getPlayerAvailability: vi.fn(
              (id: string | null | undefined): PlayerAvailability =>
                id === "out-id"
                  ? { label: "Em campo", selectable: true }
                  : { label: "Banco", selectable: true },
            ),
          }),
        ),
      );
      act(() => {
        result.current.setSelectedSubOutId("out-id");
        result.current.setSelectedSubInId("in-id");
      });
      await act(async () => {
        await result.current.confirmSubstitution();
      });
      expect(insertEventsToBackend).toHaveBeenCalledWith([
        expect.objectContaining({
          event_type: "substitution_out",
          player_id: "out-id",
          related_player_id: "in-id",
        }),
        expect.objectContaining({
          event_type: "substitution_in",
          player_id: "in-id",
          related_player_id: "out-id",
        }),
      ]);
    });

    it("calls saveLivePlayerStatus for both players", async () => {
      const insertEventsToBackend = vi.fn().mockResolvedValue([
        createEvent({ id: "so", event_type: "substitution_out" }),
        createEvent({ id: "si", event_type: "substitution_in" }),
      ]);
      const saveLivePlayerStatus = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            insertEventsToBackend,
            saveLivePlayerStatus,
            getPlayerAvailability: vi.fn(
              (id: string | null | undefined): PlayerAvailability =>
                id === "out-id"
                  ? { label: "Em campo", selectable: true }
                  : { label: "Banco", selectable: true },
            ),
          }),
        ),
      );
      act(() => {
        result.current.setSelectedSubOutId("out-id");
        result.current.setSelectedSubInId("in-id");
      });
      await act(async () => {
        await result.current.confirmSubstitution();
      });
      expect(saveLivePlayerStatus).toHaveBeenCalledWith(
        "out-id",
        "substitute",
        expect.objectContaining({ endMinute: 30 }),
      );
      expect(saveLivePlayerStatus).toHaveBeenCalledWith(
        "in-id",
        "on_field",
        expect.objectContaining({ startMinute: 30 }),
      );
    });

    it("calls syncConvocatedPlayersFromBackend after success", async () => {
      const syncConvocatedPlayersFromBackend = vi
        .fn()
        .mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            insertEventsToBackend: vi.fn().mockResolvedValue([
              createEvent({ id: "so", event_type: "substitution_out" }),
              createEvent({ id: "si", event_type: "substitution_in" }),
            ]),
            syncConvocatedPlayersFromBackend,
            getPlayerAvailability: vi.fn(
              (id: string | null | undefined): PlayerAvailability =>
                id === "out-id"
                  ? { label: "Em campo", selectable: true }
                  : { label: "Banco", selectable: true },
            ),
          }),
        ),
      );
      act(() => {
        result.current.setSelectedSubOutId("out-id");
        result.current.setSelectedSubInId("in-id");
      });
      await act(async () => {
        await result.current.confirmSubstitution();
      });
      expect(syncConvocatedPlayersFromBackend).toHaveBeenCalled();
    });

    it("aborts cleanly when insert fails", async () => {
      const insertEventsToBackend = vi
        .fn()
        .mockRejectedValue(new Error("live_events_insert_failed"));
      const saveLivePlayerStatus = vi.fn();
      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            insertEventsToBackend,
            saveLivePlayerStatus,
            getPlayerAvailability: vi.fn(
              (id: string | null | undefined): PlayerAvailability =>
                id === "out-id"
                  ? { label: "Em campo", selectable: true }
                  : { label: "Banco", selectable: true },
            ),
          }),
        ),
      );
      act(() => {
        result.current.setSelectedSubOutId("out-id");
        result.current.setSelectedSubInId("in-id");
      });
      await act(async () => {
        await result.current.confirmSubstitution();
      });
      expect(saveLivePlayerStatus).not.toHaveBeenCalled();
      expect(result.current.savingEvent).toBe(false);
    });
  });

  describe("clamp de currentMinute corrupto (#Z5)", () => {
    // Defesa em profundidade: se useLiveClock estiver hidratado a partir
    // de runningSinceMs antigo (tab fechada horas antes), currentMinute
    // pode chegar a milhares. Antes de Z5 isto gravava lixo em
    // game_stats_live.start_minute/end_minute (vistos 1408, 2011).

    it("confirmSubstitution clampa currentMinute > 200 para null", async () => {
      const saveLivePlayerStatus = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            currentMinute: 1408,
            saveLivePlayerStatus,
            insertEventsToBackend: vi.fn().mockResolvedValue([
              createEvent({ id: "so", event_type: "substitution_out" }),
              createEvent({ id: "si", event_type: "substitution_in" }),
            ]),
            getPlayerAvailability: vi.fn(
              (id: string | null | undefined): PlayerAvailability =>
                id === "out-id"
                  ? { label: "Em campo", selectable: true }
                  : { label: "Banco", selectable: true },
            ),
          }),
        ),
      );
      act(() => {
        result.current.setSelectedSubOutId("out-id");
        result.current.setSelectedSubInId("in-id");
      });
      await act(async () => {
        await result.current.confirmSubstitution();
      });

      expect(saveLivePlayerStatus).toHaveBeenCalledWith(
        "out-id",
        "substitute",
        expect.objectContaining({ endMinute: null }),
      );
      expect(saveLivePlayerStatus).toHaveBeenCalledWith(
        "in-id",
        "on_field",
        expect.objectContaining({ startMinute: null, endMinute: null }),
      );
    });

    it("confirmSubstitution preserva currentMinute valido", async () => {
      const saveLivePlayerStatus = vi.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            currentMinute: 45,
            saveLivePlayerStatus,
            insertEventsToBackend: vi.fn().mockResolvedValue([
              createEvent({ id: "so", event_type: "substitution_out" }),
              createEvent({ id: "si", event_type: "substitution_in" }),
            ]),
            getPlayerAvailability: vi.fn(
              (id: string | null | undefined): PlayerAvailability =>
                id === "out-id"
                  ? { label: "Em campo", selectable: true }
                  : { label: "Banco", selectable: true },
            ),
          }),
        ),
      );
      act(() => {
        result.current.setSelectedSubOutId("out-id");
        result.current.setSelectedSubInId("in-id");
      });
      await act(async () => {
        await result.current.confirmSubstitution();
      });

      expect(saveLivePlayerStatus).toHaveBeenCalledWith(
        "out-id",
        "substitute",
        expect.objectContaining({ endMinute: 45 }),
      );
      expect(saveLivePlayerStatus).toHaveBeenCalledWith(
        "in-id",
        "on_field",
        expect.objectContaining({ startMinute: 45, endMinute: null }),
      );
    });

    it("applySendOff (via cascade yellow->red) clampa currentMinute corrupto", async () => {
      // Setup: jogador com 1 yellow existente, levanta 2o yellow.
      // Cascade gera red automatico -> applySendOff chamado internamente.
      const existingYellow = createEvent({
        id: "y1",
        event_type: "yellow_card",
        player_id: "p1",
        minute: 20,
      });
      const saveLivePlayerStatus = vi.fn().mockResolvedValue(undefined);
      const insertEventsToBackend = vi.fn().mockResolvedValue([
        createEvent({ id: "y2", event_type: "yellow_card", minute: 45 }),
        createEvent({ id: "r1", event_type: "red_card", minute: 45 }),
      ]);

      const { result } = renderHook(() =>
        useLiveEventModal(
          createDefaultArgs({
            currentMinute: 2011,
            events: [existingYellow],
            insertEventsToBackend,
            saveLivePlayerStatus,
            convocatedPlayers: [createPlayer({ id: "p1", isOnField: true })],
          }),
        ),
      );
      act(() => result.current.setSelectedScorerID("p1"));
      await act(async () => {
        await result.current.confirmCard("yellow_card");
      });

      // applySendOff chamado com endMinute clampado (null em vez de 2011)
      expect(saveLivePlayerStatus).toHaveBeenCalledWith(
        "p1",
        "substitute",
        expect.objectContaining({ endMinute: null }),
      );
    });
  });
});
