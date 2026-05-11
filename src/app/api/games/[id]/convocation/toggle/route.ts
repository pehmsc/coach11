import { createClient } from "@/lib/supabase/server";
import {
  assertConvocationWriteAllowed,
  insertConvocationAuditLog,
} from "@/lib/games/convocation-guard";
import { shouldCleanupGameStatsLive } from "@/lib/games/lineup-ghost-filter";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Toggle de jogador interno na convocatória.
// Modelo unificado: game_squads é fonte de verdade. INSERT default
// initial_lineup_status='substitute'; UPDATE de lineup acontece via
// endpoint /convocation/lineup. Idempotência via UNIQUE (game_id, player_id).
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
    const playerId = body?.playerId;
    const correctionReason =
      typeof body?.correctionReason === "string" ? body.correctionReason : null;

    if (!playerId || typeof playerId !== "string") {
      return NextResponse.json(
        { error: "playerId em falta no pedido." },
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

    if (writeGuard.access.ageGroupId) {
      const { data: player } = await supabase
        .from("players")
        .select("id")
        .eq("id", playerId)
        .eq("age_group_id", writeGuard.access.ageGroupId)
        .maybeSingle();

      if (!player) {
        return NextResponse.json(
          { error: "Jogador inválido para este jogo." },
          { status: 400 },
        );
      }
    }

    // Verificar se já existe linha em game_squads para este (game_id, player_id)
    const { data: existing, error: existingError } = await supabase
      .from("game_squads")
      .select("id")
      .eq("game_id", gameId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: "Erro ao verificar convocatória." },
        { status: 500 },
      );
    }

    if (existing?.id) {
      // Remover do squad
      const { error: deleteError } = await supabase
        .from("game_squads")
        .delete()
        .eq("id", existing.id);

      if (deleteError) {
        return NextResponse.json(
          { error: "Erro ao remover jogador da convocatória." },
          { status: 500 },
        );
      }

      // Higiene: remover row de game_stats_live só pré-jogo.
      // TODO: remove after game_stats_live.status drop
      if (shouldCleanupGameStatsLive(writeGuard.access.status)) {
        const { error: liveDeleteError } = await supabase
          .from("game_stats_live")
          .delete()
          .eq("game_id", gameId)
          .eq("player_id", playerId);

        if (liveDeleteError) {
          console.error(
            "[convocation/toggle] cleanup de game_stats_live falhou",
            { gameId, playerId, error: liveDeleteError.message },
          );
        }
      }

      // Convocatória volta a 'draft' (re-publicar precisa de nova confirmação)
      await supabase
        .from("games")
        .update({ convocation_status: "draft" })
        .eq("id", gameId);

      if (writeGuard.requiresAudit && writeGuard.correctionReason) {
        await insertConvocationAuditLog({
          actorId: user.id,
          gameId,
          action: "convocation_player_removed_after_completed",
          correctionReason: writeGuard.correctionReason,
          payload: { playerId },
        });
      }

      return NextResponse.json({ success: true, isConvocated: false });
    }

    // Adicionar ao squad como suplente por default
    const { error: insertError } = await supabase
      .from("game_squads")
      .insert({
        game_id: gameId,
        player_id: playerId,
        initial_lineup_status: "substitute",
        data_quality: "authoritative",
      });

    if (insertError) {
      // Race condition: outro request já inseriu — devolver sucesso.
      if (insertError.code === "23505") {
        return NextResponse.json({ success: true, isConvocated: true });
      }

      return NextResponse.json(
        { error: "Erro ao adicionar jogador à convocatória." },
        { status: 500 },
      );
    }

    await supabase
      .from("games")
      .update({ convocation_status: "draft" })
      .eq("id", gameId);

    if (writeGuard.requiresAudit && writeGuard.correctionReason) {
      await insertConvocationAuditLog({
        actorId: user.id,
        gameId,
        action: "convocation_player_added_after_completed",
        correctionReason: writeGuard.correctionReason,
        payload: { playerId },
      });
    }

    return NextResponse.json({ success: true, isConvocated: true });
  } catch (error) {
    console.error("Erro no toggle da convocatória:", error);
    return respondInternalError("api.games.id.convocation.toggle.post", error);
  }
}
