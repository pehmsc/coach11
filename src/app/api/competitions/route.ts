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
    const isCoordinator = context.source === "coordinator";

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
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const competitionsRes = await admin
      .from("competitions")
      .select(
        "id, team_id, name, season, phase, team_label, num_opponents, total_rounds, has_two_legs, created_at",
      )
      .eq("team_id", context.teamId)
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
      const gamesRes = await admin
        .from("games")
        .select(
          "id, competition_id, game_datetime, opponent_name, opponent_short_name, is_home, status, score_home, score_away, location, title, created_at",
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
      const hasPendingGames = games.some((row) => row.status !== "completed");
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
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
