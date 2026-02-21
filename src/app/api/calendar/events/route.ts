import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type TeamRow = {
  id: string;
  age_group_id: string | null;
};

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const requestedAgeGroupId = searchParams.get("ageGroupId");

    if (!from || !to) {
      return NextResponse.json({ error: "Parâmetros from e to são obrigatórios." }, { status: 400 });
    }

    const admin = createAdminClient();

    const [managedAgeGroupsRes, staffLinksRes] = await Promise.all([
      admin
        .from("age_groups")
        .select("id, club_name, name")
        .eq("coordinator_id", user.id),
      admin
        .from("team_staff")
        .select("team_id")
        .eq("profile_id", user.id),
    ]);

    const managedAgeGroups = managedAgeGroupsRes.data || [];
    const managedAgeGroupIds = managedAgeGroups
      .map((row) => row.id)
      .filter((value): value is string => typeof value === "string");

    const staffTeamIds = (staffLinksRes.data || [])
      .map((row) => row.team_id)
      .filter((value): value is string => typeof value === "string");

    let staffTeams: TeamRow[] = [];
    if (staffTeamIds.length > 0) {
      const { data } = await admin
        .from("teams")
        .select("id, age_group_id")
        .in("id", staffTeamIds);
      staffTeams = (data || []) as TeamRow[];
    }

    const staffAgeGroupIds = staffTeams
      .map((row) => row.age_group_id)
      .filter((value): value is string => typeof value === "string");

    const accessibleAgeGroupIds = Array.from(
      new Set([...(managedAgeGroupIds || []), ...(staffAgeGroupIds || [])]),
    );

    if (accessibleAgeGroupIds.length === 0) {
      return NextResponse.json(
        {
          success: true,
          linked: false,
          sessions: [],
          games: [],
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const targetAgeGroupId =
      requestedAgeGroupId && accessibleAgeGroupIds.includes(requestedAgeGroupId)
        ? requestedAgeGroupId
        : accessibleAgeGroupIds[0];

    let ageGroupName = "";
    const managedMatch = managedAgeGroups.find((row) => row.id === targetAgeGroupId);
    if (managedMatch) {
      ageGroupName = `${managedMatch.club_name} · ${managedMatch.name}`;
    } else {
      const { data: ageGroup } = await admin
        .from("age_groups")
        .select("club_name, name")
        .eq("id", targetAgeGroupId)
        .maybeSingle();
      if (ageGroup) ageGroupName = `${ageGroup.club_name} · ${ageGroup.name}`;
    }

    const [{ data: sessions, error: sessionsError }, { data: games, error: gamesError }] =
      await Promise.all([
        admin
          .from("training_sessions")
          .select("*")
          .eq("age_group_id", targetAgeGroupId)
          .gte("session_date", from)
          .lte("session_date", to)
          .order("session_date", { ascending: true })
          .order("start_time", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true }),
        admin
          .from("games")
          .select("*")
          .eq("age_group_id", targetAgeGroupId)
          .gte("game_datetime", `${from}T00:00:00`)
          .lte("game_datetime", `${to}T23:59:59`)
          .order("game_datetime", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

    if (sessionsError) {
      return NextResponse.json({ error: "Erro ao carregar treinos do calendário." }, { status: 500 });
    }
    if (gamesError) {
      return NextResponse.json({ error: "Erro ao carregar jogos do calendário." }, { status: 500 });
    }

    const targetTeamId =
      staffTeams.find((row) => row.age_group_id === targetAgeGroupId)?.id ?? null;

    return NextResponse.json(
      {
        success: true,
        linked: true,
        ageGroupId: targetAgeGroupId,
        ageGroupName,
        teamId: targetTeamId,
        sessions: sessions || [],
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
