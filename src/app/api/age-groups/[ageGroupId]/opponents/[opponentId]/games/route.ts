import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { getGameResult, getOpponentScore, getOurScore } from "@/lib/games/score-helpers";

type RouteContext = {
  params: Promise<{ ageGroupId: string; opponentId: string }>;
};

type GameRow = {
  id: string;
  game_datetime: string | null;
  is_home: boolean | null;
  score_home: number | null;
  score_away: number | null;
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
        `id, game_datetime, is_home, score_home, score_away,
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

    // Agregar stats apenas em jogos completed (fonte de verdade: score_home/away + is_home)
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;

    for (const g of games) {
      const result = getGameResult(g);
      if (result === null) continue;
      const our = getOurScore(g);
      const opp = getOpponentScore(g);
      if (our === null || opp === null) continue;
      goalsFor += our;
      goalsAgainst += opp;
      if (result === "W") wins += 1;
      else if (result === "L") losses += 1;
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
