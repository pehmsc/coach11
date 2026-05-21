import type { LivePlayer } from "@/components/games/live/types";

/**
 * Ordena jogadores para apresentação em modais de eventos do live.
 *
 * Regra (Mai 2026):
 * 1. Em campo primeiro, banco depois, expulsos no fim
 * 2. Dentro de cada grupo:
 *    a. GR primeiro (preferred_position matches /gr|gk|guarda/i)
 *    b. Depois ordem ascendente por jersey_number (null/undefined no fim)
 * 3. Fallback: alfabético por first_name + last_name (estabilidade)
 *
 * NÃO usar em Substituição — lá há secções separadas "Em campo" e "Banco"
 * que já implicam essa ordenação.
 *
 * Jogadores expulsos (em `sentOffPlayerIds`) vão para o final, fora do grupo
 * em campo ou banco.
 */
const GOALKEEPER_REGEX = /gr|gk|guarda/i;

function isGoalkeeper(player: LivePlayer): boolean {
  return !!player.preferred_position && GOALKEEPER_REGEX.test(player.preferred_position);
}

function comparePlayers(a: LivePlayer, b: LivePlayer): number {
  const aGK = isGoalkeeper(a);
  const bGK = isGoalkeeper(b);
  if (aGK !== bGK) return aGK ? -1 : 1;

  const aJersey = a.jersey_number ?? Number.POSITIVE_INFINITY;
  const bJersey = b.jersey_number ?? Number.POSITIVE_INFINITY;
  if (aJersey !== bJersey) return aJersey - bJersey;

  const aName = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
  const bName = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim();
  return aName.localeCompare(bName, "pt", { sensitivity: "base" });
}

export function sortPlayersByFieldStatus(
  players: LivePlayer[],
  sentOffPlayerIds: Set<string> = new Set(),
): LivePlayer[] {
  const onField: LivePlayer[] = [];
  const onBench: LivePlayer[] = [];
  const expelled: LivePlayer[] = [];

  for (const player of players) {
    if (sentOffPlayerIds.has(player.id)) {
      expelled.push(player);
    } else if (player.isOnField) {
      onField.push(player);
    } else {
      onBench.push(player);
    }
  }

  return [
    ...onField.sort(comparePlayers),
    ...onBench.sort(comparePlayers),
    ...expelled.sort(comparePlayers),
  ];
}
