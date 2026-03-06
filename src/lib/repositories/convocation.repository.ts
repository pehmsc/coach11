import type { SupabaseClient } from "@supabase/supabase-js";

type ConvocationDbClient = SupabaseClient;

export type TacticalRpcResult = {
  ok?: boolean;
  error_code?: string;
};

export async function updateGameTacticalSystem(
  db: ConvocationDbClient,
  gameId: string,
  tacticalSystem: string | null,
) {
  return db.rpc("rpc_update_game_tactical_auth", {
    p_game_id: gameId,
    p_tactical_system: tacticalSystem,
  });
}
