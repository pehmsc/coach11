import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { NextResponse } from "next/server";
import { SHORT_PRIVATE_CACHE_CONTROL } from "@/lib/http/cache";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const context = await resolveUserTeamContext(supabase, user.id);

    if (context.accessibleTeamIds.length === 0) {
      return NextResponse.json(
        {
          success: true,
          linked: false,
          games: [],
        },
        {
          headers: {
            "Cache-Control": SHORT_PRIVATE_CACHE_CONTROL,
          },
        },
      );
    }

    const { data: games, error: gamesError } = await supabase
      .from("games")
      .select(
        "id, game_datetime, opponent_name, opponent_short_name, is_home, status, score_home, score_away, location, location_address, formatted_address, latitude, longitude, osm_place_id, location_source, title, competition_id, team_id, age_group_id",
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
          "Cache-Control": SHORT_PRIVATE_CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    return respondInternalError("api.games.get", error);
  }
}
