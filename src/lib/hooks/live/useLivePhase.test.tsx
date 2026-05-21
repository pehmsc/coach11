import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { LivePlayer } from "@/components/games/live/types";
import { useLivePhase } from "./useLivePhase";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

const createPlayer = (overrides: Partial<LivePlayer> = {}): LivePlayer => ({
  id: "p1",
  age_group_id: "ag-1",
  first_name: "Test",
  last_name: "Player",
  status: "active",
  created_at: "2026-01-01T00:00:00Z",
  isOnField: true,
  isInitialBench: false,
  ...overrides,
});

type ArgsOverrides = Partial<Parameters<typeof useLivePhase>[0]>;

function createDefaultArgs(overrides: ArgsOverrides = {}) {
  return {
    gameId: "g1",
    getPlayersOnField: vi.fn(() =>
      Array.from({ length: 11 }, (_, i) =>
        createPlayer({ id: `p${i}`, jersey_number: i + 1 }),
      ),
    ),
    persistInitialLineupSnapshot: vi.fn().mockResolvedValue(undefined),
    setInitialStarterIds: vi.fn(),
    startClock: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLivePhase", () => {
  describe("initial state", () => {
    it("phase=pre_match, startingFirstHalf=false, kickoffError=null", () => {
      const { result } = renderHook(() => useLivePhase(createDefaultArgs()));
      expect(result.current.phase).toBe("pre_match");
      expect(result.current.startingFirstHalf).toBe(false);
      expect(result.current.kickoffError).toBeNull();
    });
  });

  describe("setPhase", () => {
    it("muda a phase", () => {
      const { result } = renderHook(() => useLivePhase(createDefaultArgs()));
      act(() => result.current.setPhase("first_half"));
      expect(result.current.phase).toBe("first_half");
    });
  });

  describe("clearKickoffError", () => {
    it("limpa kickoffError", () => {
      const { result } = renderHook(() => useLivePhase(createDefaultArgs()));
      act(() => result.current.setKickoffError("erro"));
      expect(result.current.kickoffError).toBe("erro");
      act(() => result.current.clearKickoffError());
      expect(result.current.kickoffError).toBeNull();
    });

    it("referência estável entre renders", () => {
      const { result, rerender } = renderHook(() =>
        useLivePhase(createDefaultArgs()),
      );
      const first = result.current.clearKickoffError;
      rerender();
      expect(result.current.clearKickoffError).toBe(first);
    });
  });

  describe("effect — limpa kickoffError quando phase muda de pre_match", () => {
    it("limpa kickoffError ao transitar para first_half", () => {
      const { result } = renderHook(() => useLivePhase(createDefaultArgs()));
      act(() => result.current.setKickoffError("erro de teste"));
      expect(result.current.kickoffError).toBe("erro de teste");
      act(() => result.current.setPhase("first_half"));
      expect(result.current.kickoffError).toBeNull();
    });

    it("não limpa quando phase continua pre_match", () => {
      const { result } = renderHook(() => useLivePhase(createDefaultArgs()));
      act(() => result.current.setKickoffError("erro"));
      expect(result.current.kickoffError).toBe("erro");
    });
  });

  describe("handleStartFirstHalf", () => {
    it("sucesso: persist + setInitialStarterIds + setPhase(first_half) + startClock", async () => {
      const args = createDefaultArgs();
      const { result } = renderHook(() => useLivePhase(args));

      await act(async () => {
        await result.current.handleStartFirstHalf();
      });

      expect(args.persistInitialLineupSnapshot).toHaveBeenCalled();
      expect(args.setInitialStarterIds).toHaveBeenCalled();
      expect(args.startClock).toHaveBeenCalledTimes(1);
      expect(result.current.phase).toBe("first_half");
      expect(result.current.startingFirstHalf).toBe(false);
    });

    it("kickoff inválido (0 jogadores): define kickoffError + sem persist", async () => {
      const args = createDefaultArgs({
        getPlayersOnField: vi.fn(() => []),
      });
      const { result } = renderHook(() => useLivePhase(args));

      await act(async () => {
        await result.current.handleStartFirstHalf();
      });

      expect(result.current.kickoffError).toBeTruthy();
      expect(args.persistInitialLineupSnapshot).not.toHaveBeenCalled();
      expect(args.startClock).not.toHaveBeenCalled();
      expect(result.current.phase).toBe("pre_match");
    });

    it("persist falha: define kickoffError com mensagem + não setPhase + não startClock", async () => {
      const args = createDefaultArgs({
        persistInitialLineupSnapshot: vi
          .fn()
          .mockRejectedValue(new Error("backend offline")),
      });
      const { result } = renderHook(() => useLivePhase(args));

      await act(async () => {
        await result.current.handleStartFirstHalf();
      });

      expect(result.current.kickoffError).toBe("backend offline");
      expect(result.current.phase).toBe("pre_match");
      expect(args.startClock).not.toHaveBeenCalled();
      expect(result.current.startingFirstHalf).toBe(false);
    });

    it("startingFirstHalf=true durante a operação, false depois", async () => {
      let resolveSnapshot: (() => void) | undefined;
      const args = createDefaultArgs({
        persistInitialLineupSnapshot: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveSnapshot = resolve;
            }),
        ),
      });
      const { result } = renderHook(() => useLivePhase(args));

      let promise: Promise<void> | undefined;
      act(() => {
        promise = result.current.handleStartFirstHalf();
      });
      expect(result.current.startingFirstHalf).toBe(true);

      resolveSnapshot?.();
      await act(async () => {
        await promise;
      });
      expect(result.current.startingFirstHalf).toBe(false);
    });

    it("error não-Error: usa mensagem default", async () => {
      const args = createDefaultArgs({
        persistInitialLineupSnapshot: vi.fn().mockRejectedValue("string error"),
      });
      const { result } = renderHook(() => useLivePhase(args));

      await act(async () => {
        await result.current.handleStartFirstHalf();
      });

      expect(result.current.kickoffError).toBe(
        "Erro ao guardar titulares iniciais.",
      );
    });

    it("kickoff válido limpa kickoffError prévio antes de persistir", async () => {
      const args = createDefaultArgs();
      const { result } = renderHook(() => useLivePhase(args));

      act(() => result.current.setKickoffError("erro antigo"));
      expect(result.current.kickoffError).toBe("erro antigo");

      await act(async () => {
        await result.current.handleStartFirstHalf();
      });

      expect(result.current.kickoffError).toBeNull();
    });

    it("getPlayersOnField é chamado no momento do click (lazy)", async () => {
      const args = createDefaultArgs();
      const { result } = renderHook(() => useLivePhase(args));

      expect(args.getPlayersOnField).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.handleStartFirstHalf();
      });

      expect(args.getPlayersOnField).toHaveBeenCalledTimes(1);
    });
  });
});
