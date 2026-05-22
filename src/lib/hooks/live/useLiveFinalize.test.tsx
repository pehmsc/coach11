import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Game, GameEvent } from "@/types/database";
import type { LivePlayer } from "@/components/games/live/types";
import { useLiveFinalize } from "./useLiveFinalize";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/pdf/matchReport", () => ({
  exportMatchReportPDF: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/observability/posthog-client", () => ({
  captureClientProductEvent: vi.fn(),
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

const createGame = (overrides: Partial<Game> = {}): Game =>
  ({
    id: "g1",
    age_group_id: "ag-1",
    is_home: true,
    status: "scheduled",
    game_datetime: "2026-05-21T10:00:00Z",
    opponent_name: "Adversário",
    tactical_system: null,
    positive_aspects: null,
    negative_aspects: null,
    aspects_to_improve: null,
    team_notes: null,
    coach_notes: null,
    ...overrides,
  }) as Game;

type ArgsOverrides = Partial<Parameters<typeof useLiveFinalize>[0]>;

function createDefaultArgs(overrides: ArgsOverrides = {}) {
  return {
    id: "g1",
    router: { push: vi.fn() },
    game: createGame(),
    setGame: vi.fn(),
    phase: "review" as const,
    setPhase: vi.fn(),
    currentMinute: 90,
    pauseClock: vi.fn(),
    events: [] as GameEvent[],
    convocatedPlayers: [] as LivePlayer[],
    score: { home: 2, away: 1 },
    displayEvents: [] as GameEvent[],
    starterIds: new Set<string>(),
    concededGoalsByPlayer: new Map<string, number>(),
    playersWhoNeedPersistentStats: [] as LivePlayer[],
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLiveFinalize", () => {
  describe("initial state", () => {
    it("playerRatings={}, mvpPlayerId=null, finalizing=false, exportingPDF=false", () => {
      const { result } = renderHook(() =>
        useLiveFinalize(createDefaultArgs({ game: null })),
      );
      expect(result.current.playerRatings).toEqual({});
      expect(result.current.mvpPlayerId).toBeNull();
      expect(result.current.finalizing).toBe(false);
      expect(result.current.exportingPDF).toBe(false);
    });
  });

  describe("hidratação match sheet", () => {
    it("hidrata os 6 campos a partir do game", async () => {
      const args = createDefaultArgs({
        game: createGame({
          tactical_system: "4-3-3",
          positive_aspects: "Boa pressão",
          negative_aspects: "Transições lentas",
          aspects_to_improve: "Finalização",
          team_notes: "Notas de equipa",
          coach_notes: "Notas privadas",
        }),
      });
      const { result } = renderHook(() => useLiveFinalize(args));

      await waitFor(() => {
        expect(result.current.liveTacticalSystem).toBe("4-3-3");
      });
      expect(result.current.livePositiveAspects).toBe("Boa pressão");
      expect(result.current.liveNegativeAspects).toBe("Transições lentas");
      expect(result.current.liveAspectsToImprove).toBe("Finalização");
      expect(result.current.liveTeamNotes).toBe("Notas de equipa");
      expect(result.current.liveCoachNotes).toBe("Notas privadas");
    });

    it("hidrata só uma vez (ref) — refetch não sobrepõe edições locais", async () => {
      const { result, rerender } = renderHook(
        ({ tacticalSystem }: { tacticalSystem: string }) =>
          useLiveFinalize(
            createDefaultArgs({
              game: createGame({ tactical_system: tacticalSystem }),
            }),
          ),
        { initialProps: { tacticalSystem: "4-4-2" } },
      );

      await waitFor(() =>
        expect(result.current.liveTacticalSystem).toBe("4-4-2"),
      );

      // Edição local
      act(() => result.current.setLiveTacticalSystem("3-5-2"));
      expect(result.current.liveTacticalSystem).toBe("3-5-2");

      // Re-render com game novo (mesmo valor) — não re-hidrata (ref one-shot)
      rerender({ tacticalSystem: "4-4-2" });

      expect(result.current.liveTacticalSystem).toBe("3-5-2");
    });

    it("campos null no game tornam-se strings vazias", async () => {
      const { result } = renderHook(() =>
        useLiveFinalize(createDefaultArgs()),
      );
      await waitFor(() => {
        expect(result.current.liveTacticalSystem).toBe("");
      });
    });
  });

  describe("allRatingsFilled", () => {
    it("true quando não há jogadores a avaliar", () => {
      const { result } = renderHook(() =>
        useLiveFinalize(
          createDefaultArgs({ playersWhoNeedPersistentStats: [] }),
        ),
      );
      expect(result.current.allRatingsFilled).toBe(true);
    });

    it("false quando falta avaliar algum jogador", () => {
      const { result } = renderHook(() =>
        useLiveFinalize(
          createDefaultArgs({
            playersWhoNeedPersistentStats: [createPlayer({ id: "p1" })],
          }),
        ),
      );
      expect(result.current.allRatingsFilled).toBe(false);
    });

    it("true quando todos os jogadores têm rating", () => {
      const { result } = renderHook(() =>
        useLiveFinalize(
          createDefaultArgs({
            playersWhoNeedPersistentStats: [createPlayer({ id: "p1" })],
          }),
        ),
      );
      act(() => result.current.setPlayerRatings({ p1: 7 }));
      expect(result.current.allRatingsFilled).toBe(true);
    });
  });

  describe("finalizeGame", () => {
    it("aborta se phase != review", async () => {
      const args = createDefaultArgs({ phase: "first_half" });
      const { result } = renderHook(() => useLiveFinalize(args));
      await act(async () => {
        await result.current.finalizeGame();
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("aborta se !allRatingsFilled", async () => {
      const args = createDefaultArgs({
        phase: "review",
        playersWhoNeedPersistentStats: [createPlayer({ id: "p1" })],
      });
      const { result } = renderHook(() => useLiveFinalize(args));
      await act(async () => {
        await result.current.finalizeGame();
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("aborta se window.confirm devolve false", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      const args = createDefaultArgs({ phase: "review" });
      const { result } = renderHook(() => useLiveFinalize(args));
      await act(async () => {
        await result.current.finalizeGame();
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sucesso: PATCH match sheet + POST finalize + setGame + router.push", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // PATCH
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // POST finalize

      const args = createDefaultArgs({ phase: "review" });
      const { result } = renderHook(() => useLiveFinalize(args));

      await act(async () => {
        await result.current.finalizeGame();
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe("/api/games/g1");
      expect(fetchMock.mock.calls[1][0]).toBe("/api/games/g1/live/finalize");
      expect(args.pauseClock).toHaveBeenCalled();
      expect(args.setPhase).toHaveBeenCalledWith("completed");
      expect(args.setGame).toHaveBeenCalled();
      expect(args.router.push).toHaveBeenCalledWith("/games/g1/summary");
    });

    it("aborta se PATCH match sheet falha (não chama POST finalize)", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "patch falhou" }),
      });

      const args = createDefaultArgs({ phase: "review" });
      const { result } = renderHook(() => useLiveFinalize(args));

      await act(async () => {
        await result.current.finalizeGame();
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(args.setPhase).not.toHaveBeenCalledWith("completed");
      expect(args.router.push).not.toHaveBeenCalled();
    });

    it("PATCH lança exceção: aborta com toast", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      fetchMock.mockRejectedValueOnce(new Error("network down"));

      const args = createDefaultArgs({ phase: "review" });
      const { result } = renderHook(() => useLiveFinalize(args));

      await act(async () => {
        await result.current.finalizeGame();
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(args.setPhase).not.toHaveBeenCalledWith("completed");
      expect(result.current.finalizing).toBe(false);
    });

    it("POST finalize falha: não muda phase para completed nem redirecciona", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) }) // PATCH ok
        .mockResolvedValueOnce({
          ok: false,
          json: async () => ({ error: "finalize falhou" }),
        });

      const args = createDefaultArgs({ phase: "review" });
      const { result } = renderHook(() => useLiveFinalize(args));

      await act(async () => {
        await result.current.finalizeGame();
      });

      expect(args.setPhase).not.toHaveBeenCalledWith("completed");
      expect(args.router.push).not.toHaveBeenCalled();
    });

    it("finalizing flag true durante operação, false depois", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      let resolvePatch: ((v: unknown) => void) | undefined;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolvePatch = r;
          }),
      );

      const args = createDefaultArgs({ phase: "review" });
      const { result } = renderHook(() => useLiveFinalize(args));

      let promise: Promise<void> | undefined;
      act(() => {
        promise = result.current.finalizeGame();
      });
      await waitFor(() => expect(result.current.finalizing).toBe(true));

      resolvePatch?.({ ok: false, json: async () => ({ error: "x" }) });
      await act(async () => {
        await promise;
      });
      expect(result.current.finalizing).toBe(false);
    });
  });

  describe("handleExportPDF", () => {
    it("chama exportMatchReportPDF + captureClientProductEvent", async () => {
      const { exportMatchReportPDF } = await import("@/lib/pdf/matchReport");
      const { captureClientProductEvent } = await import(
        "@/lib/observability/posthog-client"
      );

      const args = createDefaultArgs();
      const { result } = renderHook(() => useLiveFinalize(args));

      await act(async () => {
        await result.current.handleExportPDF();
      });

      expect(exportMatchReportPDF).toHaveBeenCalled();
      expect(captureClientProductEvent).toHaveBeenCalledWith(
        "pdf_generated",
        expect.objectContaining({ game_id: "g1" }),
      );
    });

    it("não faz nada se game é null", async () => {
      const { exportMatchReportPDF } = await import("@/lib/pdf/matchReport");
      vi.mocked(exportMatchReportPDF).mockClear();

      const args = createDefaultArgs({ game: null });
      const { result } = renderHook(() => useLiveFinalize(args));

      await act(async () => {
        await result.current.handleExportPDF();
      });

      expect(exportMatchReportPDF).not.toHaveBeenCalled();
    });

    it("exportingPDF=false após sucesso", async () => {
      const args = createDefaultArgs();
      const { result } = renderHook(() => useLiveFinalize(args));
      await act(async () => {
        await result.current.handleExportPDF();
      });
      expect(result.current.exportingPDF).toBe(false);
    });

    it("exportingPDF=false após erro", async () => {
      const { exportMatchReportPDF } = await import("@/lib/pdf/matchReport");
      vi.mocked(exportMatchReportPDF).mockRejectedValueOnce(
        new Error("pdf failed"),
      );

      const args = createDefaultArgs();
      const { result } = renderHook(() => useLiveFinalize(args));
      await act(async () => {
        await result.current.handleExportPDF();
      });
      expect(result.current.exportingPDF).toBe(false);
    });
  });
});
