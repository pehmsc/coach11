/**
 * Pequenas helpers puras associadas ao bug das "ghosts" em game_stats_live
 * (PR #126). Mantidas separadas dos route handlers para permitir testes
 * unitários sem mockar Supabase.
 */

interface LiveStatsLikeRow {
  player_id?: string | null;
  status?: string | null;
  start_minute?: number | null;
}

/**
 * Filtra rows de game_stats_live para excluir entradas cujo `player_id` já
 * não está no set de jogadores convocados (`convocation_players`). Estas
 * "ghosts" surgem quando um atleta é removido da convocatória sem cleanup
 * em game_stats_live.
 */
export function filterLiveStatsBySelected<T extends LiveStatsLikeRow>(
  rows: readonly T[],
  selectedIds: ReadonlySet<string>,
): T[] {
  return rows.filter(
    (row) =>
      typeof row.player_id === "string" && selectedIds.has(row.player_id),
  );
}
