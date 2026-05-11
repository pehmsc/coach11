/**
 * Devolve a label correcta para um evento de cartão considerando o histórico
 * do mesmo jogador no jogo. Solução cosmética em runtime — não exige coluna
 * `reason` em `game_events` (essa fica para o refactor `game_squads`).
 *
 * Regras:
 * - 1º `yellow_card` → "Cartão Amarelo"
 * - 2º `yellow_card` do mesmo jogador → "2º Cartão Amarelo"
 * - `red_card` precedido por 2+ amarelos do mesmo jogador → "Cartão Vermelho
 *   (por acumulação)"
 * - `red_card` directo (sem 2 amarelos prévios) → "Cartão Vermelho"
 *
 * Funciona uniformemente para internos (chave = `player_id`) e externos
 * (chave = `external:<uuid>`). Os eventos do cliente já vêm normalizados —
 * `player_id` carrega a chave lógica.
 */

export type CardEventLike = {
  id: string;
  event_type: string;
  player_id?: string | null;
  is_opponent_event?: boolean | null;
  created_at?: string | null;
  minute?: number | null;
};

function compareEvents(a: CardEventLike, b: CardEventLike): number {
  const minuteCmp = (a.minute ?? 0) - (b.minute ?? 0);
  if (minuteCmp !== 0) return minuteCmp;
  return (a.created_at || "").localeCompare(b.created_at || "");
}

export function formatCardEventLabel(
  event: CardEventLike,
  allGameEvents: ReadonlyArray<CardEventLike>,
): string {
  if (event.event_type !== "yellow_card" && event.event_type !== "red_card") {
    throw new Error(
      `formatCardEventLabel only handles cards, got: ${event.event_type}`,
    );
  }

  const thisKey =
    typeof event.player_id === "string" && event.player_id.length > 0
      ? event.player_id
      : null;
  if (!thisKey || event.is_opponent_event) {
    return event.event_type === "yellow_card"
      ? "Cartão Amarelo"
      : "Cartão Vermelho";
  }

  const priorYellowsCount = allGameEvents.filter((other) => {
    if (other.event_type !== "yellow_card") return false;
    if (other.is_opponent_event) return false;
    if (other.player_id !== thisKey) return false;
    if (other.id === event.id) return false;
    return compareEvents(other, event) < 0;
  }).length;

  if (event.event_type === "yellow_card") {
    return priorYellowsCount >= 1 ? "2º Cartão Amarelo" : "Cartão Amarelo";
  }

  return priorYellowsCount >= 2
    ? "Cartão Vermelho (por acumulação)"
    : "Cartão Vermelho";
}
