import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveUserTeamContext,
  type UserTeamContext,
} from "@/lib/auth/team-context";

type AuthResult =
  | {
      userId: string;
      db: ReturnType<typeof createAdminClient>;
      context: UserTeamContext;
      error?: never;
    }
  | { userId?: never; db?: never; context?: never; error: NextResponse };

/**
 * Authenticate the request and resolve the user's team context.
 * Returns `{ userId, db, context }` on success or `{ error }` with a 401/403 NextResponse on failure.
 *
 * The returned `db` uses the admin client when available, falling back to the session client.
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

  let db: ReturnType<typeof createAdminClient>;
  try {
    db = createAdminClient();
  } catch {
    db = supabase as unknown as ReturnType<typeof createAdminClient>;
  }

  const context = await resolveUserTeamContext(db, user.id);

  if (context.accessibleAgeGroupIds.length === 0) {
    return {
      error: NextResponse.json(
        { error: "Sem escalão associado." },
        { status: 403 },
      ),
    };
  }

  return { userId: user.id, db, context };
}
