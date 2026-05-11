import { describe, expect, it } from "vitest";
import { hydrateIsOnFieldFromEvents } from "./hydrate-is-on-field";
import type { GameEventLike } from "./compute-on-field-at-event";

const TITULAR = "11111111-1111-4111-8111-aaaaaaaaaaaa";
const SUPLENTE = "22222222-2222-4222-8222-bbbbbbbbbbbb";
const EXTERNAL_KEY = "external:33333333-3333-4333-8333-cccccccccccc";
const EXTERNAL_KEY_2 = "external:44444444-4444-4444-8444-dddddddddddd";

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

describe("hydrateIsOnFieldFromEvents", () => {
  it("interno substituido fica fora de campo apos refresh", () => {
    const players = [
      { id: TITULAR, isOnField: true },
      { id: SUPLENTE, isOnField: false },
    ];
    const events = [
      ev("e1", "substitution_out", TITULAR, 30, SUPLENTE),
      ev("e2", "substitution_in", SUPLENTE, 30, TITULAR),
    ];
    const starterKeys = [TITULAR];

    const result = hydrateIsOnFieldFromEvents(players, events, starterKeys);

    expect(result.find((p) => p.id === TITULAR)?.isOnField).toBe(false);
    expect(result.find((p) => p.id === SUPLENTE)?.isOnField).toBe(true);
  });

  it("externo que entrou em campo mantem isOnField=true apos refresh (gap do PR #135)", () => {
    // Estado em memoria pos-refresh: convocation API devolve initial_lineup_status,
    // logo externo aparece como bench (false). Events corrigem para true.
    const players = [
      { id: TITULAR, isOnField: false },
      { id: EXTERNAL_KEY, isOnField: false },
    ];
    const events = [
      ev("e1", "substitution_out", TITULAR, 30, EXTERNAL_KEY),
      ev("e2", "substitution_in", EXTERNAL_KEY, 30, TITULAR),
    ];
    const starterKeys = [TITULAR];

    const result = hydrateIsOnFieldFromEvents(players, events, starterKeys);

    expect(result.find((p) => p.id === TITULAR)?.isOnField).toBe(false);
    expect(result.find((p) => p.id === EXTERNAL_KEY)?.isOnField).toBe(true);
  });

  it("jogador com red_card mantem isOnField=false apos refresh", () => {
    const players = [{ id: TITULAR, isOnField: true }];
    const events = [ev("e1", "red_card", TITULAR, 60)];
    const starterKeys = [TITULAR];

    const result = hydrateIsOnFieldFromEvents(players, events, starterKeys);

    expect(result.find((p) => p.id === TITULAR)?.isOnField).toBe(false);
  });

  it("externo expulso mantem isOnField=false apos refresh", () => {
    const players = [{ id: EXTERNAL_KEY, isOnField: true }];
    const events = [ev("e1", "red_card", EXTERNAL_KEY, 75)];
    const starterKeys = [EXTERNAL_KEY];

    const result = hydrateIsOnFieldFromEvents(players, events, starterKeys);

    expect(result.find((p) => p.id === EXTERNAL_KEY)?.isOnField).toBe(false);
  });

  it("sub_in apos sub_out: jogador volta a estar em campo (caso raro)", () => {
    const players = [{ id: TITULAR, isOnField: true }];
    const events = [
      ev("e1", "substitution_out", TITULAR, 30),
      ev("e2", "substitution_in", TITULAR, 60),
    ];
    const starterKeys = [TITULAR];

    const result = hydrateIsOnFieldFromEvents(players, events, starterKeys);

    expect(result.find((p) => p.id === TITULAR)?.isOnField).toBe(true);
  });

  it("devolve mesma referencia quando nenhum jogador muda (idempotencia)", () => {
    // Cenario pre-jogo: sem events, isOnField ja corresponde a starterKeys.
    const players = [
      { id: TITULAR, isOnField: true },
      { id: SUPLENTE, isOnField: false },
    ];
    const events: GameEventLike[] = [];
    const starterKeys = [TITULAR];

    const result = hydrateIsOnFieldFromEvents(players, events, starterKeys);

    expect(result).toBe(players);
  });

  it("sem events, isOnField alinha-se a starterKeys (corrige estado inconsistente)", () => {
    // Cenario: state local diz que SUPLENTE esta em campo mas nao e starter
    // e nao ha events que o tenham metido la (ex: bug previo).
    const players = [
      { id: TITULAR, isOnField: false },
      { id: SUPLENTE, isOnField: true },
    ];
    const events: GameEventLike[] = [];
    const starterKeys = [TITULAR];

    const result = hydrateIsOnFieldFromEvents(players, events, starterKeys);

    expect(result.find((p) => p.id === TITULAR)?.isOnField).toBe(true);
    expect(result.find((p) => p.id === SUPLENTE)?.isOnField).toBe(false);
  });

  it("multiplos externos com subs cruzadas", () => {
    const players = [
      { id: TITULAR, isOnField: false },
      { id: EXTERNAL_KEY, isOnField: false },
      { id: EXTERNAL_KEY_2, isOnField: false },
    ];
    const events = [
      ev("e1", "substitution_out", TITULAR, 30, EXTERNAL_KEY),
      ev("e2", "substitution_in", EXTERNAL_KEY, 30, TITULAR),
      ev("e3", "substitution_out", EXTERNAL_KEY, 60, EXTERNAL_KEY_2),
      ev("e4", "substitution_in", EXTERNAL_KEY_2, 60, EXTERNAL_KEY),
    ];
    const starterKeys = [TITULAR];

    const result = hydrateIsOnFieldFromEvents(players, events, starterKeys);

    expect(result.find((p) => p.id === TITULAR)?.isOnField).toBe(false);
    expect(result.find((p) => p.id === EXTERNAL_KEY)?.isOnField).toBe(false);
    expect(result.find((p) => p.id === EXTERNAL_KEY_2)?.isOnField).toBe(true);
  });
});
