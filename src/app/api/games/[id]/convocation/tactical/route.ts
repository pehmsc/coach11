import { createClient } from "@/lib/supabase/server";
import {
  assertConvocationWriteAllowed,
  insertConvocationAuditLog,
} from "@/lib/games/convocation-guard";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import {
  type TacticalRpcResult,
  updateGameTacticalSystem,
} from "@/lib/repositories/convocation.repository";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function mapTacticalError(errorCode: string | undefined) {
  switch (errorCode) {
    case "game_not_found":
      return {
        body: { error: "Jogo não encontrado." },
        status: 404,
      };
    case "forbidden":
      return {
        body: { error: "Sem permissões para editar este jogo." },
        status: 403,
      };
    default:
      return {
        body: { error: "Erro ao guardar sistema táctico." },
        status: 500,
      };
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const tacticalSystem =
      typeof body?.tacticalSystem === "string"
        ? body.tacticalSystem.trim()
        : null;
    const correctionReason =
      typeof body?.correctionReason === "string" ? body.correctionReason : null;

    const writeGuard = await assertConvocationWriteAllowed(
      supabase,
      gameId,
      correctionReason,
    );
    if (!writeGuard.ok) {
      return writeGuard.response;
    }

    const rpcResult = await updateGameTacticalSystem(
      supabase,
      gameId,
      tacticalSystem,
    );

    if (rpcResult.error) {
      return respondInternalError("api.games.id.convocation.tactical.post.rpc", rpcResult.error);
    }

    const result =
      rpcResult.data && typeof rpcResult.data === "object"
        ? (rpcResult.data as TacticalRpcResult)
        : null;

    if (!result?.ok) {
      const mapped = mapTacticalError(result?.error_code);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }

    if (writeGuard.requiresAudit && writeGuard.correctionReason) {
      await insertConvocationAuditLog({
        actorId: user.id,
        gameId,
        action: "convocation_tactical_updated_after_completed",
        correctionReason: writeGuard.correctionReason,
        payload: { tacticalSystem },
      });
    }

    return NextResponse.json({ success: true, tacticalSystem });
  } catch (error) {
    return respondInternalError("api.games.id.convocation.tactical.post", error);
  }
}
