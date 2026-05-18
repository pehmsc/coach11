import { createClient } from "@/lib/supabase/server";

import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { NextResponse } from "next/server";
import { SHORT_PRIVATE_CACHE_CONTROL } from "@/lib/http/cache";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { isClosedGameStatus } from "@/lib/games/display";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const db = supabase;

    const { searchParams } = new URL(request.url);
    const requestedAgeGroupId = searchParams.get("ageGroupId");

    const context = await resolveUserTeamContext(db, user.id);
    const isCoordinator = context.source === "coordinator" || context.source === "club_coordinator";

    if (!context.ageGroup || !context.teamId) {
      return NextResponse.json(
        {
          success: true,
          teamId: context.teamId,
          ageGroup: context.ageGroup,
          isCoordinator,
          competitions: [],
        },
        {
          headers: {
            "Cache-Control": SHORT_PRIVATE_CACHE_CONTROL,
          },
        },
      );
    }

    // teamIds base: todos os acessiveis. Quando o cliente pede um escalao
    // especifico via ?ageGroupId, filtrar para apenas os teams desse escalao
    // (intercepta com accessibleTeams para nao expandir alem do permitido).
    const allAccessibleTeamIds =
      context.accessibleTeamIds.length > 0
        ? context.accessibleTeamIds
        : context.teamId
          ? [context.teamId]
          : [];

    const teamIds = requestedAgeGroupId
      ? context.accessibleTeams
          .filter((team) => team.age_group_id === requestedAgeGroupId)
          .map((team) => team.id)
      : allAccessibleTeamIds;

    const competitionsRes = await db
      .from("competitions")
      .select(
        "id, team_id, name, season, phase, team_label, num_opponents, total_rounds, has_two_legs, created_at",
      )
      .in("team_id", teamIds)
      .order("created_at", { ascending: false });

    if (competitionsRes.error) {
      return NextResponse.json({ error: "Erro ao carregar competições." }, { status: 500 });
    }

    const competitions = competitionsRes.data || [];
    const competitionIds = competitions
      .map((row) => row.id)
      .filter((value): value is string => typeof value === "string");

    const gamesByCompetition = new Map<string, Record<string, unknown>[]>();
    if (competitionIds.length > 0) {
      const gamesRes = await db
        .from("games")
        .select(
          "id, competition_id, game_datetime, opponent_name, opponent_short_name, is_home, status, score_home, score_away, location, formatted_address, latitude, longitude, osm_place_id, location_source, title, created_at",
        )
        .in("competition_id", competitionIds)
        .order("game_datetime", { ascending: true })
        .order("created_at", { ascending: true });

      if (gamesRes.error) {
        return NextResponse.json({ error: "Erro ao carregar jogos das competições." }, { status: 500 });
      }

      for (const game of gamesRes.data || []) {
        const competitionId = game.competition_id;
        if (typeof competitionId !== "string") continue;
        const list = gamesByCompetition.get(competitionId) || [];
        list.push(game as Record<string, unknown>);
        gamesByCompetition.set(competitionId, list);
      }
    }

    const enrichedCompetitions = competitions.map((competition) => {
      const games = gamesByCompetition.get(competition.id) || [];
      const hasPendingGames = games.some(
        (row) => !isClosedGameStatus(typeof row.status === "string" ? row.status : null),
      );
      return {
        ...competition,
        is_active: hasPendingGames || games.length === 0,
        games,
      };
    });

    return NextResponse.json(
      {
        success: true,
        teamId: context.teamId,
        ageGroup: context.ageGroup,
        isCoordinator,
        competitions: enrichedCompetitions,
      },
      {
        headers: {
          "Cache-Control": SHORT_PRIVATE_CACHE_CONTROL,
        },
      },
    );
  } catch (error) {
    return respondInternalError("api.competitions.get", error);
  }
}
