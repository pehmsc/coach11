type LivePersistencePlayer = {
  isExternal?: boolean;
};

export function filterPersistentLiveStatsPlayers<T extends LivePersistencePlayer>(
  players: T[],
) {
  return players.filter((player) => player.isExternal !== true);
}
