import { describe, expect, it } from "vitest";
import {
  formatCardEventLabel,
  type CardEventLike,
} from "./format-card-event-label";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const EXT1 = "external:33333333-3333-4333-8333-333333333333";

function ev(
  id: string,
  event_type: string,
  player_id: string | null,
  minute: number,
  options?: { is_opponent_event?: boolean; created_at?: string },
): CardEventLike {
  return {
    id,
    event_type,
    player_id,
    minute,
    is_opponent_event: options?.is_opponent_event ?? false,
    created_at:
      options?.created_at ??
      `2026-05-11T10:${String(minute).padStart(2, "0")}:00Z`,
  };
}

describe("formatCardEventLabel", () => {
  it("[1] 1º amarelo → 'Cartão Amarelo'", () => {
    const events = [ev("e1", "yellow_card", P1, 10)];
    expect(formatCardEventLabel(events[0], events)).toBe("Cartão Amarelo");
  });

  it("[2] 2º amarelo do mesmo jogador → '2º Cartão Amarelo'", () => {
    const events = [
      ev("e1", "yellow_card", P1, 10),
      ev("e2", "yellow_card", P1, 26),
    ];
    expect(formatCardEventLabel(events[1], events)).toBe("2º Cartão Amarelo");
  });

  it("[3] vermelho após 2 amarelos → 'Cartão Vermelho (por acumulação)'", () => {
    const events = [
      ev("e1", "yellow_card", P1, 10),
      ev("e2", "yellow_card", P1, 26),
      ev("e3", "red_card", P1, 26, { created_at: "2026-05-11T10:26:30Z" }),
    ];
    expect(formatCardEventLabel(events[2], events)).toBe(
      "Cartão Vermelho (por acumulação)",
    );
  });

  it("[4] vermelho directo (sem 2 amarelos prévios) → 'Cartão Vermelho'", () => {
    const events = [ev("e1", "red_card", P1, 30)];
    expect(formatCardEventLabel(events[0], events)).toBe("Cartão Vermelho");
  });

  it("[5] vermelho directo com 1 amarelo prévio → 'Cartão Vermelho' (não acumulação)", () => {
    const events = [
      ev("e1", "yellow_card", P1, 15),
      ev("e2", "red_card", P1, 30),
    ];
    expect(formatCardEventLabel(events[1], events)).toBe("Cartão Vermelho");
  });

  it("[6] externos: 2º amarelo a externo → '2º Cartão Amarelo'", () => {
    const events = [
      ev("e1", "yellow_card", EXT1, 5),
      ev("e2", "yellow_card", EXT1, 20),
    ];
    expect(formatCardEventLabel(events[1], events)).toBe("2º Cartão Amarelo");
  });

  it("[7] jogadores diferentes: amarelos de P1 não tornam amarelo de P2 em 2º", () => {
    const events = [
      ev("e1", "yellow_card", P1, 10),
      ev("e2", "yellow_card", P2, 15),
    ];
    expect(formatCardEventLabel(events[1], events)).toBe("Cartão Amarelo");
  });

  it("[8] amarelo do adversário ignora histórico do mesmo player_id", () => {
    const opponentEvent = ev("e1", "yellow_card", null, 30, {
      is_opponent_event: true,
    });
    expect(formatCardEventLabel(opponentEvent, [opponentEvent])).toBe(
      "Cartão Amarelo",
    );
  });

  it("[9] ordem cronológica por minute > created_at", () => {
    // events out of order: o evento "alvo" tem minute=26 mas created_at antes
    // de um outro yellow com minute=10.
    const events = [
      ev("e2", "yellow_card", P1, 26, { created_at: "2026-05-11T10:26:00Z" }),
      ev("e1", "yellow_card", P1, 10, { created_at: "2026-05-11T10:10:00Z" }),
    ];
    expect(formatCardEventLabel(events[0], events)).toBe("2º Cartão Amarelo");
  });

  it("[10] throws para event_type fora de cards", () => {
    const event = ev("e1", "goal", P1, 10);
    expect(() => formatCardEventLabel(event, [event])).toThrow();
  });

  it("[11] vermelho com 3 amarelos prévios (cenário absurdo): ainda 'por acumulação'", () => {
    const events = [
      ev("e1", "yellow_card", P1, 5),
      ev("e2", "yellow_card", P1, 10),
      ev("e3", "yellow_card", P1, 15),
      ev("e4", "red_card", P1, 20),
    ];
    expect(formatCardEventLabel(events[3], events)).toBe(
      "Cartão Vermelho (por acumulação)",
    );
  });

  it("[12] avaliar o mesmo evento na lista não conta como prévio (id check)", () => {
    const events = [ev("e1", "yellow_card", P1, 10)];
    // Garante que o próprio evento não é contado como amarelo prévio.
    expect(formatCardEventLabel(events[0], events)).toBe("Cartão Amarelo");
  });
});
