import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: game } = await admin
      .from("games")
      .select("id, team_id, age_group_id")
      .eq("id", gameId)
      .maybeSingle();

    if (!game) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }

    let hasAccess = false;
    let teamId: string | null = game.team_id;

    if (game.age_group_id) {
      const { data: ageGroup } = await admin
        .from("age_groups")
        .select("id")
        .eq("id", game.age_group_id)
        .eq("coordinator_id", user.id)
        .maybeSingle();
      hasAccess = !!ageGroup;
    }

    if (!teamId && game.age_group_id) {
      const { data: fallbackTeam } = await admin
        .from("teams")
        .select("id")
        .eq("age_group_id", game.age_group_id)
        .limit(1)
        .maybeSingle();
      teamId = fallbackTeam?.id ?? null;
    }

    if (!hasAccess && teamId) {
      const { data: staffLink } = await admin
        .from("team_staff")
        .select("id")
        .eq("team_id", teamId)
        .eq("profile_id", user.id)
        .maybeSingle();
      hasAccess = !!staffLink;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Sem permissões para guardar esta convocatória." },
        { status: 403 },
      );
    }

    const { data: convocationRows, error: convocationRowsError } = await admin
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
      const { data: createdConvocation, error: createError } = await admin
        .from("convocations")
        .insert({ game_id: gameId, status: "draft" })
        .select("id, status, created_at")
        .single();

      if (createError || !createdConvocation) {
        return NextResponse.json(
          { error: "Não foi possível criar a convocatória." },
          { status: 500 },
        );
      }

      convocation = createdConvocation;
    }

    if (convocation.status === "closed") {
      return NextResponse.json(
        { error: "A convocatória está fechada e não pode ser alterada." },
        { status: 400 },
      );
    }

    const allConvocationIds = convocationRows?.length
      ? convocationRows.map((row) => row.id)
      : [convocation.id];

    const { data: selectedRows, error: selectedError } = await admin
      .from("convocation_players")
      .select("player_id")
      .in("convocation_id", allConvocationIds);

    if (selectedError) {
      return NextResponse.json(
        { error: "Erro ao validar os jogadores convocados." },
        { status: 500 },
      );
    }

    const uniquePlayers = new Set((selectedRows || []).map((row) => row.player_id));
    const playersCount = uniquePlayers.size;

    if (!playersCount || playersCount <= 0) {
      return NextResponse.json(
        { error: "Seleciona pelo menos 1 jogador antes de guardar." },
        { status: 400 },
      );
    }

    const { error: updateError } = await admin
      .from("convocations")
      .update({ status: "confirmed" })
      .in("id", allConvocationIds);

    if (updateError) {
      return NextResponse.json(
        { error: "Erro ao guardar convocatória." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      status: "confirmed",
      players: playersCount,
    });
  } catch (error) {
    console.error("Erro ao confirmar convocatória:", error);

    const message =
      error instanceof Error ? error.message : "Erro interno ao guardar convocatória.";

    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        {
          error:
            "Configuração do servidor incompleta: falta SUPABASE_SERVICE_ROLE_KEY no ambiente de produção.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: message || "Erro interno ao guardar convocatória." },
      { status: 500 },
    );
  }
}
