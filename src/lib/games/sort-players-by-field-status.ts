import type { LivePlayer } from "@/components/games/live/types";

/**
 * Ordena jogadores: em campo primeiro (alfabético por first_name + last_name),
 * banco depois (alfabético). Para uso em modais que apresentam lista de
 * jogadores elegíveis para evento (Golo, Cartão, Assistência).
 *
 * NÃO usar em Substituição — lá há secções separadas "Em campo" e "Banco"
 * que já implicam essa ordenação.
 *
 * Jogadores expulsos (em `sentOffPlayerIds`) contam como NÃO em campo —
 * vão para o final.
 */
export function sortPlayersByFieldStatus(
  players: LivePlayer[],
  sentOffPlayerIds: Set<string> = new Set(),
): LivePlayer[] {
  const byName = (a: LivePlayer, b: LivePlayer) => {
    const aName = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
    const bName = `${b.first_name ?? ""} ${b.last_name ?? ""}`.trim();
    return aName.localeCompare(bName, "pt", { sensitivity: "base" });
  };

  const onField: LivePlayer[] = [];
  const onBench: LivePlayer[] = [];

  for (const player of players) {
    if (player.isOnField && !sentOffPlayerIds.has(player.id)) {
      onField.push(player);
    } else {
      onBench.push(player);
    }
  }

  return [...onField.sort(byName), ...onBench.sort(byName)];
}
