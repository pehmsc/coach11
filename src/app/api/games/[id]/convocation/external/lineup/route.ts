import { createClient } from "@/lib/supabase/server";
import {
  assertConvocationWriteAllowed,
  insertConvocationAuditLog,
} from "@/lib/games/convocation-guard";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
    const correctionReason =
      typeof body?.correctionReason === "string" ? body.correctionReason : null;
    const externalConvocationId =
      typeof body?.externalConvocationId === "string"
        ? body.externalConvocationId
        : null;
    const lineupStatus =
      body?.lineupStatus === "on_field" || body?.lineupStatus === "substitute"
        ? body.lineupStatus
        : null;

    if (!externalConvocationId || !lineupStatus) {
      return NextResponse.json(
        { error: "Dados inválidos: externalConvocationId e lineupStatus são obrigatórios." },
        { status: 400 },
      );
    }

    const writeGuard = await assertConvocationWriteAllowed(
      supabase,
      gameId,
      correctionReason,
    );
    if (!writeGuard.ok) {
      return writeGuard.response;
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("external_player_convocations")
      .update({ lineup_status: lineupStatus })
      .eq("id", externalConvocationId)
      .eq("game_id", gameId)
      .select("id")
      .limit(1);

    if (updateError) {
      return NextResponse.json(
        { error: "Erro ao guardar lineup do jogador externo." },
        { status: 500 },
      );
    }

    if (!updatedRows?.length) {
      return NextResponse.json(
        { error: "Jogador externo não encontrado nesta convocatória." },
        { status: 404 },
      );
    }

    await supabase
      .from("convocations")
      .update({ status: "draft" })
      .eq("game_id", gameId)
      .neq("status", "closed");

    if (writeGuard.requiresAudit && writeGuard.correctionReason) {
      await insertConvocationAuditLog({
        actorId: user.id,
        gameId,
        action: "convocation_external_lineup_updated_after_completed",
        correctionReason: writeGuard.correctionReason,
        payload: { externalPlayerId: externalConvocationId, lineupStatus },
      });
    }

    return NextResponse.json({
      success: true,
      externalConvocationId,
      lineupStatus,
    });
  } catch (error) {
    return respondInternalError(
      "api.games.id.convocation.external.lineup.post",
      error,
    );
  }
}
