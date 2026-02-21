import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type AgeGroupContext = {
  id: string;
  club_name: string;
  name: string;
  football_format: string | null;
};

async function pickPreferredTeamId(
  admin: ReturnType<typeof createAdminClient>,
  teamIds: string[],
) {
  if (teamIds.length === 0) return null;

  const { data: latestCompetition } = await admin
    .from("competitions")
    .select("team_id")
    .in("team_id", teamIds)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestCompetition?.team_id && teamIds.includes(latestCompetition.team_id)) {
    return latestCompetition.team_id;
  }

  return teamIds[0] ?? null;
}

async function resolveTeamContext(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const { data: managedAgeGroups, error: managedAgeGroupError } = await admin
    .from("age_groups")
    .select("id, club_name, name, football_format")
    .eq("coordinator_id", userId)
    .order("created_at", { ascending: true })
    .limit(20);

  if (managedAgeGroupError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Erro ao validar contexto do utilizador." }, { status: 500 }),
    };
  }

  if ((managedAgeGroups || []).length > 0) {
    const ageGroups = (managedAgeGroups || []) as AgeGroupContext[];
    const ageGroupIds = ageGroups.map((row) => row.id);

    const { data: teams, error: teamError } = await admin
      .from("teams")
      .select("id, age_group_id")
      .in("age_group_id", ageGroupIds)
      .order("created_at", { ascending: true })
      .limit(100);

    if (teamError) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: "Erro ao carregar equipa do coordenador." }, { status: 500 }),
      };
    }

    const teamRows = teams || [];
    const teamIds = teamRows.map((row) => row.id).filter((value): value is string => typeof value === "string");
    const preferredTeamId = await pickPreferredTeamId(admin, teamIds);
    const preferredTeam = teamRows.find((row) => row.id === preferredTeamId) || teamRows[0] || null;
    const preferredAgeGroup =
      ageGroups.find((row) => row.id === preferredTeam?.age_group_id) ||
      ageGroups[0] ||
      null;

    return {
      ok: true as const,
      teamId: preferredTeam?.id ?? null,
      ageGroup: preferredAgeGroup,
      isCoordinator: true,
    };
  }

  const { data: staffLinks, error: staffLinkError } = await admin
    .from("team_staff")
    .select("team_id")
    .eq("profile_id", userId)
    .order("created_at", { ascending: true })
    .limit(20);

  if (staffLinkError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Erro ao validar equipa técnica." }, { status: 500 }),
    };
  }

  const staffTeamIds = (staffLinks || [])
    .map((row) => row.team_id)
    .filter((value): value is string => typeof value === "string");

  if (staffTeamIds.length === 0) {
    return {
      ok: true as const,
      teamId: null,
      ageGroup: null,
      isCoordinator: false,
    };
  }

  const preferredStaffTeamId = await pickPreferredTeamId(admin, staffTeamIds);
  if (!preferredStaffTeamId) {
    return {
      ok: true as const,
      teamId: null,
      ageGroup: null,
      isCoordinator: false,
    };
  }

  const { data: staffTeam, error: staffTeamError } = await admin
    .from("teams")
    .select("age_group_id")
    .eq("id", preferredStaffTeamId)
    .maybeSingle();

  if (staffTeamError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Erro ao carregar equipa." }, { status: 500 }),
    };
  }

  let ageGroup: AgeGroupContext | null = null;
  if (staffTeam?.age_group_id) {
    const { data: staffAgeGroup, error: staffAgeGroupError } = await admin
      .from("age_groups")
      .select("id, club_name, name, football_format")
      .eq("id", staffTeam.age_group_id)
      .maybeSingle();

    if (staffAgeGroupError) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: "Erro ao carregar escalão da equipa." }, { status: 500 }),
      };
    }
    if (staffAgeGroup) ageGroup = staffAgeGroup as AgeGroupContext;
  }

  return {
    ok: true as const,
    teamId: preferredStaffTeamId,
    ageGroup,
    isCoordinator: false,
  };
}

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
    const context = await resolveTeamContext(admin, user.id);
    if (!context.ok) return context.response;

    if (!context.teamId) {
      return NextResponse.json(
        {
          success: true,
          teamId: null,
          ageGroup: context.ageGroup,
          isCoordinator: context.isCoordinator,
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
      .select("id, team_id, name, season, phase, num_opponents, total_rounds, has_two_legs, created_at")
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
          "id, competition_id, game_datetime, opponent_name, is_home, status, score_home, score_away, location, title, created_at",
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
        isCoordinator: context.isCoordinator,
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
