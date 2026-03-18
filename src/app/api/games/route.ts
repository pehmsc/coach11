import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { NextResponse } from "next/server";
import { SHORT_PRIVATE_CACHE_CONTROL } from "@/lib/http/cache";
import { respondInternalError } from "@/lib/http/respond-internal-error";

export async function GET(request: Request) {
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
          ageGroupId: null,
        },
        {
          headers: {
            "Cache-Control": SHORT_PRIVATE_CACHE_CONTROL,
          },
        },
      );
    }

    // Pagination: ?limit=50&offset=0 (defaults: limit=100, offset=0)
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 200);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

    const query = supabase
      .from("games")
      .select(
        "id, game_datetime, end_time, opponent_name, opponent_short_name, is_home, status, score_home, score_away, location, location_address, formatted_address, latitude, longitude, osm_place_id, location_source, title, competition_id, team_id, age_group_id, notes, image_url",
        { count: "exact" },
      )
      .in("team_id", context.accessibleTeamIds)
      .order("game_datetime", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: games, error: gamesError, count } = await query;

    if (gamesError) {
      return NextResponse.json({ error: "Erro ao carregar jogos." }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        linked: true,
        games: games || [],
        ageGroupId: context.ageGroup?.id ?? null,
        pagination: { limit, offset, total: count ?? 0 },
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
