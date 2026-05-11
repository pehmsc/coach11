import { createClient } from "@/lib/supabase/server";
import {
  assertConvocationWriteAllowed,
  insertConvocationAuditLog,
} from "@/lib/games/convocation-guard";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Actualiza initial_lineup_status (starter/substitute) de um squad.
// Modelo unificado: aceita tanto jogadores internos como externos via
// game_squads.id (`squadId`). Compat retro: `playerId` legacy continua
// a funcionar (lookup pelo player_id correspondente).
//
// Dual-write para game_stats_live.status durante transição
// (D1: drop adiado). TODO: remove after game_stats_live.status drop.
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const squadId = typeof body?.squadId === "string" ? body.squadId : null;
    const playerId = typeof body?.playerId === "string" ? body.playerId : null;
    const lineupStatusRaw =
      body?.lineupStatus === "on_field" || body?.lineupStatus === "substitute"
        ? (body.lineupStatus as "on_field" | "substitute")
        : null;
    const correctionReason =
      typeof body?.correctionReason === "string" ? body.correctionReason : null;

    if ((!squadId && !playerId) || !lineupStatusRaw) {
      return NextResponse.json(
        {
          error:
            "Dados inválidos: squadId (ou playerId) e lineupStatus são obrigatórios.",
        },
        { status: 400 },
      );
    }

    const writeGuard = await assertConvocationWriteAllowed(
      supabase,
      gameId,
      correctionReason,
    );
    if (!writeGuard.ok) {
      return writeGuard.response;
    }

    // Resolver squad row (game_squads.id directo, ou pelo player_id legacy)
    const squadQuery = supabase
      .from("game_squads")
      .select("id, player_id")
      .eq("game_id", gameId);
    const { data: squad, error: squadError } = squadId
      ? await squadQuery.eq("id", squadId).maybeSingle()
      : await squadQuery.eq("player_id", playerId!).maybeSingle();

    if (squadError) {
      return NextResponse.json(
        { error: "Erro ao validar squad." },
        { status: 500 },
      );
    }

    if (!squad) {
      return NextResponse.json(
        { error: "Jogador não está convocado neste jogo." },
        { status: 400 },
      );
    }

    const newLineupStatus =
      lineupStatusRaw === "on_field" ? "starter" : "substitute";

    const { error: updateError } = await supabase
      .from("game_squads")
      .update({ initial_lineup_status: newLineupStatus })
      .eq("id", squad.id);

    if (updateError) {
      console.error("[convocation/lineup] update game_squads falhou", updateError);
      return NextResponse.json(
        { error: "Erro ao guardar lineup." },
        { status: 500 },
      );
    }

    // Dual-write game_stats_live.status para internos (transição).
    // TODO: remove after game_stats_live.status drop.
    if (squad.player_id) {
      const dbStatus =
        lineupStatusRaw === "on_field" ? "starter" : "on_bench";
      const livePayload = {
        game_id: gameId,
        player_id: squad.player_id,
        status: dbStatus,
        start_minute: lineupStatusRaw === "on_field" ? 0 : null,
        end_minute: null,
      };

      const { data: existingLive } = await supabase
        .from("game_stats_live")
        .select("id")
        .eq("game_id", gameId)
        .eq("player_id", squad.player_id)
        .limit(1);

      if ((existingLive ?? []).length > 0) {
        await supabase
          .from("game_stats_live")
          .update({
            status: dbStatus,
            start_minute: lineupStatusRaw === "on_field" ? 0 : null,
            end_minute: null,
          })
          .eq("game_id", gameId)
          .eq("player_id", squad.player_id);
      } else {
        await supabase.from("game_stats_live").insert(livePayload);
      }
    }

    if (writeGuard.requiresAudit && writeGuard.correctionReason) {
      await insertConvocationAuditLog({
        actorId: user.id,
        gameId,
        action: "convocation_lineup_updated_after_completed",
        correctionReason: writeGuard.correctionReason,
        payload: {
          squadId: squad.id,
          playerId: squad.player_id,
          lineupStatus: lineupStatusRaw,
        },
      });
    }

    return NextResponse.json({
      success: true,
      squadId: squad.id,
      playerId: squad.player_id,
      lineupStatus: lineupStatusRaw,
    });
  } catch (error) {
    console.error("Erro ao guardar lineup:", error);
    return respondInternalError("api.games.id.convocation.lineup.post", error);
  }
}
