import { describe, expect, it, vi } from "vitest";
import { syncExternalPlayerLiveStatus } from "./live-external-player-sync";

function mockFetch(response: { ok: boolean; body?: unknown }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    json: vi.fn().mockResolvedValue(response.body ?? {}),
  } as unknown as Response);
}

describe("syncExternalPlayerLiveStatus", () => {
  it("[1] POSTa ao endpoint /live/external-players com body correcto", async () => {
    const fetcher = mockFetch({ ok: true, body: { success: true } });

    await syncExternalPlayerLiveStatus(
      "game-1",
      "ext-abc",
      "on_field",
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/games/game-1/live/external-players",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalConvocationId: "ext-abc",
          lineupStatus: "on_field",
        }),
      }),
    );
  });

  it("[2] envia lineupStatus='substitute' quando indicado", async () => {
    const fetcher = mockFetch({ ok: true });

    await syncExternalPlayerLiveStatus(
      "game-1",
      "ext-xyz",
      "substitute",
      fetcher,
    );

    const [, init] = fetcher.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      externalConvocationId: "ext-xyz",
      lineupStatus: "substitute",
    });
  });

  it("[3] NÃO chama o endpoint pré-jogo /convocation/external/lineup", async () => {
    const fetcher = mockFetch({ ok: true });

    await syncExternalPlayerLiveStatus(
      "game-1",
      "ext-1",
      "on_field",
      fetcher,
    );

    const [url] = fetcher.mock.calls[0];
    expect(url).not.toContain("convocation/external/lineup");
    expect(url).toContain("live/external-players");
  });

  it("[4] throw com mensagem do servidor quando response não-OK", async () => {
    const fetcher = mockFetch({
      ok: false,
      body: { error: "Sem permissões." },
    });

    await expect(
      syncExternalPlayerLiveStatus("game-1", "ext-1", "on_field", fetcher),
    ).rejects.toThrow("Sem permissões.");
  });

  it("[5] throw genérico quando response não-OK sem body útil", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error("not json")),
    } as unknown as Response);

    await expect(
      syncExternalPlayerLiveStatus("game-1", "ext-1", "on_field", fetcher),
    ).rejects.toThrow("live_external_player_status_save_failed");
  });

  it("[6] propaga erro de rede do fetcher", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network down"));

    await expect(
      syncExternalPlayerLiveStatus("game-1", "ext-1", "on_field", fetcher),
    ).rejects.toThrow("network down");
  });

  it("[7] gameId com caracteres especiais é interpolado correctamente", async () => {
    const fetcher = mockFetch({ ok: true });

    await syncExternalPlayerLiveStatus(
      "550e8400-e29b-41d4-a716-446655440000",
      "ext-1",
      "on_field",
      fetcher,
    );

    const [url] = fetcher.mock.calls[0];
    expect(url).toBe(
      "/api/games/550e8400-e29b-41d4-a716-446655440000/live/external-players",
    );
  });
});
