import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { observationPromoteSchema } from "@/lib/schemas/observations";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id: opponentId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const parsed = observationPromoteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { data: opponent, error: opponentError } = await supabase
      .from("opponents")
      .select("id, age_group_id")
      .eq("id", opponentId)
      .maybeSingle();
    if (opponentError) {
      return respondInternalError(
        "api.opponents.promote.post",
        opponentError,
        { request, userId: user.id },
      );
    }
    if (!opponent) {
      return NextResponse.json(
        { error: "Adversário não encontrado." },
        { status: 404 },
      );
    }

    const context = await resolveUserTeamContext(supabase, user.id);
    if (!context.accessibleAgeGroupIds.includes(opponent.age_group_id)) {
      return NextResponse.json({ error: "Sem permissões." }, { status: 403 });
    }

    const { error: rpcError } = await supabase.rpc(
      "rpc_promote_observations",
      {
        p_opponent_id: opponentId,
        p_observation_ids: parsed.data.observationIds,
        p_target_field: parsed.data.targetField,
      },
    );

    if (rpcError) {
      const message = rpcError.message ?? "Erro ao promover observações.";
      const isClientError =
        message.includes("Nenhuma observação válida") ||
        message.includes("Campo de destino inválido") ||
        message.includes("Nenhuma observação seleccionada");
      return NextResponse.json(
        { error: message },
        { status: isClientError ? 400 : 500 },
      );
    }

    return NextResponse.json({
      success: true,
      promotedCount: parsed.data.observationIds.length,
    });
  } catch (error) {
    return respondInternalError("api.opponents.promote.post", error, {
      request,
    });
  }
}
