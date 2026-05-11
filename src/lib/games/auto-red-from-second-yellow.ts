/**
 * Decide se um batch de eventos novos a inserir em `game_events` precisa de
 * adicionar `red_card`s auto-gerados por acumulação de 2 amarelos.
 *
 * Regra de domínio: 2º amarelo no mesmo jogo expulsa automaticamente. O
 * servidor é fonte de verdade — se o cliente envia só `yellow_card` num
 * cenário onde já existe 1 amarelo prévio, este helper devolve o
 * `red_card` extra para anexar ao batch. Se o cliente já enviou o
 * `red_card` para o mesmo jogador (cliente bem-sincronizado), não duplica.
 *
 * `player_id` é a chave lógica do cliente — pode ser UUID interno ou
 * `external:<uuid>` para externos.
 */

export type CardEventInput = {
  event_type: string;
  player_id?: string | null;
  is_opponent_event: boolean;
  minute: number;
};

export type AutoRedRow = CardEventInput & {
  event_type: "red_card";
  player_id: string;
  related_player_id: null;
  is_opponent_event: false;
};

export type AutoRedDecision = {
  /** Linhas a anexar ao batch (já formatadas como red_card auto). */
  autoRedRows: AutoRedRow[];
  /** Jogadores que ficam expulsos por causa deste batch. */
  expelledByThisBatch: Set<string>;
};

export function planAutoRedCardsForSecondYellow(
  rows: CardEventInput[],
  priorYellowsByPlayer: Map<string, number>,
): AutoRedDecision {
  const autoRedRows: AutoRedRow[] = [];
  const expelledByThisBatch = new Set<string>();
  const yellowAfterBatch = new Map(priorYellowsByPlayer);

  for (const row of rows) {
    if (row.event_type !== "yellow_card") continue;
    if (row.is_opponent_event) continue;
    const pid = row.player_id;
    if (!pid) continue;

    const next = (yellowAfterBatch.get(pid) ?? 0) + 1;
    yellowAfterBatch.set(pid, next);

    if (next < 2) continue;

    expelledByThisBatch.add(pid);

    const clientSentRedForPlayer = rows.some(
      (other) =>
        other.event_type === "red_card" &&
        !other.is_opponent_event &&
        other.player_id === pid,
    );
    const alreadyQueued = autoRedRows.some((other) => other.player_id === pid);
    if (clientSentRedForPlayer || alreadyQueued) continue;

    autoRedRows.push({
      event_type: "red_card",
      player_id: pid,
      related_player_id: null,
      minute: row.minute,
      is_opponent_event: false,
    });
  }

  return { autoRedRows, expelledByThisBatch };
}
