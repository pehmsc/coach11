/**
 * Reconstrói o estado `isOnField` de jogadores a partir do squad inicial
 * (titulares ao apito inicial) + lista de eventos de jogo, sem depender de
 * `game_stats_live` nem do estado React mutável.
 *
 * Usado quando o coach apaga um evento da timeline (red_card, substitution,
 * etc.) — `isOnField` deixa de poder ser simplesmente "revertido" do mutation
 * em React; precisamos reconstruir a partir do que sobra.
 *
 * Convenção: `playerKey` é o ID lógico do cliente — `player_id` (interno)
 * ou `external:<uuid>` (externo).
 */

export type GameEventLike = {
  id: string;
  event_type: string;
  player_id?: string | null;
  related_player_id?: string | null;
  is_opponent_event?: boolean | null;
  /**
   * `created_at` é usado apenas em variantes que ordenam por timestamp.
   * O helper principal assume que `events` já vem ordenado por
   * `minute ASC, created_at ASC` (convenção do `loadEventsFromBackend`).
   */
  created_at?: string | null;
};

export function playerKeyFromEvent(event: GameEventLike): string | null {
  if (typeof event.player_id === "string" && event.player_id.length > 0) {
    return event.player_id;
  }
  return null;
}

export function relatedPlayerKeyFromEvent(
  event: GameEventLike,
): string | null {
  if (
    typeof event.related_player_id === "string" &&
    event.related_player_id.length > 0
  ) {
    return event.related_player_id;
  }
  return null;
}

/**
 * Aplica um único evento à flag `isOnField` actual.
 * - `substitution_in` → entra em campo
 * - `substitution_out` → sai de campo
 * - `red_card` → sai de campo (expulso)
 * - tudo o resto → não mexe
 */
function applyEventToIsOnField(
  isOnField: boolean,
  eventType: string,
): boolean {
  if (eventType === "substitution_in") return true;
  if (eventType === "substitution_out") return false;
  if (eventType === "red_card") return false;
  return isOnField;
}

/**
 * Devolve o `isOnField` do jogador depois de processar TODOS os events
 * fornecidos (em ordem). Eventos com `is_opponent_event=true` ou sem
 * `player_id` que case com `playerKey` são ignorados.
 */
export function computeIsOnFieldAfterAllEvents(
  playerKey: string,
  events: ReadonlyArray<GameEventLike>,
  initialStarterKeys: ReadonlyArray<string>,
): boolean {
  let isOnField = initialStarterKeys.includes(playerKey);

  for (const event of events) {
    if (event.is_opponent_event) continue;
    const key = playerKeyFromEvent(event);
    if (key !== playerKey) continue;
    isOnField = applyEventToIsOnField(isOnField, event.event_type);
  }

  return isOnField;
}

/**
 * Devolve o `isOnField` do jogador IMEDIATAMENTE ANTES do evento indicado
 * por `targetEventId`. Útil para "se eu apagasse só este evento, qual era
 * o estado correcto?" — mas para o caso real de delete em cliente, usa
 * `computeIsOnFieldAfterAllEvents` com a lista já filtrada (`events sem o
 * deletado`).
 *
 * Se `targetEventId` não for encontrado, devolve o estado final (assume
 * que o evento não estava lá).
 */
export function computeIsOnFieldImmediatelyBefore(
  playerKey: string,
  targetEventId: string,
  events: ReadonlyArray<GameEventLike>,
  initialStarterKeys: ReadonlyArray<string>,
): boolean {
  const targetIdx = events.findIndex((event) => event.id === targetEventId);
  if (targetIdx === -1) {
    return computeIsOnFieldAfterAllEvents(playerKey, events, initialStarterKeys);
  }

  const eventsBefore = events.slice(0, targetIdx);
  return computeIsOnFieldAfterAllEvents(
    playerKey,
    eventsBefore,
    initialStarterKeys,
  );
}

/**
 * Recolhe todas as `playerKey`s tocadas por um evento (player_id +
 * related_player_id, ambos como chaves lógicas do cliente).
 */
export function affectedPlayerKeysFromEvent(
  event: GameEventLike,
): string[] {
  const keys: string[] = [];
  const main = playerKeyFromEvent(event);
  const related = relatedPlayerKeyFromEvent(event);
  if (main) keys.push(main);
  if (related && related !== main) keys.push(related);
  return keys;
}
