import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { MatchPhase } from "@/components/games/live/types";
import { useLiveClock } from "./useLiveClock";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  localStorageMock.clear();
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true }),
  });
  global.fetch = fetchMock as unknown as typeof global.fetch;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useLiveClock", () => {
  describe("initial state", () => {
    it("starts paused with baseSeconds=0", () => {
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "pre_match" }),
      );
      expect(result.current.clockState.baseSeconds).toBe(0);
      expect(result.current.clockState.runningSinceMs).toBeNull();
      expect(result.current.clockSeconds).toBe(0);
      expect(result.current.currentMinute).toBe(1);
    });

    it("clockHydrated starts false", () => {
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "pre_match" }),
      );
      expect(result.current.clockHydrated).toBe(false);
    });
  });

  describe("startClock", () => {
    it("sets runningSinceMs to Date.now()", () => {
      const now = 1700000000000;
      vi.setSystemTime(now);
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      act(() => result.current.startClock());
      expect(result.current.clockState.runningSinceMs).toBe(now);
    });

    it("does nothing if already running (idempotent)", () => {
      const now = 1700000000000;
      vi.setSystemTime(now);
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      act(() => result.current.startClock());
      const firstRunningSince = result.current.clockState.runningSinceMs;
      vi.setSystemTime(now + 5000);
      act(() => result.current.startClock());
      expect(result.current.clockState.runningSinceMs).toBe(firstRunningSince);
    });
  });

  describe("pauseClock", () => {
    it("transfers elapsed time to baseSeconds and nullifies runningSinceMs", () => {
      const start = 1700000000000;
      vi.setSystemTime(start);
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      act(() => result.current.startClock());
      vi.setSystemTime(start + 65_000);
      act(() => result.current.pauseClock());
      expect(result.current.clockState.runningSinceMs).toBeNull();
      expect(result.current.clockState.baseSeconds).toBe(65);
    });

    it("does nothing if not running (idempotent)", () => {
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "pre_match" }),
      );
      act(() => result.current.pauseClock());
      expect(result.current.clockState.baseSeconds).toBe(0);
      expect(result.current.clockState.runningSinceMs).toBeNull();
    });
  });

  describe("adjustClockBySeconds", () => {
    it("adds positive delta", () => {
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      act(() => result.current.adjustClockBySeconds(30));
      expect(result.current.clockState.baseSeconds).toBe(30);
    });

    it("subtracts negative delta but never below zero", () => {
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      act(() => result.current.adjustClockBySeconds(30));
      act(() => result.current.adjustClockBySeconds(-100));
      expect(result.current.clockState.baseSeconds).toBe(0);
    });

    it("preserves running state when adjusting while running", () => {
      const now = 1700000000000;
      vi.setSystemTime(now);
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      act(() => result.current.startClock());
      act(() => result.current.adjustClockBySeconds(10));
      expect(result.current.clockState.runningSinceMs).not.toBeNull();
    });
  });

  describe("currentMinute calculation", () => {
    it("returns 1 at 0 seconds", () => {
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      expect(result.current.currentMinute).toBe(1);
    });

    it("returns 1 at 59 seconds", () => {
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      act(() => result.current.adjustClockBySeconds(59));
      expect(result.current.currentMinute).toBe(1);
    });

    it("returns 2 at 60 seconds", () => {
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      act(() => result.current.adjustClockBySeconds(60));
      expect(result.current.currentMinute).toBe(2);
    });

    it("returns 46 at 45min30s (typical end of first half)", () => {
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      act(() => result.current.adjustClockBySeconds(45 * 60 + 30));
      expect(result.current.currentMinute).toBe(46);
    });
  });

  describe("ticker (running phase)", () => {
    it("ticks every 1s when phase is first_half and running", () => {
      const start = 1700000000000;
      vi.setSystemTime(start);
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      act(() => result.current.startClock());
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(result.current.clockSeconds).toBe(3);
    });

    it("does NOT register ticker interval when phase is pre_match", () => {
      const start = 1700000000000;
      vi.setSystemTime(start);
      const setIntervalSpy = vi.spyOn(global, "setInterval");
      renderHook(() => useLiveClock({ id: "g1", phase: "pre_match" }));
      // No setInterval because effect's isRunningPhase(pre_match) === false
      expect(setIntervalSpy).not.toHaveBeenCalled();
    });
  });

  describe("backend checkpoint", () => {
    it("does not PATCH if clockHydrated=false (initial state)", async () => {
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      act(() => result.current.startClock());
      await act(async () => {
        await Promise.resolve();
      });
      const patchCalls = fetchMock.mock.calls.filter(
        (call) =>
          typeof call[1] === "object" && call[1] !== null && "method" in call[1] && call[1].method === "PATCH",
      );
      expect(patchCalls.length).toBe(0);
    });

    it("PATCHes after hydration when phase/clock changes", async () => {
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      act(() => result.current.setClockHydrated(true));
      act(() => result.current.adjustClockBySeconds(30));
      await act(async () => {
        await Promise.resolve();
      });
      const patchCalls = fetchMock.mock.calls.filter(
        (call) =>
          typeof call[1] === "object" && call[1] !== null && "method" in call[1] && call[1].method === "PATCH",
      );
      expect(patchCalls.length).toBeGreaterThan(0);
      expect(patchCalls[0][0]).toBe("/api/games/g1/live/checkpoint");
    });

    it("dedups identical fingerprints (does not PATCH twice for same state)", async () => {
      const { result, rerender } = renderHook(
        ({ phase }: { phase: MatchPhase }) =>
          useLiveClock({ id: "g1", phase }),
        { initialProps: { phase: "first_half" as MatchPhase } },
      );
      act(() => result.current.setClockHydrated(true));
      act(() => result.current.adjustClockBySeconds(30));
      await act(async () => {
        await Promise.resolve();
      });
      const initialCalls = fetchMock.mock.calls.filter(
        (call) =>
          typeof call[1] === "object" && call[1] !== null && "method" in call[1] && call[1].method === "PATCH",
      ).length;
      rerender({ phase: "first_half" as MatchPhase });
      await act(async () => {
        await Promise.resolve();
      });
      const afterRerenderCalls = fetchMock.mock.calls.filter(
        (call) =>
          typeof call[1] === "object" && call[1] !== null && "method" in call[1] && call[1].method === "PATCH",
      ).length;
      expect(afterRerenderCalls).toBe(initialCalls);
    });

    it("disableBackendCheckpoint silences future PATCHes", async () => {
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      act(() => result.current.disableBackendCheckpoint());
      act(() => result.current.setClockHydrated(true));
      act(() => result.current.adjustClockBySeconds(30));
      await act(async () => {
        await Promise.resolve();
      });
      const patchCalls = fetchMock.mock.calls.filter(
        (call) =>
          typeof call[1] === "object" && call[1] !== null && "method" in call[1] && call[1].method === "PATCH",
      );
      expect(patchCalls.length).toBe(0);
    });
  });

  describe("local persistence", () => {
    it("persists to localStorage after hydration", () => {
      const { result } = renderHook(() =>
        useLiveClock({ id: "g1", phase: "first_half" }),
      );
      act(() => result.current.setClockHydrated(true));
      act(() => result.current.adjustClockBySeconds(45));
      const stored = localStorageMock.getItem("coach11:live-clock:g1");
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.baseSeconds).toBe(45);
      expect(parsed.phase).toBe("first_half");
    });

    it("does NOT persist before hydration (avoid overwriting saved state)", () => {
      renderHook(() => useLiveClock({ id: "g1", phase: "first_half" }));
      const stored = localStorageMock.getItem("coach11:live-clock:g1");
      expect(stored).toBeNull();
    });
  });
});
