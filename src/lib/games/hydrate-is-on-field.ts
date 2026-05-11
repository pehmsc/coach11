/**
 * Re-deriva `isOnField` para uma lista de jogadores a partir do squad inicial
 * + events. Usado pelo `useLiveGameState` para reconciliar o estado em memoria
 * com a fonte de verdade (events) sempre que `events` ou `initialStarterIds`
 * mudam.
 *
 * Antes do PR #135.5 a hidratacao inicial usava apenas `lineupStatuses` da
 * convocation API, ignorando substitution_in/out e red_card. Apos refresh
 * durante jogo live, externos voltavam ao `initial_lineup_status` em vez
 * do estado real apos substituicoes — gap documentado no PR #135.
 *
 * Idempotente: se nenhum jogador precisa de alteracao, devolve a mesma
 * referencia do array de entrada (evita re-render desnecessario no React).
 */

import {
  computeIsOnFieldAfterAllEvents,
  type GameEventLike,
} from "./compute-on-field-at-event";

export function hydrateIsOnFieldFromEvents<
  T extends { id: string; isOnField: boolean },
>(
  players: T[],
  events: ReadonlyArray<GameEventLike>,
  starterKeys: ReadonlyArray<string>,
): T[] {
  let changed = false;
  const next = players.map((player) => {
    const derived = computeIsOnFieldAfterAllEvents(
      player.id,
      events,
      starterKeys,
    );
    if (player.isOnField === derived) return player;
    changed = true;
    return { ...player, isOnField: derived };
  });
  return changed ? next : players;
}
