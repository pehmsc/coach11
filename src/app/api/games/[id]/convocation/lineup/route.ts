import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type GameAccessContext = {
  exists: boolean;
  canWrite: boolean;
};

function parseGameAccessContext(value: unknown): GameAccessContext | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    exists: row.exists === true,
    canWrite: row.canWrite === true,
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
    const playerId =
      typeof body?.playerId === "string" ? body.playerId : null;
    const lineupStatus =
      body?.lineupStatus === "on_field" || body?.lineupStatus === "substitute"
        ? (body.lineupStatus as "on_field" | "substitute")
        : null;

    if (!playerId || !lineupStatus) {
      return NextResponse.json(
        { error: "Dados inválidos: playerId e lineupStatus são obrigatórios." },
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
        { error: "Sem permissões para editar o lineup deste jogo." },
        { status: 403 },
      );
    }

    const { data: convocationRows } = await supabase
      .from("convocations")
      .select("id, created_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    const latestConvocationId = convocationRows?.[0]?.id ?? null;
    if (!latestConvocationId) {
      return NextResponse.json(
        { error: "Convocatória não encontrada para este jogo." },
        { status: 400 },
      );
    }

    const { data: playerInConvocation } = await supabase
      .from("convocation_players")
      .select("id")
      .eq("convocation_id", latestConvocationId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (!playerInConvocation) {
      return NextResponse.json(
        { error: "Jogador não está convocado neste jogo." },
        { status: 400 },
      );
    }

    const dbStatus = lineupStatus === "on_field" ? "starter" : "on_bench";
    const payload = {
      status: dbStatus,
      start_minute: lineupStatus === "on_field" ? 0 : null,
      end_minute: null,
    };

    const { data: existingRows, error: existingRowsError } = await supabase
      .from("game_stats_live")
      .select("id")
      .eq("game_id", gameId)
      .eq("player_id", playerId);

    if (existingRowsError) {
      console.error("Erro ao validar lineup:", existingRowsError);
      return NextResponse.json(
        { error: "Erro ao guardar lineup." },
        { status: 500 },
      );
    }

    if ((existingRows || []).length > 0) {
      const { error: updateError } = await supabase
        .from("game_stats_live")
        .update(payload)
        .eq("game_id", gameId)
        .eq("player_id", playerId);

      if (!updateError) {
        return NextResponse.json({ success: true, playerId, lineupStatus });
      }

      console.error("Erro ao atualizar lineup:", updateError);
      return NextResponse.json(
        { error: "Erro ao guardar lineup." },
        { status: 500 },
      );
    }

    const { error: insertError } = await supabase.from("game_stats_live").insert({
      game_id: gameId,
      player_id: playerId,
      ...payload,
    });

    if (insertError) {
      console.error("Erro ao inserir lineup:", insertError);
      return NextResponse.json(
        { error: "Erro ao guardar lineup." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, playerId, lineupStatus });
  } catch (error) {
    console.error("Erro ao guardar lineup:", error);
    return respondInternalError("api.games.id.convocation.lineup.post", error);
  }
}
