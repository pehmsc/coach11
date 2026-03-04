import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RpcGameAccessContext = {
  exists: boolean;
  canWrite: boolean;
  isCoordinator: boolean;
  status: string | null;
  teamId: string | null;
  ageGroupId: string | null;
};

type ConvocationWriteGuardResult =
  | {
      ok: true;
      access: RpcGameAccessContext;
      correctionReason: string | null;
      requiresAudit: boolean;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function parseGameAccessContext(value: unknown): RpcGameAccessContext | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;

  return {
    exists: row.exists === true,
    canWrite: row.canWrite === true,
    isCoordinator: row.isCoordinator === true,
    status: typeof row.status === "string" ? row.status : null,
    teamId: typeof row.teamId === "string" ? row.teamId : null,
    ageGroupId: typeof row.ageGroupId === "string" ? row.ageGroupId : null,
  };
}

export async function assertConvocationWriteAllowed(
  supabase: SupabaseClient,
  gameId: string,
  correctionReason?: string | null,
): Promise<ConvocationWriteGuardResult> {
  const { data, error } = await supabase.rpc("rpc_game_access_context", {
    p_game_id: gameId,
  });

  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Erro ao validar o jogo." }, { status: 500 }),
    };
  }

  const access = parseGameAccessContext(data);
  if (!access?.exists) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 }),
    };
  }

  if (!access.canWrite) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sem permissões para editar esta convocatória." },
        { status: 403 },
      ),
    };
  }

  if (access.status === "scheduled") {
    return {
      ok: true,
      access,
      correctionReason: null,
      requiresAudit: false,
    };
  }

  if (access.status === "live") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "A convocatória fica bloqueada quando o jogo entra em live." },
        { status: 423 },
      ),
    };
  }

  if (access.status === "completed") {
    const normalizedReason = typeof correctionReason === "string"
      ? correctionReason.trim()
      : "";

    if (!access.isCoordinator) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Apenas o coordenador pode corrigir a convocatória após o jogo." },
          { status: 403 },
        ),
      };
    }

    // Mínimo de 3 caracteres após trim para evitar motivos vazios ou triviais.
    if (normalizedReason.length < 3) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Indica o motivo da correção antes de editar a convocatória (mínimo 3 caracteres)." },
          { status: 400 },
        ),
      };
    }

    return {
      ok: true,
      access,
      correctionReason: normalizedReason,
      requiresAudit: true,
    };
  }

  return {
    ok: false,
    response: NextResponse.json(
      { error: "Este jogo já não aceita alterações à convocatória." },
      { status: 423 },
    ),
  };
}

export async function insertConvocationAuditLog(input: {
  actorId: string;
  gameId: string;
  action: string;
  correctionReason: string;
  payload?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_logs").insert({
    actor_id: input.actorId,
    action: input.action,
    game_id: input.gameId,
    payload: {
      reason: input.correctionReason,
      ...(input.payload || {}),
    },
  });

  if (error) {
    throw new Error(`convocation_audit_insert_failed:${error.message}`);
  }
}
