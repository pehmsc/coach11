import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  resolveUserTeamContext,
  type UserTeamContext,
} from "@/lib/auth/team-context";

type AuthResult =
  | {
      userId: string;
      db: SupabaseClient;
      context: UserTeamContext;
      error?: never;
    }
  | { userId?: never; db?: never; context?: never; error: NextResponse };

/**
 * Authenticate the request and resolve the user's team context.
 * Returns `{ userId, db, context }` on success or `{ error }` with a 401/403 NextResponse on failure.
 *
 * O `db` é o session client com RLS activo — as policies permissivas nas tabelas
 * core (training_sessions, games, players, etc.) garantem acesso legítimo.
 */
export async function requireAuth(): Promise<AuthResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }

  const context = await resolveUserTeamContext(supabase, user.id);

  if (context.accessibleAgeGroupIds.length === 0) {
    return {
      error: NextResponse.json(
        { error: "Sem escalão associado." },
        { status: 403 },
      ),
    };
  }

  return { userId: user.id, db: supabase, context };
}
