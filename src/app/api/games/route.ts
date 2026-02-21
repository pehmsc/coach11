import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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

    const [{ data: managedAgeGroups }, { data: staffLinks }] = await Promise.all([
      admin
        .from("age_groups")
        .select("id")
        .eq("coordinator_id", user.id),
      admin
        .from("team_staff")
        .select("team_id")
        .eq("profile_id", user.id),
    ]);

    const managedAgeGroupIds = (managedAgeGroups || [])
      .map((row) => row.id)
      .filter((value): value is string => typeof value === "string");

    let managedTeamIds: string[] = [];
    if (managedAgeGroupIds.length > 0) {
      const { data: managedTeams } = await admin
        .from("teams")
        .select("id")
        .in("age_group_id", managedAgeGroupIds);

      managedTeamIds = (managedTeams || [])
        .map((row) => row.id)
        .filter((value): value is string => typeof value === "string");
    }

    const staffTeamIds = (staffLinks || [])
      .map((row) => row.team_id)
      .filter((value): value is string => typeof value === "string");

    const accessibleTeamIds = Array.from(
      new Set([...(managedTeamIds || []), ...(staffTeamIds || [])]),
    );

    if (accessibleTeamIds.length === 0) {
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
        "id, game_datetime, opponent_name, is_home, status, score_home, score_away, location, title, competition_id, team_id, age_group_id",
      )
      .in("team_id", accessibleTeamIds)
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
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
