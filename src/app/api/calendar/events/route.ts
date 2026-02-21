import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { NextResponse } from "next/server";

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
    const context = await resolveUserTeamContext(admin, user.id);

    if (context.accessibleAgeGroupIds.length === 0) {
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
      requestedAgeGroupId && context.accessibleAgeGroupIds.includes(requestedAgeGroupId)
        ? requestedAgeGroupId
        : context.ageGroup?.id || context.accessibleAgeGroupIds[0];

    let ageGroupName = "";
    if (targetAgeGroupId === context.ageGroup?.id && context.ageGroup) {
      ageGroupName = `${context.ageGroup.club_name} · ${context.ageGroup.name}`;
    } else {
      const { data: ageGroup } = await admin
        .from("age_groups")
        .select("club_name, name")
        .eq("id", targetAgeGroupId)
        .maybeSingle();
      if (ageGroup) {
        ageGroupName = `${ageGroup.club_name} · ${ageGroup.name}`;
      }
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

    const currentTeamAgeGroupId =
      context.teamId && context.accessibleTeams.find((row) => row.id === context.teamId)
        ? context.accessibleTeams.find((row) => row.id === context.teamId)?.age_group_id
        : null;
    const fallbackTeamId =
      context.accessibleTeams.find((row) => row.age_group_id === targetAgeGroupId)?.id ?? null;
    const targetTeamId =
      currentTeamAgeGroupId === targetAgeGroupId ? context.teamId : fallbackTeamId;

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
