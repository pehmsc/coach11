import "server-only";

import { createClient } from "@/lib/supabase/server";
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

export type ReadAccessResult =
  | {
      allowed: true;
      userId: string;
      ageGroupId: string;
      clubId: string;
      teamId: string | null;
    }
  | { allowed: false; response: NextResponse };

export type PermissionCheckResult = PermissionCheckSuccess | PermissionCheckFailure;

export async function checkReadAccess(): Promise<ReadAccessResult> {
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

  const context = await resolveUserTeamContext(supabase, user.id);

  if (!context.ageGroup?.id) {
    return {
      allowed: false,
      response: NextResponse.json({ error: "Sem escalão associado" }, { status: 403 }),
    };
  }

  const { data: ageGroup } = await supabase
    .from("age_groups")
    .select("club_id")
    .eq("id", context.ageGroup.id)
    .single();

  if (!ageGroup?.club_id) {
    return {
      allowed: false,
      response: NextResponse.json({ error: "Clube não encontrado" }, { status: 403 }),
    };
  }

  return {
    allowed: true,
    userId: user.id,
    ageGroupId: context.ageGroup.id,
    clubId: ageGroup.club_id,
    teamId: context.teamId,
  };
}

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

  const context = await resolveUserTeamContext(supabase, user.id);

  if (!context.ageGroup?.id) {
    return {
      allowed: false,
      response: NextResponse.json({ error: "Sem escalão associado" }, { status: 403 }),
    };
  }

  const allowed = await hasPermission(supabase, {
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
