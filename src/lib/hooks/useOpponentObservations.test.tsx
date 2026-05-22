import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { toast } from "sonner";
import { useOpponentObservations } from "./useOpponentObservations";
import type { GameOpponentObservation } from "@/types/database";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function makeObservation(
  overrides: Partial<GameOpponentObservation> = {},
): GameOpponentObservation {
  return {
    id: "obs-1",
    game_id: "game-1",
    opponent_id: "opp-1",
    club_id: "club-1",
    observation: "Obs texto",
    minute: 10,
    promoted_to_opponent_at: null,
    promoted_to_field: null,
    promoted_by: null,
    created_at: "2026-05-22T10:00:00Z",
    updated_at: "2026-05-22T10:00:00Z",
    created_by: "user-1",
    ...overrides,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useOpponentObservations", () => {
  it("autoLoad=true: carrega observações ao mount com filtro promoted=false", async () => {
    const obs = makeObservation();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [obs] }),
    });

    const { result } = renderHook(() =>
      useOpponentObservations({ opponentId: "opp-1" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.observations).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/opponents/opp-1/observations?promoted=false",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("autoLoad=false: não dispara fetch automaticamente", async () => {
    const { result } = renderHook(() =>
      useOpponentObservations({
        opponentId: "opp-1",
        autoLoad: false,
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.observations).toEqual([]);
  });

  it("onlyUnpromoted=false: GET sem query string", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [] }),
    });

    renderHook(() =>
      useOpponentObservations({
        opponentId: "opp-1",
        onlyUnpromoted: false,
      }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/opponents/opp-1/observations",
        expect.any(Object),
      );
    });
  });

  it("promote: POST com payload correcto + toast sucesso + recarrega", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [makeObservation()] }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, promotedCount: 1 }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [] }),
    });

    const { result } = renderHook(() =>
      useOpponentObservations({ opponentId: "opp-1" }),
    );

    await waitFor(() => {
      expect(result.current.observations).toHaveLength(1);
    });

    let ok = false;
    await act(async () => {
      ok = await result.current.promote(["obs-1"], "pontos_fracos");
    });

    expect(ok).toBe(true);
    expect(toast.success).toHaveBeenCalled();

    const postCall = fetchMock.mock.calls[1];
    expect(postCall?.[0]).toBe("/api/opponents/opp-1/promote-observations");
    expect(postCall?.[1]?.method).toBe("POST");
    expect(JSON.parse(postCall?.[1]?.body as string)).toEqual({
      observationIds: ["obs-1"],
      targetField: "pontos_fracos",
    });

    // Reload chamado (3ª chamada de fetch)
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "/api/opponents/opp-1/observations?promoted=false",
    );
    await waitFor(() => {
      expect(result.current.observations).toHaveLength(0);
    });
  });

  it("promote: erro do servidor → toast com mensagem do servidor", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [makeObservation()] }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Campo inválido" }),
    });

    const { result } = renderHook(() =>
      useOpponentObservations({ opponentId: "opp-1" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let ok = true;
    await act(async () => {
      ok = await result.current.promote(["obs-1"], "pontos_fracos");
    });

    expect(ok).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Campo inválido");
  });

  it("promote: ids vazios → no-op (não chama fetch)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [] }),
    });

    const { result } = renderHook(() =>
      useOpponentObservations({ opponentId: "opp-1" }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    fetchMock.mockClear();

    let ok = true;
    await act(async () => {
      ok = await result.current.promote([], "pontos_fracos");
    });

    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("promote sem opponentId: toast erro", async () => {
    const { result } = renderHook(() =>
      useOpponentObservations({ opponentId: null, autoLoad: false }),
    );

    let ok = true;
    await act(async () => {
      ok = await result.current.promote(["obs-1"], "pontos_fracos");
    });

    expect(ok).toBe(false);
    expect(toast.error).toHaveBeenCalledWith("Sem adversário associado.");
  });

  it("opponentId null com autoLoad=true: não dispara fetch", async () => {
    renderHook(() =>
      useOpponentObservations({ opponentId: null, autoLoad: true }),
    );
    // Pequeno wait para garantir que o useEffect rodou
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
