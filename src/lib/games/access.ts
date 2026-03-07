import type { SupabaseClient } from "@supabase/supabase-js";

export type GameAccessContext = {
  exists: boolean;
  canAccess: boolean;
  canWrite: boolean;
  canWriteLive: boolean;
  isCoordinator: boolean;
  status: string | null;
  teamId: string | null;
  ageGroupId: string | null;
};

export function parseGameAccessContext(value: unknown): GameAccessContext | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;

  return {
    exists: row.exists === true,
    canAccess: row.canAccess === true,
    canWrite: row.canWrite === true,
    canWriteLive: row.canWriteLive === true,
    isCoordinator: row.isCoordinator === true,
    status: typeof row.status === "string" ? row.status : null,
    teamId: typeof row.teamId === "string" ? row.teamId : null,
    ageGroupId: typeof row.ageGroupId === "string" ? row.ageGroupId : null,
  };
}

export async function fetchGameAccessContext(
  supabase: SupabaseClient,
  gameId: string,
) {
  const { data, error } = await supabase.rpc("rpc_game_access_context", {
    p_game_id: gameId,
  });

  if (error) {
    throw new Error(`rpc_game_access_context_failed:${error.message}`);
  }

  return parseGameAccessContext(data);
}
