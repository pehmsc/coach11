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

function normalizePlayerName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

function normalizePlayerPosition(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

function toJerseyNumber(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed)) return parsed;
  }
  return Number.NaN;
}

// Adiciona jogador "externo" à convocatória — modelo unificado em game_squads.
// Aceita 2 modos:
//   1. Free-text: { name, number, position } → external_name preenchido
//   2. Cross-age (PR 3): { player_id } de outro escalão → player_id preenchido
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

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id")
      .eq("id", gameId)
      .maybeSingle();

    if (gameError || !game?.id) {
      return NextResponse.json(
        { error: "Erro ao validar o jogo para jogador externo." },
        { status: 500 },
      );
    }

    // Modo cross-age (player_id de outro escalão)
    if (body?.player_id && typeof body.player_id === "string") {
      const playerId = body.player_id;

      const { data: player, error: playerErr } = await supabase
        .from("players")
        .select("id, first_name, last_name, jersey_number, preferred_position, age_group_id")
        .eq("id", playerId)
        .maybeSingle();

      if (playerErr || !player) {
        return NextResponse.json(
          { error: "Jogador não encontrado." },
          { status: 404 },
        );
      }

      const { error: insertError } = await supabase
        .from("game_squads")
        .insert({
          game_id: gameId,
          player_id: player.id,
          source_age_group_id: player.age_group_id,
          jersey_number: player.jersey_number ?? null,
          initial_lineup_status: "substitute",
          data_quality: "authoritative",
        });

      if (insertError) {
        if (insertError.code === "23505") {
          return NextResponse.json(
            { error: "Jogador já está convocado para este jogo." },
            { status: 400 },
          );
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
          action: "convocation_cross_age_player_added_after_completed",
          correctionReason: writeGuard.correctionReason,
          payload: { playerId },
        });
      }

      return NextResponse.json({
        success: true,
        player: {
          id: player.id,
          name: `${player.first_name} ${player.last_name}`.trim(),
          jersey_number: player.jersey_number,
          position: player.preferred_position,
          source_age_group_id: player.age_group_id,
        },
      });
    }

    // Modo free-text (external_name)
    const name = normalizePlayerName(body?.name);
    const position = normalizePlayerPosition(body?.position);
    const jerseyNumber = toJerseyNumber(body?.number);

    if (name.length < 2) {
      return NextResponse.json(
        { error: "Indica o nome do jogador (mínimo 2 caracteres)." },
        { status: 400 },
      );
    }

    if (!Number.isInteger(jerseyNumber) || jerseyNumber < 0 || jerseyNumber > 99) {
      return NextResponse.json(
        { error: "O número do jogador deve ser um inteiro entre 0 e 99." },
        { status: 400 },
      );
    }

    if (position.length < 1) {
      return NextResponse.json(
        { error: "Indica a posição do jogador." },
        { status: 400 },
      );
    }

    const { data: insertedRow, error: insertError } = await supabase
      .from("game_squads")
      .insert({
        game_id: gameId,
        external_name: name,
        external_jersey_number: jerseyNumber,
        external_position: position,
        jersey_number: jerseyNumber,
        initial_lineup_status: "substitute",
        data_quality: "authoritative",
      })
      .select(
        "id, game_id, external_name, external_jersey_number, external_position, jersey_number, created_at",
      )
      .single();

    if (insertError || !insertedRow) {
      return NextResponse.json(
        { error: "Erro ao adicionar jogador externo à convocatória." },
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
        action: "convocation_external_player_added_after_completed",
        correctionReason: writeGuard.correctionReason,
        payload: {
          externalPlayerId: insertedRow.id,
          name: insertedRow.external_name,
          jerseyNumber: insertedRow.external_jersey_number,
          position: insertedRow.external_position,
        },
      });
    }

    return NextResponse.json({
      success: true,
      player: {
        id: insertedRow.id,
        name: insertedRow.external_name,
        jersey_number: insertedRow.external_jersey_number,
        position: insertedRow.external_position,
        lineup_status: "substitute",
        created_at: insertedRow.created_at,
      },
    });
  } catch (error) {
    return respondInternalError("api.games.id.convocation.external.post", error);
  }
}
