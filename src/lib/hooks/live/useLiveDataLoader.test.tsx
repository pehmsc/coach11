import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { Game, GameEvent } from "@/types/database";
import type { createClient } from "@/lib/supabase/client";
import { useLiveDataLoader } from "./useLiveDataLoader";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

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

const createMockGame = (overrides: Partial<Game> = {}): Game =>
  ({
    id: "g1",
    age_group_id: "ag-1",
    game_datetime: "2026-05-21T10:00:00Z",
    is_home: true,
    status: "scheduled",
    ...overrides,
  }) as Game;

type SupabaseClient = ReturnType<typeof createClient>;

function createMockSupabase(): SupabaseClient {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return {
    from: vi.fn(() => builder),
  } as unknown as SupabaseClient;
}

type ArgsOverrides = Partial<Parameters<typeof useLiveDataLoader>[0]>;

function createDefaultArgs(overrides: ArgsOverrides = {}) {
  return {
    id: "g1",
    supabase: createMockSupabase(),
    router: { replace: vi.fn() },
    setClockHydrated: vi.fn(),
    setClockState: vi.fn(),
    setNowMs: vi.fn(),
    disableBackendCheckpoint: vi.fn(),
    setConvocatedPlayers: vi.fn(),
    setInitialStarterIds: vi.fn(),
    setEvents: vi.fn(),
    loadEventsFromBackend: vi.fn().mockResolvedValue([]),
    setPhase: vi.fn(),
    setKickoffError: vi.fn(),
    events: [] as GameEvent[],
    initialStarterIds: [] as string[],
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorageMock.clear();
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof global.fetch;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Helper para definir respostas de fetch. Ordem é importante:
 * 1ª chamada = convocation, 2ª = checkpoint, 3ª = (eventos via API se
 * loadEventsFromBackend usar fetch). No nosso mock loadEventsFromBackend
 * é stub directo, por isso só precisamos de convocation + checkpoint.
 */
function setFetchResponses(
  responses: Array<{ ok?: boolean; payload: unknown }>,
) {
  responses.forEach(({ ok = true, payload }) => {
    fetchMock.mockResolvedValueOnce({
      ok,
      json: async () => payload,
    });
  });
}

describe("useLiveDataLoader", () => {
  describe("initial state", () => {
    it("loading=true, game=null, error=null antes do fetch completar", () => {
      // Bloqueia o fetch da convocation para o useEffect não completar.
      fetchMock.mockReturnValue(new Promise(() => {}));
      const { result } = renderHook(() =>
        useLiveDataLoader(createDefaultArgs()),
      );
      expect(result.current.loading).toBe(true);
      expect(result.current.game).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("loadData — path principal (convocation API)", () => {
    it("sucesso: setGame + setLoading(false) + homeClubName/Short hidratados", async () => {
      setFetchResponses([
        {
          payload: {
            game: createMockGame(),
            homeClubName: "Clube X",
            homeClubShortName: "CX",
            players: [],
            lineupStatuses: {},
          },
        },
        { payload: { missingTable: true } },
      ]);

      const args = createDefaultArgs();
      const { result } = renderHook(() => useLiveDataLoader(args));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.game?.id).toBe("g1");
      expect(result.current.homeClubName).toBe("Clube X");
      expect(result.current.homeClubShortName).toBe("CX");
    });

    it("API devolve gameData null: setError + early return", async () => {
      setFetchResponses([
        {
          ok: false,
          payload: { error: "Jogo não encontrado." },
        },
      ]);

      const args = createDefaultArgs();
      const { result } = renderHook(() => useLiveDataLoader(args));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBe("Jogo não encontrado.");
      expect(result.current.game).toBeNull();
    });

    it("status=completed: early return com setPhase=completed + clockState reset", async () => {
      setFetchResponses([
        {
          payload: {
            game: createMockGame({ status: "completed" }),
            players: [],
            lineupStatuses: {},
          },
        },
      ]);

      const args = createDefaultArgs();
      renderHook(() => useLiveDataLoader(args));

      await waitFor(() => {
        expect(args.setPhase).toHaveBeenCalledWith("completed");
      });
      expect(args.setClockState).toHaveBeenCalledWith({
        baseSeconds: 0,
        runningSinceMs: null,
      });
    });

    it("starterIds do backend: usa quando array com strings", async () => {
      setFetchResponses([
        {
          payload: {
            game: createMockGame(),
            players: [
              {
                id: "p1",
                age_group_id: "ag-1",
                first_name: "A",
                last_name: "B",
                status: "active",
                created_at: "2026-01-01T00:00:00Z",
                isConvocated: true,
              },
            ],
            lineupStatuses: { p1: "on_field" },
            starterIds: ["p1", "p2"],
          },
        },
        { payload: { missingTable: true } },
      ]);

      const args = createDefaultArgs();
      renderHook(() => useLiveDataLoader(args));

      await waitFor(() => {
        expect(args.setInitialStarterIds).toHaveBeenCalledWith(["p1", "p2"]);
      });
    });

    it("fallback para onFieldIds quando starterIds vazio", async () => {
      setFetchResponses([
        {
          payload: {
            game: createMockGame(),
            players: [
              {
                id: "p1",
                age_group_id: "ag-1",
                first_name: "A",
                last_name: "B",
                status: "active",
                created_at: "2026-01-01T00:00:00Z",
                isConvocated: true,
              },
            ],
            lineupStatuses: { p1: "on_field" },
          },
        },
        { payload: { missingTable: true } },
      ]);

      const args = createDefaultArgs();
      renderHook(() => useLiveDataLoader(args));

      await waitFor(() => {
        expect(args.setInitialStarterIds).toHaveBeenCalledWith(["p1"]);
      });
    });
  });

  describe("loadData — checkpoint backend", () => {
    it("missingTable=true: chama disableBackendCheckpoint", async () => {
      setFetchResponses([
        {
          payload: {
            game: createMockGame(),
            players: [],
            lineupStatuses: {},
          },
        },
        { payload: { missingTable: true } },
      ]);

      const args = createDefaultArgs();
      renderHook(() => useLiveDataLoader(args));

      await waitFor(() => {
        expect(args.disableBackendCheckpoint).toHaveBeenCalled();
      });
    });

    it("checkpoint válido: setClockState com state derivado", async () => {
      const now = Date.now();
      setFetchResponses([
        {
          payload: {
            game: createMockGame(),
            players: [],
            lineupStatuses: {},
          },
        },
        {
          payload: {
            checkpoint: {
              phase: "first_half",
              baseSeconds: 600,
              runningSinceMs: now - 5000,
              savedAt: now,
            },
          },
        },
      ]);

      const args = createDefaultArgs();
      const { result } = renderHook(() => useLiveDataLoader(args));

      await waitFor(() => expect(result.current.loading).toBe(false));
      // setPhase chamado com first_half (do checkpoint)
      expect(args.setPhase).toHaveBeenCalledWith("first_half");
    });
  });

  describe("Effect 2 — reconciliação isOnField", () => {
    it("não corre quando initialStarterIds vazio", () => {
      fetchMock.mockReturnValue(new Promise(() => {}));
      const args = createDefaultArgs({
        events: [
          {
            id: "e1",
            game_id: "g1",
            event_type: "goal",
            minute: 30,
            is_opponent_event: false,
            created_at: "2026-05-21T10:30:00Z",
          } as GameEvent,
        ],
        initialStarterIds: [],
      });
      renderHook(() => useLiveDataLoader(args));
      expect(args.setConvocatedPlayers).not.toHaveBeenCalled();
    });

    it("corre quando initialStarterIds tem valores", () => {
      fetchMock.mockReturnValue(new Promise(() => {}));
      const args = createDefaultArgs({
        events: [],
        initialStarterIds: ["p1"],
      });
      renderHook(() => useLiveDataLoader(args));
      expect(args.setConvocatedPlayers).toHaveBeenCalled();
    });
  });

  describe("Effect 3 — redirect se completed", () => {
    it("não redirecciona se status != completed", async () => {
      setFetchResponses([
        {
          payload: {
            game: createMockGame({ status: "scheduled" }),
            players: [],
            lineupStatuses: {},
          },
        },
        { payload: { missingTable: true } },
      ]);

      const args = createDefaultArgs();
      const { result } = renderHook(() => useLiveDataLoader(args));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(args.router.replace).not.toHaveBeenCalled();
    });

    it("redirecciona para /summary quando status=completed", async () => {
      setFetchResponses([
        {
          payload: {
            game: createMockGame({ status: "completed" }),
            players: [],
            lineupStatuses: {},
          },
        },
      ]);

      const args = createDefaultArgs();
      renderHook(() => useLiveDataLoader(args));

      await waitFor(() => {
        expect(args.router.replace).toHaveBeenCalledWith("/games/g1/summary");
      });
    });
  });

  describe("setGame exposed", () => {
    it("setGame pode ser usado para actualizar game após mount", async () => {
      setFetchResponses([
        {
          payload: {
            game: createMockGame(),
            players: [],
            lineupStatuses: {},
          },
        },
        { payload: { missingTable: true } },
      ]);

      const args = createDefaultArgs();
      const { result } = renderHook(() => useLiveDataLoader(args));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(typeof result.current.setGame).toBe("function");
    });
  });
});
