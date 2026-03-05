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

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await _request.json().catch(() => null);
    const correctionReason =
      typeof body?.correctionReason === "string" ? body.correctionReason : null;

    const writeGuard = await assertConvocationWriteAllowed(
      supabase,
      gameId,
      correctionReason,
    );
    if (!writeGuard.ok) {
      return writeGuard.response;
    }

    const { data: convocationRows, error: convocationRowsError } = await supabase
      .from("convocations")
      .select("id, status, created_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (convocationRowsError) {
      return NextResponse.json(
        { error: "Erro ao carregar a convocatória." },
        { status: 500 },
      );
    }

    let convocation = convocationRows?.[0] ?? null;

    if (!convocation) {
      const { data: createdConvocation, error: createError } = await supabase
        .from("convocations")
        .insert({ game_id: gameId, status: "draft" })
        .select("id, status, created_at")
        .single();

      if (createError || !createdConvocation) {
        return NextResponse.json(
          { error: "Não foi possível criar a convocatória." },
          { status: 500 },
        );
      }

      convocation = createdConvocation;
    }

    if (convocation.status === "closed") {
      return NextResponse.json(
        { error: "A convocatória está fechada e não pode ser alterada." },
        { status: 400 },
      );
    }

    const allConvocationIds = convocationRows?.length
      ? convocationRows.map((row) => row.id)
      : [convocation.id];

    const { data: selectedRows, error: selectedError } = await supabase
      .from("convocation_players")
      .select("player_id")
      .in("convocation_id", allConvocationIds);

    if (selectedError) {
      return NextResponse.json(
        { error: "Erro ao validar os jogadores convocados." },
        { status: 500 },
      );
    }

    const uniquePlayers = new Set((selectedRows || []).map((row) => row.player_id));

    const { count: externalPlayersCount, error: externalPlayersCountError } = await supabase
      .from("external_player_convocations")
      .select("id", { head: true, count: "exact" })
      .eq("game_id", gameId);

    if (
      externalPlayersCountError &&
      !(
        externalPlayersCountError.message?.includes("external_player_convocations") &&
        (externalPlayersCountError.message.includes("does not exist") ||
          externalPlayersCountError.message.includes("relation"))
      )
    ) {
      return NextResponse.json(
        { error: "Erro ao validar jogadores externos convocados." },
        { status: 500 },
      );
    }

    const playersCount = uniquePlayers.size + (externalPlayersCount ?? 0);

    if (!playersCount || playersCount <= 0) {
      return NextResponse.json(
        { error: "Seleciona pelo menos 1 jogador antes de guardar." },
        { status: 400 },
      );
    }

    // Guarantee game_stats_live has a row for each convocated player.
    // Missing rows are initialized as bench so live page always has full state.
    const { data: existingLiveRows, error: existingLiveRowsError } = await supabase
      .from("game_stats_live")
      .select("player_id")
      .eq("game_id", gameId);

    if (existingLiveRowsError) {
      return NextResponse.json(
        { error: "Erro ao preparar estados live dos convocados." },
        { status: 500 },
      );
    }

    const existingLiveIds = new Set((existingLiveRows || []).map((row) => row.player_id));
    const missingLiveRows = Array.from(uniquePlayers)
      .filter((playerId) => !existingLiveIds.has(playerId))
      .map((playerId) => ({
        game_id: gameId,
        player_id: playerId,
        status: "on_bench",
        start_minute: null,
        end_minute: null,
      }));

    if (missingLiveRows.length > 0) {
      const { error: insertLiveRowsError } = await supabase
        .from("game_stats_live")
        .insert(missingLiveRows);

      if (insertLiveRowsError) {
        return NextResponse.json(
          { error: "Erro ao guardar suplentes/titulares no live." },
          { status: 500 },
        );
      }
    }

    const { error: updateError } = await supabase
      .from("convocations")
      .update({ status: "confirmed" })
      .in("id", allConvocationIds);

    if (updateError) {
      return NextResponse.json(
        { error: "Erro ao guardar convocatória." },
        { status: 500 },
      );
    }

    if (writeGuard.requiresAudit && writeGuard.correctionReason) {
      await insertConvocationAuditLog({
        actorId: user.id,
        gameId,
        action: "convocation_confirmed_after_completed",
        correctionReason: writeGuard.correctionReason,
      });
    }

    return NextResponse.json({
      success: true,
      status: "confirmed",
      players: playersCount,
    });
  } catch (error) {
    console.error("Erro ao confirmar convocatória:", error);
    return respondInternalError("api.games.id.convocation.confirm.post", error);
  }
}
