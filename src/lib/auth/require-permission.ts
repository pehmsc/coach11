import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasPermission,
  type PermissionArea,
  type PermissionOperation,
} from "@/lib/auth/permissions";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { NextResponse } from "next/server";

export type PermissionCheckSuccess = {
  allowed: true;
  userId: string;
  ageGroupId: string;
  teamId: string | null;
};

export type PermissionCheckFailure = {
  allowed: false;
  response: NextResponse;
};

export type PermissionCheckResult = PermissionCheckSuccess | PermissionCheckFailure;

/**
 * Verifica se o utilizador autenticado tem permissão para uma área e operação.
 * Usar em API routes para proteger endpoints por permissão granular.
 *
 * @example
 * const check = await checkPermission("players", "write");
 * if (!check.allowed) return check.response;
 * // check.userId, check.ageGroupId disponíveis
 */
export async function checkPermission(
  area: PermissionArea,
  operation: PermissionOperation,
): Promise<PermissionCheckResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      allowed: false,
      response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
    };
  }

  const admin = createAdminClient();
  const context = await resolveUserTeamContext(admin, user.id);

  if (!context.ageGroup?.id) {
    return {
      allowed: false,
      response: NextResponse.json({ error: "Sem escalão associado" }, { status: 403 }),
    };
  }

  const allowed = await hasPermission(admin, {
    userId: user.id,
    userEmail: user.email,
    ageGroupId: context.ageGroup.id,
    area,
    operation,
  });

  if (!allowed) {
    return {
      allowed: false,
      response: NextResponse.json(
        { error: "Sem permissão para esta operação" },
        { status: 403 },
      ),
    };
  }

  return {
    allowed: true,
    userId: user.id,
    ageGroupId: context.ageGroup.id,
    teamId: context.teamId,
  };
}
