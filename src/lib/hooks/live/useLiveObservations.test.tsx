import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { toast } from "sonner";
import { useLiveObservations } from "./useLiveObservations";
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
    observation: "Texto",
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

describe("useLiveObservations", () => {
  it("estado inicial: vazio, loading false após mount", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [] }),
    });
    const { result } = renderHook(() =>
      useLiveObservations({ gameId: "game-1", hasOpponent: true }),
    );

    await waitFor(() => {
      expect(result.current.loadingObservations).toBe(false);
    });
    expect(result.current.observations).toEqual([]);
    expect(result.current.observationModalOpen).toBe(false);
  });

  it("loadObservations popula a lista", async () => {
    const obs = makeObservation();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [obs] }),
    });

    const { result } = renderHook(() =>
      useLiveObservations({ gameId: "game-1", hasOpponent: true }),
    );

    await waitFor(() => {
      expect(result.current.observations).toHaveLength(1);
    });
    expect(result.current.observations[0]?.id).toBe("obs-1");
  });

  it("openObservationModal: bloqueado se !hasOpponent (toast erro)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [] }),
    });

    const { result } = renderHook(() =>
      useLiveObservations({ gameId: "game-1", hasOpponent: false }),
    );

    await waitFor(() => {
      expect(result.current.loadingObservations).toBe(false);
    });

    act(() => {
      result.current.openObservationModal();
    });

    expect(result.current.observationModalOpen).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("adversário"),
    );
  });

  it("openObservationModal: abre quando hasOpponent é true", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [] }),
    });

    const { result } = renderHook(() =>
      useLiveObservations({ gameId: "game-1", hasOpponent: true }),
    );

    await waitFor(() => {
      expect(result.current.loadingObservations).toBe(false);
    });

    act(() => {
      result.current.openObservationModal();
    });

    expect(result.current.observationModalOpen).toBe(true);
  });

  it("createObservation: POST + adiciona à lista + fecha modal", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [] }),
    });
    const inserted = makeObservation({ id: "obs-new", observation: "Nova" });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, observation: inserted }),
    });

    const { result } = renderHook(() =>
      useLiveObservations({ gameId: "game-1", hasOpponent: true }),
    );

    await waitFor(() => {
      expect(result.current.loadingObservations).toBe(false);
    });

    act(() => {
      result.current.openObservationModal();
    });

    await act(async () => {
      await result.current.createObservation("Nova", 15);
    });

    expect(result.current.observations).toHaveLength(1);
    expect(result.current.observations[0]?.id).toBe("obs-new");
    expect(result.current.observationModalOpen).toBe(false);
    expect(toast.success).toHaveBeenCalledWith("Observação guardada.");

    const postCall = fetchMock.mock.calls[1];
    expect(postCall?.[0]).toBe("/api/games/game-1/observations");
    expect(postCall?.[1]?.method).toBe("POST");
    const body = JSON.parse(postCall?.[1]?.body as string);
    expect(body).toEqual({ observation: "Nova", minute: 15 });
  });

  it("createObservation: erro do servidor → toast, não adiciona", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [] }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Jogo sem adversário associado." }),
    });

    const { result } = renderHook(() =>
      useLiveObservations({ gameId: "game-1", hasOpponent: true }),
    );

    await waitFor(() => {
      expect(result.current.loadingObservations).toBe(false);
    });

    await act(async () => {
      await result.current.createObservation("Nova", 15);
    });

    expect(result.current.observations).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith("Jogo sem adversário associado.");
  });

  it("createObservation: texto vazio → no-op (sem fetch)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [] }),
    });

    const { result } = renderHook(() =>
      useLiveObservations({ gameId: "game-1", hasOpponent: true }),
    );

    await waitFor(() => {
      expect(result.current.loadingObservations).toBe(false);
    });

    await act(async () => {
      await result.current.createObservation("   ", 10);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.observations).toHaveLength(0);
  });

  it("deleteObservation: optimistic remove + sucesso", async () => {
    const obs = makeObservation();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [obs] }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { result } = renderHook(() =>
      useLiveObservations({ gameId: "game-1", hasOpponent: true }),
    );

    await waitFor(() => {
      expect(result.current.observations).toHaveLength(1);
    });

    await act(async () => {
      await result.current.deleteObservation("obs-1");
    });

    expect(result.current.observations).toHaveLength(0);
    const deleteCall = fetchMock.mock.calls[1];
    expect(deleteCall?.[0]).toBe("/api/games/game-1/observations/obs-1");
    expect(deleteCall?.[1]?.method).toBe("DELETE");
  });

  it("deleteObservation: erro do servidor → rollback + toast", async () => {
    const obs = makeObservation();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [obs] }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Erro" }),
    });

    const { result } = renderHook(() =>
      useLiveObservations({ gameId: "game-1", hasOpponent: true }),
    );

    await waitFor(() => {
      expect(result.current.observations).toHaveLength(1);
    });

    await act(async () => {
      await result.current.deleteObservation("obs-1");
    });

    expect(result.current.observations).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledWith("Erro ao apagar observação.");
  });

  it("closeObservationModal: fecha o modal", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ observations: [] }),
    });

    const { result } = renderHook(() =>
      useLiveObservations({ gameId: "game-1", hasOpponent: true }),
    );

    await waitFor(() => {
      expect(result.current.loadingObservations).toBe(false);
    });

    act(() => {
      result.current.openObservationModal();
    });
    expect(result.current.observationModalOpen).toBe(true);

    act(() => {
      result.current.closeObservationModal();
    });
    expect(result.current.observationModalOpen).toBe(false);
  });
});
