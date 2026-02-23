import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type GameAccessContext = {
  exists: boolean;
  canWrite: boolean;
  ageGroupId: string | null;
};

function parseGameAccessContext(value: unknown): GameAccessContext | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    exists: row.exists === true,
    canWrite: row.canWrite === true,
    ageGroupId: typeof row.ageGroupId === "string" ? row.ageGroupId : null,
  };
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
    const playerId = body?.playerId;

    if (!playerId || typeof playerId !== "string") {
      return NextResponse.json(
        { error: "playerId em falta no pedido." },
        { status: 400 },
      );
    }

    const { data: accessData, error: accessError } = await supabase.rpc(
      "rpc_game_access_context",
      {
        p_game_id: gameId,
      },
    );

    if (accessError) {
      return NextResponse.json(
        { error: "Erro ao validar o jogo." },
        { status: 500 },
      );
    }

    const access = parseGameAccessContext(accessData);
    if (!access?.exists) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }

    if (!access.canWrite) {
      return NextResponse.json(
        { error: "Sem permissões para editar esta convocatória." },
        { status: 403 },
      );
    }

    if (access.ageGroupId) {
      const { data: player } = await supabase
        .from("players")
        .select("id")
        .eq("id", playerId)
        .eq("age_group_id", access.ageGroupId)
        .maybeSingle();

      if (!player) {
        return NextResponse.json(
          { error: "Jogador inválido para este jogo." },
          { status: 400 },
        );
      }
    }

    const { data: convocationRows, error: convocationRowsError } = await supabase
      .from("convocations")
      .select("id, status, created_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (convocationRowsError) {
      return NextResponse.json(
        { error: "Erro ao carregar a convocatória." },
        { status: 500 },
      );
    }

    let convocation = convocationRows?.[0] ?? null;

    if (!convocation) {
      const { data: newConvocation, error: createConvError } = await supabase
        .from("convocations")
        .insert({ game_id: gameId, status: "draft" })
        .select("id, status, created_at")
        .single();

      if (createConvError || !newConvocation) {
        return NextResponse.json(
          { error: "Não foi possível criar a convocatória." },
          { status: 500 },
        );
      }

      convocation = newConvocation;
    }

    if (convocation.status === "closed") {
      return NextResponse.json(
        { error: "A convocatória está fechada e não pode ser editada." },
        { status: 400 },
      );
    }

    const allConvocationIds = convocationRows?.length
      ? convocationRows.map((row) => row.id)
      : [convocation.id];

    const { data: existing } = await supabase
      .from("convocation_players")
      .select("id")
      .in("convocation_id", allConvocationIds)
      .eq("player_id", playerId)
      .limit(1);

    if ((existing?.length ?? 0) > 0) {
      const { error: deleteError } = await supabase
        .from("convocation_players")
        .delete()
        .in("convocation_id", allConvocationIds)
        .eq("player_id", playerId);

      if (deleteError) {
        return NextResponse.json(
          { error: "Erro ao remover jogador da convocatória." },
          { status: 500 },
        );
      }

      await supabase
        .from("convocations")
        .update({ status: "draft" })
        .eq("id", convocation.id)
        .neq("status", "closed");

      return NextResponse.json({ success: true, isConvocated: false });
    }

    const { error: insertError } = await supabase.from("convocation_players").insert({
      convocation_id: convocation.id,
      player_id: playerId,
    });

    if (insertError) {
      // Corrida entre requests: se já foi inserido por outro request, considerar sucesso.
      if (insertError.code === "23505") {
        return NextResponse.json({ success: true, isConvocated: true });
      }

      return NextResponse.json(
        { error: "Erro ao adicionar jogador à convocatória." },
        { status: 500 },
      );
    }

    await supabase
      .from("convocations")
      .update({ status: "draft" })
      .eq("id", convocation.id)
      .neq("status", "closed");

    return NextResponse.json({ success: true, isConvocated: true });
  } catch (error) {
    console.error("Erro no toggle da convocatória:", error);
    return respondInternalError("api.games.id.convocation.toggle.post", error);
  }
}
