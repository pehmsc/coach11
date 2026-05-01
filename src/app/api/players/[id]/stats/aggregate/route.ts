import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { respondInternalError } from "@/lib/http/respond-internal-error";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const context = await resolveUserTeamContext(supabase, user.id);

    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("id, age_group_id, club_id")
      .eq("id", id)
      .maybeSingle();

    if (playerError) {
      return respondInternalError(
        "api.players.id.stats.aggregate.player",
        playerError,
      );
    }
    if (!player) {
      return NextResponse.json(
        { error: "Atleta não encontrado." },
        { status: 404 },
      );
    }
    if (!context.accessibleAgeGroupIds.includes(player.age_group_id)) {
      return NextResponse.json(
        { error: "Sem permissões para ver este atleta." },
        { status: 403 },
      );
    }

    // Determinar época actual via age_groups.season (convenção do projeto;
    // get_player_season_stats aceita p_season=null para ignorar filtro,
    // mas preferimos passar a época real do escalão para alinhar com
    // /api/statistics/players).
    const { data: ageGroup } = await supabase
      .from("age_groups")
      .select("season")
      .eq("id", player.age_group_id)
      .maybeSingle();

    const season =
      typeof (ageGroup as { season?: unknown } | null)?.season === "string"
        ? (ageGroup as { season: string }).season
        : null;

    const clubIdRaw = (player as { club_id?: string | null }).club_id ?? null;
    if (!clubIdRaw) {
      // Atleta sem club_id (legacy ou inconsistência) — devolver stats vazios
      // em vez de 500. Permite UI mostrar "Sem dados para a época actual."
      return NextResponse.json({ success: true, stats: null });
    }

    // A RPC get_player_season_stats devolve TODOS os jogadores do escalão.
    // Filtramos por player_id no servidor por simplicidade — ~25 players
    // típicos é overhead negligível. Se aparecer perf issue, considerar
    // adicionar p_player_id à RPC numa migration futura.
    const { data: allStats, error: rpcError } = await supabase.rpc(
      "get_player_season_stats",
      {
        p_club_id: clubIdRaw,
        p_age_group_id: player.age_group_id,
        p_season: season,
      },
    );

    if (rpcError) {
      return respondInternalError(
        "api.players.id.stats.aggregate.rpc",
        rpcError,
      );
    }

    const playerStats =
      (allStats as Array<{ player_id: string }> | null)?.find(
        (s) => s.player_id === id,
      ) ?? null;

    return NextResponse.json({ success: true, stats: playerStats });
  } catch (error) {
    return respondInternalError("api.players.id.stats.aggregate", error);
  }
}
