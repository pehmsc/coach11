import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
    const playerId = body?.playerId;

    if (!playerId || typeof playerId !== "string") {
      return NextResponse.json(
        { error: "playerId em falta no pedido." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: game, error: gameError } = await admin
      .from("games")
      .select("id, team_id, age_group_id")
      .eq("id", gameId)
      .maybeSingle();

    if (gameError) {
      return NextResponse.json(
        { error: "Erro ao validar o jogo." },
        { status: 500 },
      );
    }

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
        { error: "Sem permissões para editar esta convocatória." },
        { status: 403 },
      );
    }

    if (game.age_group_id) {
      const { data: player } = await admin
        .from("players")
        .select("id")
        .eq("id", playerId)
        .eq("age_group_id", game.age_group_id)
        .maybeSingle();

      if (!player) {
        return NextResponse.json(
          { error: "Jogador inválido para este jogo." },
          { status: 400 },
        );
      }
    }

    let { data: convocation } = await admin
      .from("convocations")
      .select("id")
      .eq("game_id", gameId)
      .maybeSingle();

    if (!convocation) {
      const { data: newConvocation, error: createConvError } = await admin
        .from("convocations")
        .insert({ game_id: gameId, status: "draft" })
        .select("id")
        .single();

      if (createConvError || !newConvocation) {
        return NextResponse.json(
          { error: "Não foi possível criar a convocatória." },
          { status: 500 },
        );
      }

      convocation = newConvocation;
    }

    const { data: existing } = await admin
      .from("convocation_players")
      .select("id")
      .eq("convocation_id", convocation.id)
      .eq("player_id", playerId)
      .maybeSingle();

    if (existing) {
      const { error: deleteError } = await admin
        .from("convocation_players")
        .delete()
        .eq("id", existing.id);

      if (deleteError) {
        return NextResponse.json(
          { error: "Erro ao remover jogador da convocatória." },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, isConvocated: false });
    }

    const { error: insertError } = await admin.from("convocation_players").insert({
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

    return NextResponse.json({ success: true, isConvocated: true });
  } catch (error) {
    console.error("Erro no toggle da convocatória:", error);
    return NextResponse.json(
      { error: "Erro interno ao atualizar a convocatória." },
      { status: 500 },
    );
  }
}
