import { describe, expect, it } from "vitest";
import {
  planAutoRedCardsForSecondYellow,
  type CardEventInput,
} from "./auto-red-from-second-yellow";

const PLAYER_A = "11111111-1111-4111-8111-111111111111";
const PLAYER_B = "22222222-2222-4222-8222-222222222222";
const EXTERNAL = "external:33333333-3333-4333-8333-333333333333";

function yellow(playerId: string, minute = 30): CardEventInput {
  return {
    event_type: "yellow_card",
    player_id: playerId,
    is_opponent_event: false,
    minute,
  };
}

function red(playerId: string, minute = 30): CardEventInput {
  return {
    event_type: "red_card",
    player_id: playerId,
    is_opponent_event: false,
    minute,
  };
}

describe("planAutoRedCardsForSecondYellow", () => {
  it("[1] 1º amarelo (sem prévios): não gera red", () => {
    const result = planAutoRedCardsForSecondYellow(
      [yellow(PLAYER_A)],
      new Map(),
    );
    expect(result.autoRedRows).toHaveLength(0);
    expect(result.expelledByThisBatch.size).toBe(0);
  });

  it("[2] 2º amarelo (1 prévio): gera red automático", () => {
    const result = planAutoRedCardsForSecondYellow(
      [yellow(PLAYER_A, 45)],
      new Map([[PLAYER_A, 1]]),
    );
    expect(result.autoRedRows).toHaveLength(1);
    expect(result.autoRedRows[0]).toEqual({
      event_type: "red_card",
      player_id: PLAYER_A,
      related_player_id: null,
      minute: 45,
      is_opponent_event: false,
    });
    expect(result.expelledByThisBatch.has(PLAYER_A)).toBe(true);
  });

  it("[3] cliente já enviou yellow+red no mesmo batch: não duplica red", () => {
    const result = planAutoRedCardsForSecondYellow(
      [yellow(PLAYER_A, 45), red(PLAYER_A, 45)],
      new Map([[PLAYER_A, 1]]),
    );
    expect(result.autoRedRows).toHaveLength(0);
    expect(result.expelledByThisBatch.has(PLAYER_A)).toBe(true);
  });

  it("[4] dois amarelos consecutivos no mesmo batch (sem prévios): gera 1 red", () => {
    const result = planAutoRedCardsForSecondYellow(
      [yellow(PLAYER_A, 30), yellow(PLAYER_A, 60)],
      new Map(),
    );
    expect(result.autoRedRows).toHaveLength(1);
    expect(result.autoRedRows[0].minute).toBe(60);
    expect(result.expelledByThisBatch.has(PLAYER_A)).toBe(true);
  });

  it("[5] amarelos a dois jogadores diferentes: não afecta um ao outro", () => {
    const result = planAutoRedCardsForSecondYellow(
      [yellow(PLAYER_A), yellow(PLAYER_B)],
      new Map([[PLAYER_A, 1]]),
    );
    expect(result.autoRedRows).toHaveLength(1);
    expect(result.autoRedRows[0].player_id).toBe(PLAYER_A);
    expect(result.expelledByThisBatch.has(PLAYER_A)).toBe(true);
    expect(result.expelledByThisBatch.has(PLAYER_B)).toBe(false);
  });

  it("[6] amarelo é evento do adversário: ignora", () => {
    const result = planAutoRedCardsForSecondYellow(
      [{ ...yellow(PLAYER_A), is_opponent_event: true }],
      new Map([[PLAYER_A, 1]]),
    );
    expect(result.autoRedRows).toHaveLength(0);
    expect(result.expelledByThisBatch.size).toBe(0);
  });

  it("[7] jogador externo (id 'external:<uuid>'): regra aplica-se", () => {
    const result = planAutoRedCardsForSecondYellow(
      [yellow(EXTERNAL, 75)],
      new Map([[EXTERNAL, 1]]),
    );
    expect(result.autoRedRows).toHaveLength(1);
    expect(result.autoRedRows[0].player_id).toBe(EXTERNAL);
    expect(result.expelledByThisBatch.has(EXTERNAL)).toBe(true);
  });

  it("[8] event_type diferente de yellow_card: ignora", () => {
    const result = planAutoRedCardsForSecondYellow(
      [
        { event_type: "goal", player_id: PLAYER_A, is_opponent_event: false, minute: 10 },
        red(PLAYER_B),
      ],
      new Map([[PLAYER_A, 1]]),
    );
    expect(result.autoRedRows).toHaveLength(0);
    expect(result.expelledByThisBatch.size).toBe(0);
  });

  it("[9] amarelo sem player_id (e.g. evento adversário sem associação): ignora", () => {
    const result = planAutoRedCardsForSecondYellow(
      [{ event_type: "yellow_card", player_id: null, is_opponent_event: true, minute: 10 }],
      new Map(),
    );
    expect(result.autoRedRows).toHaveLength(0);
  });

  it("[10] batch vazio: devolve vazio", () => {
    const result = planAutoRedCardsForSecondYellow([], new Map([[PLAYER_A, 1]]));
    expect(result.autoRedRows).toHaveLength(0);
    expect(result.expelledByThisBatch.size).toBe(0);
  });

  it("[11] jogador já tinha 2 amarelos (estado inconsistente): NÃO gera 3º red duplicado se cliente envia red", () => {
    // Edge: estado prévio "impossível" mas defensivo
    const result = planAutoRedCardsForSecondYellow(
      [yellow(PLAYER_A), red(PLAYER_A)],
      new Map([[PLAYER_A, 2]]),
    );
    expect(result.autoRedRows).toHaveLength(0);
  });

  it("[12] mesmo jogador recebe 2 yellows no mesmo batch + cliente envia red: não duplica", () => {
    const result = planAutoRedCardsForSecondYellow(
      [yellow(PLAYER_A, 20), yellow(PLAYER_A, 65), red(PLAYER_A, 65)],
      new Map(),
    );
    expect(result.autoRedRows).toHaveLength(0);
    expect(result.expelledByThisBatch.has(PLAYER_A)).toBe(true);
  });
});
