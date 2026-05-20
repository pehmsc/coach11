import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { GameEvent } from "@/types/database";
import type { LivePlayer, LiveStatus } from "@/components/games/live/types";
import { useLiveEvents } from "./useLiveEvents";

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
  id: "player-1",
  age_group_id: "ag-1",
  first_name: "Test",
  last_name: "Player",
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  isOnField: false,
  isInitialBench: true,
  ...overrides,
});

type SaveStatusFn = (
  playerId: string,
  status: LiveStatus,
  options?: { startMinute?: number | null; endMinute?: number | null },
) => Promise<void>;

interface DefaultArgs {
  id: string;
  currentMinute: number;
  convocatedPlayers: LivePlayer[];
  initialStarterIds: string[];
  setConvocatedPlayers: ReturnType<typeof vi.fn>;
  saveLivePlayerStatus: ReturnType<typeof vi.fn>;
}

let fetchMock: ReturnType<typeof vi.fn>;
let defaultArgs: DefaultArgs;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ events: [] }),
  });
  global.fetch = fetchMock as unknown as typeof global.fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
  defaultArgs = {
    id: "game-1",
    currentMinute: 30,
    convocatedPlayers: [],
    initialStarterIds: [],
    setConvocatedPlayers: vi.fn(),
    saveLivePlayerStatus: vi.fn<SaveStatusFn>().mockResolvedValue(undefined),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLiveEvents", () => {
  describe("initial state", () => {
    it("starts with empty events array", () => {
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      expect(result.current.events).toEqual([]);
    });

    it("cascadeDeleteIds starts null", () => {
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      expect(result.current.cascadeDeleteIds).toBeNull();
    });
  });

  describe("loadEventsFromBackend", () => {
    it("fetches GET /api/games/:id/live/events", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ events: [createEvent()] }),
      });
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      await act(async () => {
        await result.current.loadEventsFromBackend();
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/games/game-1/live/events",
        { cache: "no-store" },
      );
    });

    it("returns events array on success", async () => {
      const event = createEvent({ id: "x1" });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ events: [event] }),
      });
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      const loaded = await result.current.loadEventsFromBackend();
      expect(loaded).toEqual([event]);
    });

    it("throws on non-ok response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      await expect(result.current.loadEventsFromBackend()).rejects.toThrow(
        "live_events_load_failed",
      );
    });
  });

  describe("insertEventsToBackend", () => {
    it("POSTs LiveEventInput[] to /api/games/:id/live/events", async () => {
      const event = createEvent({ id: "ins-1" });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ events: [event] }),
      });
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      await act(async () => {
        await result.current.insertEventsToBackend([
          { event_type: "goal", minute: 1, is_opponent_event: false },
        ]);
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/games/game-1/live/events",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("returns inserted events array on success", async () => {
      const event = createEvent({ id: "ins-2" });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ events: [event] }),
      });
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      const inserted = await result.current.insertEventsToBackend([
        { event_type: "goal", minute: 1, is_opponent_event: false },
      ]);
      expect(inserted).toEqual([event]);
    });

    it("throws with custom error message from payload", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "custom_error" }),
      });
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      await expect(
        result.current.insertEventsToBackend([
          { event_type: "goal", minute: 1, is_opponent_event: false },
        ]),
      ).rejects.toThrow("custom_error");
    });
  });

  describe("deleteEventsFromBackend", () => {
    it("DELETEs to /api/games/:id/live/events with eventIds", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      await act(async () => {
        await result.current.deleteEventsFromBackend(["x1", "x2"]);
      });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/games/game-1/live/events",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ eventIds: ["x1", "x2"] }),
        }),
      );
    });

    it("throws on non-ok response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "delete_failed" }),
      });
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      await expect(
        result.current.deleteEventsFromBackend(["x1"]),
      ).rejects.toThrow("delete_failed");
    });
  });

  describe("deleteEvent — paired substitutions", () => {
    it("auto-deletes paired substitution_in when deleting substitution_out", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const subOut = createEvent({
        id: "so-1",
        event_type: "substitution_out",
        player_id: "p1",
        related_player_id: "p2",
        minute: 30,
      });
      const subIn = createEvent({
        id: "si-1",
        event_type: "substitution_in",
        player_id: "p2",
        related_player_id: "p1",
        minute: 30,
      });

      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      act(() => result.current.setEvents([subOut, subIn]));
      await act(async () => {
        await result.current.deleteEvent("so-1");
      });

      const deleteCall = fetchMock.mock.calls.find(
        (call) =>
          typeof call[1] === "object" &&
          call[1] !== null &&
          "method" in call[1] &&
          call[1].method === "DELETE",
      );
      expect(deleteCall).toBeDefined();
      const body = JSON.parse((deleteCall![1] as { body: string }).body);
      expect(new Set(body.eventIds)).toEqual(new Set(["so-1", "si-1"]));
    });

    it("auto-deletes paired substitution_out when deleting substitution_in", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const subOut = createEvent({
        id: "so-1",
        event_type: "substitution_out",
        player_id: "p1",
        related_player_id: "p2",
        minute: 30,
      });
      const subIn = createEvent({
        id: "si-1",
        event_type: "substitution_in",
        player_id: "p2",
        related_player_id: "p1",
        minute: 30,
      });

      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      act(() => result.current.setEvents([subOut, subIn]));
      await act(async () => {
        await result.current.deleteEvent("si-1");
      });

      const deleteCall = fetchMock.mock.calls.find(
        (call) =>
          typeof call[1] === "object" &&
          call[1] !== null &&
          "method" in call[1] &&
          call[1].method === "DELETE",
      );
      const body = JSON.parse((deleteCall![1] as { body: string }).body);
      expect(new Set(body.eventIds)).toEqual(new Set(["so-1", "si-1"]));
    });

    it("deletes single event when no pair exists", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const goal = createEvent({
        id: "g-1",
        event_type: "goal",
        player_id: "p1",
        minute: 30,
      });

      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      act(() => result.current.setEvents([goal]));
      await act(async () => {
        await result.current.deleteEvent("g-1");
      });

      const deleteCall = fetchMock.mock.calls.find(
        (call) =>
          typeof call[1] === "object" &&
          call[1] !== null &&
          "method" in call[1] &&
          call[1].method === "DELETE",
      );
      const body = JSON.parse((deleteCall![1] as { body: string }).body);
      expect(body.eventIds).toEqual(["g-1"]);
    });
  });

  describe("deleteEvent — yellow cascade", () => {
    const yellow1 = createEvent({
      id: "y1",
      event_type: "yellow_card",
      player_id: "p1",
      minute: 20,
      created_at: "2026-05-21T10:00:00Z",
    });
    const yellow2 = createEvent({
      id: "y2",
      event_type: "yellow_card",
      player_id: "p1",
      minute: 45,
      created_at: "2026-05-21T10:25:00Z",
    });
    const red = createEvent({
      id: "r1",
      event_type: "red_card",
      player_id: "p1",
      minute: 45,
      created_at: "2026-05-21T10:25:01Z",
    });

    it("triggers cascade when deleting 1st yellow with 2nd+red present", async () => {
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      act(() => result.current.setEvents([yellow1, yellow2, red]));
      await act(async () => {
        await result.current.deleteEvent("y1");
      });
      expect(result.current.cascadeDeleteIds).toEqual(["r1", "y2", "y1"]);
      // Não apagou ainda — espera confirmação
      const deleteCall = fetchMock.mock.calls.find(
        (call) =>
          typeof call[1] === "object" &&
          call[1] !== null &&
          "method" in call[1] &&
          call[1].method === "DELETE",
      );
      expect(deleteCall).toBeUndefined();
    });

    it("does NOT trigger cascade for 2nd yellow (only 1st triggers)", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      act(() => result.current.setEvents([yellow1, yellow2, red]));
      await act(async () => {
        await result.current.deleteEvent("y2");
      });
      expect(result.current.cascadeDeleteIds).toBeNull();
      // Apaga directamente
      const deleteCall = fetchMock.mock.calls.find(
        (call) =>
          typeof call[1] === "object" &&
          call[1] !== null &&
          "method" in call[1] &&
          call[1].method === "DELETE",
      );
      expect(deleteCall).toBeDefined();
    });

    it("does NOT trigger cascade for opponent yellow", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const opponentYellow = createEvent({
        id: "oy1",
        event_type: "yellow_card",
        is_opponent_event: true,
        minute: 20,
      });
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      act(() => result.current.setEvents([opponentYellow]));
      await act(async () => {
        await result.current.deleteEvent("oy1");
      });
      expect(result.current.cascadeDeleteIds).toBeNull();
    });

    it("does NOT trigger cascade when only 1 yellow exists", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      act(() => result.current.setEvents([yellow1]));
      await act(async () => {
        await result.current.deleteEvent("y1");
      });
      expect(result.current.cascadeDeleteIds).toBeNull();
    });
  });

  describe("deleteEvent — noop cases", () => {
    it("noop when event id not found", async () => {
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      await act(async () => {
        await result.current.deleteEvent("inexistente");
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.cascadeDeleteIds).toBeNull();
    });
  });

  describe("confirmCascadeDelete", () => {
    it("deletes all cascade ids after confirmation", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const yellow1 = createEvent({
        id: "y1",
        event_type: "yellow_card",
        player_id: "p1",
        minute: 20,
        created_at: "2026-05-21T10:00:00Z",
      });
      const yellow2 = createEvent({
        id: "y2",
        event_type: "yellow_card",
        player_id: "p1",
        minute: 45,
        created_at: "2026-05-21T10:25:00Z",
      });
      const red = createEvent({
        id: "r1",
        event_type: "red_card",
        player_id: "p1",
        minute: 45,
        created_at: "2026-05-21T10:25:01Z",
      });
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      act(() => result.current.setEvents([yellow1, yellow2, red]));
      await act(async () => {
        await result.current.deleteEvent("y1");
      });
      // cascade detected
      expect(result.current.cascadeDeleteIds).toEqual(["r1", "y2", "y1"]);
      await act(async () => {
        await result.current.confirmCascadeDelete();
      });
      const deleteCall = fetchMock.mock.calls.find(
        (call) =>
          typeof call[1] === "object" &&
          call[1] !== null &&
          "method" in call[1] &&
          call[1].method === "DELETE",
      );
      expect(deleteCall).toBeDefined();
      const body = JSON.parse((deleteCall![1] as { body: string }).body);
      expect(new Set(body.eventIds)).toEqual(new Set(["r1", "y2", "y1"]));
    });

    it("clears cascadeDeleteIds after delete", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const yellow1 = createEvent({
        id: "y1",
        event_type: "yellow_card",
        player_id: "p1",
        minute: 20,
        created_at: "2026-05-21T10:00:00Z",
      });
      const yellow2 = createEvent({
        id: "y2",
        event_type: "yellow_card",
        player_id: "p1",
        minute: 45,
        created_at: "2026-05-21T10:25:00Z",
      });
      const red = createEvent({
        id: "r1",
        event_type: "red_card",
        player_id: "p1",
        minute: 45,
        created_at: "2026-05-21T10:25:01Z",
      });
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      act(() => result.current.setEvents([yellow1, yellow2, red]));
      await act(async () => {
        await result.current.deleteEvent("y1");
      });
      await act(async () => {
        await result.current.confirmCascadeDelete();
      });
      expect(result.current.cascadeDeleteIds).toBeNull();
    });

    it("noop when cascadeDeleteIds is null", async () => {
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      await act(async () => {
        await result.current.confirmCascadeDelete();
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("cancelCascadeDelete", () => {
    it("clears cascadeDeleteIds without delete", async () => {
      const yellow1 = createEvent({
        id: "y1",
        event_type: "yellow_card",
        player_id: "p1",
        minute: 20,
        created_at: "2026-05-21T10:00:00Z",
      });
      const yellow2 = createEvent({
        id: "y2",
        event_type: "yellow_card",
        player_id: "p1",
        minute: 45,
        created_at: "2026-05-21T10:25:00Z",
      });
      const red = createEvent({
        id: "r1",
        event_type: "red_card",
        player_id: "p1",
        minute: 45,
        created_at: "2026-05-21T10:25:01Z",
      });
      const { result } = renderHook(() => useLiveEvents(defaultArgs));
      act(() => result.current.setEvents([yellow1, yellow2, red]));
      await act(async () => {
        await result.current.deleteEvent("y1");
      });
      expect(result.current.cascadeDeleteIds).not.toBeNull();

      act(() => result.current.cancelCascadeDelete());

      expect(result.current.cascadeDeleteIds).toBeNull();
      const deleteCall = fetchMock.mock.calls.find(
        (call) =>
          typeof call[1] === "object" &&
          call[1] !== null &&
          "method" in call[1] &&
          call[1].method === "DELETE",
      );
      expect(deleteCall).toBeUndefined();
    });
  });

  describe("performDelete — isOnField reconstruction", () => {
    it("calls setConvocatedPlayers to reconstruct isOnField after delete", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const setConvocatedPlayersMock = vi.fn();
      const subOut = createEvent({
        id: "so-1",
        event_type: "substitution_out",
        player_id: "p1",
        related_player_id: "p2",
        minute: 30,
      });
      const subIn = createEvent({
        id: "si-1",
        event_type: "substitution_in",
        player_id: "p2",
        related_player_id: "p1",
        minute: 30,
      });

      const { result } = renderHook(() =>
        useLiveEvents({
          ...defaultArgs,
          convocatedPlayers: [
            createPlayer({ id: "p1", isOnField: false }),
            createPlayer({ id: "p2", isOnField: true }),
          ],
          initialStarterIds: ["p1"],
          setConvocatedPlayers: setConvocatedPlayersMock,
        }),
      );
      act(() => result.current.setEvents([subOut, subIn]));
      await act(async () => {
        await result.current.deleteEvent("so-1");
      });

      expect(setConvocatedPlayersMock).toHaveBeenCalled();
    });

    it("calls saveLivePlayerStatus for affected players after delete", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const saveLivePlayerStatusMock = vi
        .fn<SaveStatusFn>()
        .mockResolvedValue(undefined);
      const subOut = createEvent({
        id: "so-1",
        event_type: "substitution_out",
        player_id: "p1",
        related_player_id: "p2",
        minute: 30,
      });
      const subIn = createEvent({
        id: "si-1",
        event_type: "substitution_in",
        player_id: "p2",
        related_player_id: "p1",
        minute: 30,
      });

      // setConvocatedPlayers precisa de invocar o updater para que
      // playersToSyncToServer fique populado.
      const setConvocatedPlayersMock = vi.fn(
        (updater: unknown) => {
          if (typeof updater === "function") {
            (updater as (prev: LivePlayer[]) => LivePlayer[])([
              createPlayer({ id: "p1", isOnField: false }),
              createPlayer({ id: "p2", isOnField: true }),
            ]);
          }
        },
      );

      const { result } = renderHook(() =>
        useLiveEvents({
          ...defaultArgs,
          convocatedPlayers: [
            createPlayer({ id: "p1", isOnField: false }),
            createPlayer({ id: "p2", isOnField: true }),
          ],
          initialStarterIds: ["p1"],
          setConvocatedPlayers: setConvocatedPlayersMock,
          saveLivePlayerStatus: saveLivePlayerStatusMock,
        }),
      );
      act(() => result.current.setEvents([subOut, subIn]));
      await act(async () => {
        await result.current.deleteEvent("so-1");
      });

      expect(saveLivePlayerStatusMock).toHaveBeenCalled();
    });

    it("does not call backend save when no events touch player keys", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const saveLivePlayerStatusMock = vi
        .fn<SaveStatusFn>()
        .mockResolvedValue(undefined);
      const opponentGoal = createEvent({
        id: "og-1",
        event_type: "goal",
        is_opponent_event: true,
        minute: 30,
      });
      const { result } = renderHook(() =>
        useLiveEvents({
          ...defaultArgs,
          saveLivePlayerStatus: saveLivePlayerStatusMock,
        }),
      );
      act(() => result.current.setEvents([opponentGoal]));
      await act(async () => {
        await result.current.deleteEvent("og-1");
      });
      expect(saveLivePlayerStatusMock).not.toHaveBeenCalled();
    });
  });
});
