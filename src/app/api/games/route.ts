import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const admin = createAdminClient();
    const context = await resolveUserTeamContext(admin, user.id);

    if (context.accessibleTeamIds.length === 0) {
      return NextResponse.json(
        {
          success: true,
          linked: false,
          games: [],
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const { data: games, error: gamesError } = await admin
      .from("games")
      .select(
        "id, game_datetime, opponent_name, opponent_short_name, is_home, status, score_home, score_away, location, title, competition_id, team_id, age_group_id",
      )
      .in("team_id", context.accessibleTeamIds)
      .order("game_datetime", { ascending: false });

    if (gamesError) {
      return NextResponse.json({ error: "Erro ao carregar jogos." }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        linked: true,
        games: games || [],
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Erro em GET /api/games:", error);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
