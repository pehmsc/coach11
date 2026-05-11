import { describe, expect, it } from "vitest";
import {
  affectedPlayerKeysFromEvent,
  computeIsOnFieldAfterAllEvents,
  computeIsOnFieldImmediatelyBefore,
  playerKeyFromEvent,
  relatedPlayerKeyFromEvent,
  type GameEventLike,
} from "./compute-on-field-at-event";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const EXT1 = "external:33333333-3333-4333-8333-333333333333";

function ev(
  id: string,
  event_type: string,
  player_id: string | null,
  minute: number,
  options?: {
    related_player_id?: string | null;
    is_opponent_event?: boolean;
  },
): GameEventLike {
  return {
    id,
    event_type,
    player_id,
    related_player_id: options?.related_player_id ?? null,
    is_opponent_event: options?.is_opponent_event ?? false,
    created_at: `2026-05-11T10:${String(minute).padStart(2, "0")}:00Z`,
  };
}

describe("computeIsOnFieldAfterAllEvents", () => {
  it("[1] titular sem events anteriores → true", () => {
    expect(
      computeIsOnFieldAfterAllEvents(P1, [], [P1]),
    ).toBe(true);
  });

  it("[2] suplente sem events anteriores → false", () => {
    expect(
      computeIsOnFieldAfterAllEvents(P2, [ev("e1", "red_card", P1, 30)], [P1]),
    ).toBe(false);
  });

  it("[3] titular substituído (sub_out) → false", () => {
    const events = [
      ev("e1", "substitution_out", P1, 20),
      ev("e2", "substitution_in", P2, 20),
    ];
    expect(
      computeIsOnFieldAfterAllEvents(P1, events, [P1]),
    ).toBe(false);
  });

  it("[4] suplente que entrou via sub_in → true", () => {
    const events = [
      ev("e1", "substitution_out", P1, 20),
      ev("e2", "substitution_in", P2, 20),
    ];
    expect(
      computeIsOnFieldAfterAllEvents(P2, events, [P1]),
    ).toBe(true);
  });

  it("[5] externo titular com red → false (expulso)", () => {
    const events = [ev("e1", "red_card", EXT1, 30)];
    expect(
      computeIsOnFieldAfterAllEvents(EXT1, events, [EXT1]),
    ).toBe(false);
  });

  it("[6] sem o red apagado: externo titular volta a estar em campo", () => {
    // Cenário: red_card já foi removido do array antes de chamar o helper
    const eventsWithoutRed: GameEventLike[] = [];
    expect(
      computeIsOnFieldAfterAllEvents(EXT1, eventsWithoutRed, [EXT1]),
    ).toBe(true);
  });

  it("[7] cartão amarelo NÃO muda isOnField", () => {
    const events = [
      ev("e1", "yellow_card", P1, 10),
      ev("e2", "yellow_card", P1, 26),
    ];
    expect(
      computeIsOnFieldAfterAllEvents(P1, events, [P1]),
    ).toBe(true);
  });

  it("[8] sequência sub_out → sub_in (re-entra) → true", () => {
    const events = [
      ev("e1", "substitution_out", P1, 20),
      ev("e2", "substitution_in", P2, 20),
      // Improvável mas cobre que sub_in faz override de sub_out anterior
      ev("e3", "substitution_in", P1, 60),
      ev("e4", "substitution_out", P2, 60),
    ];
    expect(
      computeIsOnFieldAfterAllEvents(P1, events, [P1]),
    ).toBe(true);
  });

  it("[9] is_opponent_event true: ignora", () => {
    const events = [
      ev("e1", "red_card", P1, 30, { is_opponent_event: true }),
    ];
    expect(
      computeIsOnFieldAfterAllEvents(P1, events, [P1]),
    ).toBe(true);
  });

  it("[10] jogador inexistente no squad inicial → false (default seguro)", () => {
    const events = [ev("e1", "red_card", "ghost", 30)];
    expect(
      computeIsOnFieldAfterAllEvents("ghost", events, [P1]),
    ).toBe(false);
  });
});

describe("computeIsOnFieldImmediatelyBefore", () => {
  it("[1] titular: estado imediatamente antes do red é true (estava em campo)", () => {
    const events = [
      ev("e1", "yellow_card", P1, 10),
      ev("e2", "yellow_card", P1, 26),
      ev("e3", "red_card", P1, 26),
    ];
    expect(
      computeIsOnFieldImmediatelyBefore(P1, "e3", events, [P1]),
    ).toBe(true);
  });

  it("[2] titular substituído antes do red: estava fora antes do red → false", () => {
    const events = [
      ev("e1", "substitution_out", P1, 20),
      ev("e2", "substitution_in", P2, 20),
      ev("e3", "red_card", P1, 30),
    ];
    expect(
      computeIsOnFieldImmediatelyBefore(P1, "e3", events, [P1]),
    ).toBe(false);
  });

  it("[3] suplente que entrou via sub_in antes do red → true", () => {
    const events = [
      ev("e1", "substitution_in", P2, 20, { related_player_id: P1 }),
      ev("e2", "red_card", P2, 30),
    ];
    expect(
      computeIsOnFieldImmediatelyBefore(P2, "e2", events, [P1]),
    ).toBe(true);
  });

  it("[4] suplente com red sem nunca ter entrado → false", () => {
    const events = [ev("e1", "red_card", P2, 30)];
    expect(
      computeIsOnFieldImmediatelyBefore(P2, "e1", events, [P1]),
    ).toBe(false);
  });

  it("[5] targetEventId inexistente: fallback a estado final", () => {
    const events = [ev("e1", "red_card", P1, 30)];
    expect(
      computeIsOnFieldImmediatelyBefore(P1, "nope", events, [P1]),
    ).toBe(false);
  });
});

describe("playerKeyFromEvent / relatedPlayerKeyFromEvent", () => {
  it("[1] player_id presente → devolve", () => {
    expect(playerKeyFromEvent(ev("e1", "goal", P1, 10))).toBe(P1);
  });

  it("[2] player_id null → null", () => {
    expect(playerKeyFromEvent(ev("e1", "goal", null, 10))).toBeNull();
  });

  it("[3] related_player_id presente → devolve", () => {
    expect(
      relatedPlayerKeyFromEvent(
        ev("e1", "substitution_in", P2, 10, { related_player_id: P1 }),
      ),
    ).toBe(P1);
  });

  it("[4] external:<uuid> tratado como string normal", () => {
    expect(playerKeyFromEvent(ev("e1", "red_card", EXT1, 10))).toBe(EXT1);
  });
});

describe("affectedPlayerKeysFromEvent", () => {
  it("[1] red_card: 1 key", () => {
    expect(affectedPlayerKeysFromEvent(ev("e1", "red_card", P1, 10))).toEqual([
      P1,
    ]);
  });

  it("[2] substitution: 2 keys distintas", () => {
    expect(
      affectedPlayerKeysFromEvent(
        ev("e1", "substitution_out", P1, 10, { related_player_id: P2 }),
      ),
    ).toEqual([P1, P2]);
  });

  it("[3] event sem players: array vazio", () => {
    expect(affectedPlayerKeysFromEvent(ev("e1", "goal", null, 10))).toEqual([]);
  });

  it("[4] mesmo player como main e related: 1 key (sem duplicados)", () => {
    expect(
      affectedPlayerKeysFromEvent(
        ev("e1", "yellow_card", P1, 10, { related_player_id: P1 }),
      ),
    ).toEqual([P1]);
  });
});
