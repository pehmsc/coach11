import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type FinalStatInput = {
  player_id: string;
  lineup_type: "starter" | "substitute";
  minutes_played: number;
  goals: number;
  own_goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  coach_rating: number | null;
  notes?: string | null;
  is_mvp: boolean;
  is_finalized: boolean;
};

type FinalizePayload = {
  finalStats: FinalStatInput[];
  score_home: number;
  score_away: number;
  final_minute?: number;
};

type GameAccessContext = {
  exists: boolean;
  canWrite: boolean;
  isCoordinator: boolean;
  status: string | null;
};

function parseGameAccessContext(value: unknown): GameAccessContext | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    exists: row.exists === true,
    canWrite: row.canWrite === true,
    isCoordinator: row.isCoordinator === true,
    status: typeof row.status === "string" ? row.status : null,
  };
}

function isValidFinalStat(row: unknown): row is FinalStatInput {
  if (!row || typeof row !== "object") return false;
  const stat = row as Partial<FinalStatInput>;

  if (typeof stat.player_id !== "string" || stat.player_id.length === 0) return false;
  if (stat.lineup_type !== "starter" && stat.lineup_type !== "substitute") return false;
  if (typeof stat.minutes_played !== "number" || !Number.isFinite(stat.minutes_played)) return false;
  if (typeof stat.goals !== "number" || !Number.isFinite(stat.goals)) return false;
  if (typeof stat.own_goals !== "number" || !Number.isFinite(stat.own_goals)) return false;
  if (typeof stat.assists !== "number" || !Number.isFinite(stat.assists)) return false;
  if (typeof stat.yellow_cards !== "number" || !Number.isFinite(stat.yellow_cards)) return false;
  if (typeof stat.red_cards !== "number" || !Number.isFinite(stat.red_cards)) return false;
  if (stat.notes !== undefined && stat.notes !== null && typeof stat.notes !== "string") {
    return false;
  }
  if (stat.coach_rating !== null && stat.coach_rating !== undefined) {
    if (typeof stat.coach_rating !== "number" || stat.coach_rating < 0 || stat.coach_rating > 10) {
      return false;
    }
  }
  if (typeof stat.is_mvp !== "boolean") return false;
  if (typeof stat.is_finalized !== "boolean") return false;
  return true;
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Partial<FinalizePayload> | null;
    if (!body) {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }

    const finalStats = Array.isArray(body.finalStats) ? body.finalStats : [];
    if (!finalStats.every((row) => isValidFinalStat(row))) {
      return NextResponse.json({ error: "Formato de estatísticas finais inválido." }, { status: 400 });
    }

    // Limite máximo de 99 golos por jogo — valor realista para qualquer formato.
    const MAX_SCORE = 99;
    const scoreHome =
      typeof body.score_home === "number" && Number.isFinite(body.score_home)
        ? Math.min(MAX_SCORE, Math.max(0, Math.floor(body.score_home)))
        : null;
    const scoreAway =
      typeof body.score_away === "number" && Number.isFinite(body.score_away)
        ? Math.min(MAX_SCORE, Math.max(0, Math.floor(body.score_away)))
        : null;

    if (scoreHome === null || scoreAway === null) {
      return NextResponse.json({ error: "Score final inválido." }, { status: 400 });
    }

    const finalMinute =
      typeof body.final_minute === "number" && Number.isFinite(body.final_minute)
        ? Math.max(1, Math.floor(body.final_minute))
        : null;

    const { data: accessData, error: accessError } = await supabase.rpc(
      "rpc_game_access_context",
      {
        p_game_id: gameId,
      },
    );

    if (accessError) {
      return NextResponse.json({ error: "Erro ao validar jogo." }, { status: 500 });
    }

    const access = parseGameAccessContext(accessData);
    if (!access?.exists) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }
    if (!access.canWrite) {
      return NextResponse.json({ error: "Sem permissões." }, { status: 403 });
    }
    if (access.status === "completed" && !access.isCoordinator) {
      return NextResponse.json(
        { error: "Só o coordenador pode editar jogos terminados." },
        { status: 403 },
      );
    }

    const rowsToInsert = finalStats.map((row) => ({
      game_id: gameId,
      player_id: row.player_id,
      lineup_type: row.lineup_type,
      minutes_played: Math.max(0, Math.floor(row.minutes_played)),
      goals: Math.max(0, Math.floor(row.goals)),
      own_goals: Math.max(0, Math.floor(row.own_goals)),
      assists: Math.max(0, Math.floor(row.assists)),
      yellow_cards: Math.max(0, Math.floor(row.yellow_cards)),
      red_cards: Math.max(0, Math.floor(row.red_cards)),
      coach_rating: row.coach_rating,
      notes: row.notes ?? null,
      is_mvp: row.is_mvp,
      is_finalized: true,
      finalized_at: new Date().toISOString(),
    }));

    const rpcResult = await supabase.rpc("rpc_finalize_game_auth", {
      p_game_id: gameId,
      p_final_stats: rowsToInsert,
      p_score_home: scoreHome,
      p_score_away: scoreAway,
      p_final_minute: finalMinute,
      p_updated_by: user.id,
    });

    if (rpcResult.error) {
      if (rpcResult.error.message?.includes("game_not_found")) {
        return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
      }
      if (rpcResult.error.message?.includes("completed_requires_coordinator")) {
        return NextResponse.json(
          { error: "Só o coordenador pode editar jogos terminados." },
          { status: 403 },
        );
      }
      if (rpcResult.error.code === "42501") {
        return NextResponse.json({ error: "Sem permissões." }, { status: 403 });
      }

      return respondInternalError(
        "api.games.id.live.finalize.post.rpc-finalize-game-auth",
        rpcResult.error,
      );
    }

    const insertedRowsFromRpc =
      rpcResult.data &&
      typeof rpcResult.data === "object" &&
      "insertedRows" in rpcResult.data &&
      typeof (rpcResult.data as { insertedRows?: unknown }).insertedRows === "number"
        ? (rpcResult.data as { insertedRows: number }).insertedRows
        : null;

    return NextResponse.json({
      success: true,
      insertedRows: insertedRowsFromRpc ?? rowsToInsert.length,
    });
  } catch (error) {
    console.error("Live finalize error:", error);
    return respondInternalError("api.games.id.live.finalize.post", error);
  }
}
