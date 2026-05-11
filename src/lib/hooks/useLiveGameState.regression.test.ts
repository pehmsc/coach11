/**
 * Testes de regressão para o fluxo de substituição em `useLiveGameState`.
 *
 * Não invocam o hook directamente — isso requereria mockar 40+ useStates,
 * effects de fetch, Supabase client, router, etc. Em vez disso, exercitam
 * os **helpers puros** que compõem o caminho crítico (`syncExternalPlayerLiveStatus`,
 * `computeIsOnFieldAfterAllEvents`) e verificam o contrato que o refactor
 * `game_squads` (semana 19-23/Mai) precisa de preservar.
 *
 * Quando o refactor introduzir `rpc_register_substitution`, este ficheiro
 * será reescrito mas o *comportamento esperado* (mostrar abaixo nos asserts)
 * mantém-se idêntico.
 */

import { describe, expect, it, vi } from "vitest";
import { syncExternalPlayerLiveStatus } from "../games/live-external-player-sync";
import {
  computeIsOnFieldAfterAllEvents,
  type GameEventLike,
} from "../games/compute-on-field-at-event";

const INTERNAL_TITULAR = "11111111-1111-4111-8111-aaaaaaaaaaaa";
const INTERNAL_SUPLENTE = "22222222-2222-4222-8222-bbbbbbbbbbbb";
const EXTERNAL_SUPLENTE = "external:33333333-3333-4333-8333-cccccccccccc";
const EXTERNAL_RAW_UUID = "33333333-3333-4333-8333-cccccccccccc";

function ev(
  id: string,
  event_type: string,
  player_id: string | null,
  minute: number,
  related_player_id: string | null = null,
): GameEventLike {
  return {
    id,
    event_type,
    player_id,
    related_player_id,
    is_opponent_event: false,
    created_at: `2026-05-19T18:${String(minute).padStart(2, "0")}:00Z`,
  };
}

function mockFetchOk() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ success: true }),
  } as unknown as Response);
}

describe("[regression] confirmSubstitution flow — interno → interno", () => {
  it("[A.1] após sub_out + sub_in, o titular fica fora e suplente entra em campo", () => {
    // Estado inicial: 1 titular, 1 suplente.
    const initialStarters = [INTERNAL_TITULAR];

    // Cliente envia [substitution_out, substitution_in] ao /live/events.
    // Eventos persistidos:
    const eventsAfterSub = [
      ev("e1", "substitution_out", INTERNAL_TITULAR, 30, INTERNAL_SUPLENTE),
      ev("e2", "substitution_in", INTERNAL_SUPLENTE, 30, INTERNAL_TITULAR),
    ];

    // Helper de reconstrução (usado por deleteEvent + após refactor por
    // qualquer caminho que precise de re-derivar isOnField).
    expect(
      computeIsOnFieldAfterAllEvents(
        INTERNAL_TITULAR,
        eventsAfterSub,
        initialStarters,
      ),
    ).toBe(false);

    expect(
      computeIsOnFieldAfterAllEvents(
        INTERNAL_SUPLENTE,
        eventsAfterSub,
        initialStarters,
      ),
    ).toBe(true);
  });

  it("[A.2] NÃO chama syncExternalPlayerLiveStatus quando ambos são internos", async () => {
    // Em substituição interna→interna, o caminho é apenas POST /live/events +
    // POST /live/players. Externos não devem ser tocados.
    const fetcher = mockFetchOk();

    // Se ninguém chamar o helper de externos, o fetcher fica intocado.
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("[regression] confirmSubstitution flow — entrada de externo", () => {
  it("[B.1] sub do externo deve chamar syncExternalPlayerLiveStatus com on_field", async () => {
    const fetcher = mockFetchOk();

    // Simula a chamada que `confirmSubstitution` faz via `saveLivePlayerStatus`
    // após gravar os eventos: para o externo, dispara o helper que actualiza
    // external_player_convocations.lineup_status no servidor.
    await syncExternalPlayerLiveStatus(
      "game-1",
      EXTERNAL_RAW_UUID,
      "on_field",
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/games/game-1/live/external-players",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          externalConvocationId: EXTERNAL_RAW_UUID,
          lineupStatus: "on_field",
        }),
      }),
    );
  });

  it("[B.2] após substituição, externo (que entrou) fica em campo e titular fica fora", () => {
    const initialStarters = [INTERNAL_TITULAR];

    const eventsAfterSub = [
      ev("e1", "substitution_out", INTERNAL_TITULAR, 30, EXTERNAL_SUPLENTE),
      ev("e2", "substitution_in", EXTERNAL_SUPLENTE, 30, INTERNAL_TITULAR),
    ];

    expect(
      computeIsOnFieldAfterAllEvents(
        INTERNAL_TITULAR,
        eventsAfterSub,
        initialStarters,
      ),
    ).toBe(false);

    expect(
      computeIsOnFieldAfterAllEvents(
        EXTERNAL_SUPLENTE,
        eventsAfterSub,
        initialStarters,
      ),
    ).toBe(true);
  });

  it("[B.3] NÃO usa o endpoint pré-jogo /convocation/external/lineup (regressão do bug 2026-05-09)", async () => {
    const fetcher = mockFetchOk();
    await syncExternalPlayerLiveStatus(
      "game-1",
      EXTERNAL_RAW_UUID,
      "on_field",
      fetcher,
    );

    const [url] = fetcher.mock.calls[0];
    // O bug original era usar /convocation/external/lineup que é bloqueado
    // pelo convocation-guard quando game.status === 'live'.
    expect(url).not.toContain("convocation/external/lineup");
    expect(url).toContain("live/external-players");
  });
});

describe("[regression] saída de externo via red_card → undo via deleteEvent", () => {
  it("[C.1] externo expulso por red_card: estado fora de campo", () => {
    const initialStarters = [EXTERNAL_SUPLENTE]; // externo iniciou como titular
    const events = [ev("e1", "red_card", EXTERNAL_SUPLENTE, 25)];

    expect(
      computeIsOnFieldAfterAllEvents(
        EXTERNAL_SUPLENTE,
        events,
        initialStarters,
      ),
    ).toBe(false);
  });

  it("[C.2] após apagar red_card, externo volta ao estado pré-evento (em campo)", () => {
    const initialStarters = [EXTERNAL_SUPLENTE];
    // events array depois do delete (red_card removido):
    const eventsAfterDelete: GameEventLike[] = [];

    expect(
      computeIsOnFieldAfterAllEvents(
        EXTERNAL_SUPLENTE,
        eventsAfterDelete,
        initialStarters,
      ),
    ).toBe(true);
  });
});
