/**
 * Sincroniza `external_player_convocations.lineup_status` durante o jogo
 * live (substituições, expulsões, qualquer mutação client-side de `isOnField`
 * para jogadores externos).
 *
 * Usa POST `/api/games/[id]/live/external-players` que valida apenas o gate
 * `canWrite` do jogo (sem o convocation-guard que bloqueia em `status='live'`).
 *
 * Não confundir com `/api/games/[id]/convocation/external/lineup` — esse é o
 * endpoint pré-jogo, rejeita 423 quando o jogo está em curso.
 */
export type ExternalLineupStatus = "on_field" | "substitute";

export async function syncExternalPlayerLiveStatus(
  gameId: string,
  externalConvocationId: string,
  lineupStatus: ExternalLineupStatus,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const res = await fetcher(`/api/games/${gameId}/live/external-players`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ externalConvocationId, lineupStatus }),
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      payload?.error || "live_external_player_status_save_failed",
    );
  }
}
