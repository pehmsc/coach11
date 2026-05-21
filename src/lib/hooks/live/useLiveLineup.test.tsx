import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { LivePlayer, MatchPhase } from "@/components/games/live/types";
import { useLiveLineup } from "./useLiveLineup";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

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

let fetchMock: ReturnType<typeof vi.fn>;
const defaultArgs = {
  id: "game-1",
  phase: "pre_match" as MatchPhase,
};

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
  });
  global.fetch = fetchMock as unknown as typeof global.fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLiveLineup", () => {
  describe("initial state", () => {
    it("starts with empty convocatedPlayers", () => {
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      expect(result.current.convocatedPlayers).toEqual([]);
    });

    it("starts with empty initialStarterIds", () => {
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      expect(result.current.initialStarterIds).toEqual([]);
    });

    it("savingLineup starts null", () => {
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      expect(result.current.savingLineup).toBeNull();
    });
  });

  describe("saveLivePlayerStatus", () => {
    it("POSTs to /api/games/:id/live/players with player update", async () => {
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      act(() =>
        result.current.setConvocatedPlayers([createPlayer({ id: "p1" })]),
      );

      await act(async () => {
        await result.current.saveLivePlayerStatus("p1", "on_field");
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/games/game-1/live/players",
        expect.objectContaining({ method: "POST" }),
      );
      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as { body: string }).body,
      );
      expect(body.updates[0]).toMatchObject({
        playerId: "p1",
        status: "on_field",
      });
    });

    it("includes startMinute and endMinute when provided", async () => {
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      act(() =>
        result.current.setConvocatedPlayers([createPlayer({ id: "p1" })]),
      );

      await act(async () => {
        await result.current.saveLivePlayerStatus("p1", "substitute", {
          startMinute: 0,
          endMinute: 30,
        });
      });

      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as { body: string }).body,
      );
      expect(body.updates[0].startMinute).toBe(0);
      expect(body.updates[0].endMinute).toBe(30);
    });

    it("throws on non-ok response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "save_failed" }),
      });
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      act(() =>
        result.current.setConvocatedPlayers([createPlayer({ id: "p1" })]),
      );

      await expect(
        act(async () => {
          await result.current.saveLivePlayerStatus("p1", "on_field");
        }),
      ).rejects.toThrow("save_failed");
    });

    it("is no-op for external players (does not fetch)", async () => {
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      act(() =>
        result.current.setConvocatedPlayers([
          createPlayer({
            id: "ext-1",
            isExternal: true,
            externalConvocationId: "ec-1",
          }),
        ]),
      );

      await act(async () => {
        await result.current.saveLivePlayerStatus("ext-1", "substitute");
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("syncConvocatedPlayersFromBackend", () => {
    it("fetches GET /api/games/:id/convocation", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ players: [] }),
      });
      const { result } = renderHook(() => useLiveLineup(defaultArgs));

      await act(async () => {
        await result.current.syncConvocatedPlayersFromBackend();
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/games/game-1/convocation",
        { cache: "no-store" },
      );
    });

    it("updates convocatedPlayers with isOnField/isInitialBench from lineupStatuses", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            {
              id: "p1",
              age_group_id: "ag-1",
              first_name: "Alice",
              last_name: "Costa",
              status: "active",
              created_at: "2026-01-01T00:00:00Z",
              isConvocated: true,
            },
            {
              id: "p2",
              age_group_id: "ag-1",
              first_name: "Bruno",
              last_name: "Dias",
              status: "active",
              created_at: "2026-01-01T00:00:00Z",
              isConvocated: true,
            },
          ],
          lineupStatuses: {
            p1: "on_field",
            p2: "substitute",
          },
        }),
      });
      const { result } = renderHook(() => useLiveLineup(defaultArgs));

      await act(async () => {
        await result.current.syncConvocatedPlayersFromBackend();
      });

      const players = result.current.convocatedPlayers;
      expect(players.find((p) => p.id === "p1")?.isOnField).toBe(true);
      expect(players.find((p) => p.id === "p2")?.isOnField).toBe(false);
      expect(players.find((p) => p.id === "p2")?.isInitialBench).toBe(true);
    });

    it("uses starterIds from backend when present", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            {
              id: "p1",
              age_group_id: "ag-1",
              first_name: "Alice",
              last_name: "Costa",
              status: "active",
              created_at: "2026-01-01T00:00:00Z",
              isConvocated: true,
            },
          ],
          lineupStatuses: { p1: "on_field" },
          starterIds: ["p1", "p2", "p3"],
        }),
      });
      const { result } = renderHook(() => useLiveLineup(defaultArgs));

      await act(async () => {
        await result.current.syncConvocatedPlayersFromBackend();
      });

      expect(result.current.initialStarterIds).toEqual(["p1", "p2", "p3"]);
    });

    it("falls back to onFieldIds when starterIds is empty and phase=pre_match", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          players: [
            {
              id: "p1",
              age_group_id: "ag-1",
              first_name: "Alice",
              last_name: "Costa",
              status: "active",
              created_at: "2026-01-01T00:00:00Z",
              isConvocated: true,
            },
          ],
          lineupStatuses: { p1: "on_field" },
        }),
      });
      const { result } = renderHook(() => useLiveLineup(defaultArgs));

      await act(async () => {
        await result.current.syncConvocatedPlayersFromBackend();
      });

      expect(result.current.initialStarterIds).toEqual(["p1"]);
    });

    it("throws on non-ok response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });
      const { result } = renderHook(() => useLiveLineup(defaultArgs));

      await expect(
        act(async () => {
          await result.current.syncConvocatedPlayersFromBackend();
        }),
      ).rejects.toThrow("live_convocation_sync_failed");
    });
  });

  describe("persistInitialLineupSnapshot", () => {
    it("POSTs internal players' status (starter→on_field, others→substitute)", async () => {
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      act(() =>
        result.current.setConvocatedPlayers([
          createPlayer({ id: "p1" }),
          createPlayer({ id: "p2" }),
          createPlayer({ id: "p3" }),
        ]),
      );

      await act(async () => {
        await result.current.persistInitialLineupSnapshot(["p1", "p2"]);
      });

      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as { body: string }).body,
      );
      const updates = body.updates as Array<{
        playerId: string;
        status: string;
        startMinute: number | null;
      }>;
      expect(updates).toHaveLength(3);
      expect(updates.find((u) => u.playerId === "p1")?.status).toBe("on_field");
      expect(updates.find((u) => u.playerId === "p1")?.startMinute).toBe(0);
      expect(updates.find((u) => u.playerId === "p3")?.status).toBe(
        "substitute",
      );
    });

    it("filters out external players", async () => {
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      act(() =>
        result.current.setConvocatedPlayers([
          createPlayer({ id: "p1" }),
          createPlayer({
            id: "ext-1",
            isExternal: true,
            externalConvocationId: "ec-1",
          }),
        ]),
      );

      await act(async () => {
        await result.current.persistInitialLineupSnapshot(["p1"]);
      });

      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as { body: string }).body,
      );
      expect(body.updates).toHaveLength(1);
      expect(body.updates[0].playerId).toBe("p1");
    });

    it("no-op when no internal players", async () => {
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      act(() =>
        result.current.setConvocatedPlayers([
          createPlayer({
            id: "ext-1",
            isExternal: true,
            externalConvocationId: "ec-1",
          }),
        ]),
      );

      await act(async () => {
        await result.current.persistInitialLineupSnapshot([]);
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("throws on non-ok response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "snapshot_fail" }),
      });
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      act(() =>
        result.current.setConvocatedPlayers([createPlayer({ id: "p1" })]),
      );

      await expect(
        act(async () => {
          await result.current.persistInitialLineupSnapshot(["p1"]);
        }),
      ).rejects.toThrow("snapshot_fail");
    });
  });

  describe("toggleLineup", () => {
    it("flips isOnField for internal player", async () => {
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      act(() =>
        result.current.setConvocatedPlayers([
          createPlayer({ id: "p1", isOnField: false }),
        ]),
      );

      await act(async () => {
        await result.current.toggleLineup("p1");
      });

      expect(result.current.convocatedPlayers[0].isOnField).toBe(true);
    });

    it("POSTs to /convocation/lineup for internal player", async () => {
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      act(() =>
        result.current.setConvocatedPlayers([createPlayer({ id: "p1" })]),
      );

      await act(async () => {
        await result.current.toggleLineup("p1");
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/games/game-1/convocation/lineup",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("POSTs to /convocation/external/lineup for external player", async () => {
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      act(() =>
        result.current.setConvocatedPlayers([
          createPlayer({
            id: "ext-1",
            isExternal: true,
            externalConvocationId: "ec-1",
          }),
        ]),
      );

      await act(async () => {
        await result.current.toggleLineup("ext-1");
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/games/game-1/convocation/external/lineup",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("rejects external player without externalConvocationId", async () => {
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      act(() =>
        result.current.setConvocatedPlayers([
          createPlayer({ id: "ext-1", isExternal: true }),
        ]),
      );

      await act(async () => {
        await result.current.toggleLineup("ext-1");
      });

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("updates initialStarterIds when phase=pre_match", async () => {
      const { result } = renderHook(() =>
        useLiveLineup({ ...defaultArgs, phase: "pre_match" }),
      );
      act(() =>
        result.current.setConvocatedPlayers([
          createPlayer({ id: "p1", isOnField: false }),
          createPlayer({ id: "p2", isOnField: true }),
        ]),
      );

      await act(async () => {
        await result.current.toggleLineup("p1");
      });

      expect(new Set(result.current.initialStarterIds)).toEqual(
        new Set(["p1", "p2"]),
      );
    });

    it("does NOT update initialStarterIds when phase=first_half", async () => {
      const { result } = renderHook(() =>
        useLiveLineup({ ...defaultArgs, phase: "first_half" }),
      );
      act(() => {
        result.current.setConvocatedPlayers([
          createPlayer({ id: "p1", isOnField: false }),
        ]);
        result.current.setInitialStarterIds([]);
      });

      await act(async () => {
        await result.current.toggleLineup("p1");
      });

      expect(result.current.initialStarterIds).toEqual([]);
    });

    it("calls onLineupChange when provided", async () => {
      const onLineupChange = vi.fn();
      const { result } = renderHook(() =>
        useLiveLineup({ ...defaultArgs, onLineupChange }),
      );
      act(() =>
        result.current.setConvocatedPlayers([createPlayer({ id: "p1" })]),
      );

      await act(async () => {
        await result.current.toggleLineup("p1");
      });

      expect(onLineupChange).toHaveBeenCalledTimes(1);
    });

    it("noop when player not found", async () => {
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      await act(async () => {
        await result.current.toggleLineup("inexistente");
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("does not throw on lineup_save_failed (toast em vez de raise)", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "lineup_save_failed" }),
      });
      const { result } = renderHook(() => useLiveLineup(defaultArgs));
      act(() =>
        result.current.setConvocatedPlayers([createPlayer({ id: "p1" })]),
      );

      // Não deve rejeitar — o erro é swallowed por um toast interno.
      await act(async () => {
        await result.current.toggleLineup("p1");
      });

      expect(result.current.savingLineup).toBeNull();
    });
  });
});
