import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { respondInternalError } from "@/lib/http/respond-internal-error";

type RouteContext = {
  params: Promise<{ ageGroupId: string; opponentId: string }>;
};

type GameRow = {
  id: string;
  game_datetime: string | null;
  is_home: boolean | null;
  goals_scored: number | null;
  goals_conceded: number | null;
  competition_id: string | null;
  title: string | null;
  status: string | null;
  competitions: { id: string; name: string | null } | null;
};

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { ageGroupId, opponentId } = await params;
    if (!ageGroupId || !opponentId) {
      return NextResponse.json({ error: "Parametros invalidos." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    const context = await resolveUserTeamContext(supabase, user.id);
    if (!context.accessibleAgeGroupIds.includes(ageGroupId)) {
      return NextResponse.json(
        { error: "Sem permissoes para este escalao." },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from("games")
      .select(
        `id, game_datetime, is_home, goals_scored, goals_conceded,
         competition_id, title, status,
         competitions:competitions(id, name)`,
      )
      .eq("opponent_id", opponentId)
      .eq("age_group_id", ageGroupId)
      .order("game_datetime", { ascending: false });

    if (error) {
      return respondInternalError(
        "api.age-groups.opponents.games.get",
        error,
        { request, userId: user.id, ageGroupId },
      );
    }

    const games = (data ?? []) as unknown as GameRow[];

    // Agregar stats apenas em jogos completed com goals preenchidos
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;

    for (const g of games) {
      if (g.status !== "completed") continue;
      if (g.goals_scored == null || g.goals_conceded == null) continue;
      goalsFor += g.goals_scored;
      goalsAgainst += g.goals_conceded;
      if (g.goals_scored > g.goals_conceded) wins += 1;
      else if (g.goals_scored < g.goals_conceded) losses += 1;
      else draws += 1;
    }

    return NextResponse.json({
      success: true,
      stats: {
        wins,
        draws,
        losses,
        goals_for: goalsFor,
        goals_against: goalsAgainst,
      },
      games,
    });
  } catch (error) {
    return respondInternalError(
      "api.age-groups.opponents.games.get",
      error,
      { request },
    );
  }
}
