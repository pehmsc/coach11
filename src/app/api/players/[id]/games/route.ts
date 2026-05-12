import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { respondInternalError } from "@/lib/http/respond-internal-error";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseLimit(value: string | null): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseOffset(value: string | null): number {
  const n = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id: playerId } = await params;
    if (!playerId) {
      return NextResponse.json({ error: "ID inválido." }, { status: 400 });
    }

    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const offset = parseOffset(url.searchParams.get("offset"));

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    const context = await resolveUserTeamContext(supabase, user.id);

    // Validar acesso pelo escalão do atleta.
    const { data: player } = await supabase
      .from("players")
      .select("id, age_group_id")
      .eq("id", playerId)
      .maybeSingle();
    if (!player) {
      return NextResponse.json(
        { error: "Atleta não encontrado." },
        { status: 404 },
      );
    }
    if (!context.accessibleAgeGroupIds.includes(player.age_group_id)) {
      return NextResponse.json(
        { error: "Sem permissões para ver este atleta." },
        { status: 403 },
      );
    }

    // Carregamos limit+1 rows para detectar `hasMore` sem count separado.
    // Top-level ORDER BY embedded column (PostgREST 11+ syntax).
    // `referencedTable: 'games'` apenas ordena dentro do embed (no-op para
    // m2o). `'games(game_datetime)'` ordena a query pai pela coluna do embed.
    const { data, error } = await supabase
      .from("game_final_stats")
      .select(
        `id, game_id, lineup_type, minutes_played, goals, assists,
         yellow_cards, red_cards, own_goals, coach_rating, is_mvp,
         games:games!inner(id, game_datetime, opponent_name, opponent_short_name,
                     score_home, score_away, is_home, competition_id, title,
                     competitions:competitions(name))`,
      )
      .eq("player_id", playerId)
      .eq("is_finalized", true)
      .order("games(game_datetime)", { ascending: false })
      .range(offset, offset + limit);

    if (error) {
      return respondInternalError("api.players.id.games.get", error);
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return NextResponse.json({ success: true, items, hasMore });
  } catch (error) {
    return respondInternalError("api.players.id.games.get", error);
  }
}
