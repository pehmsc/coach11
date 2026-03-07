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

function isMissingExternalTableError(message: string | null | undefined) {
  if (!message) return false;
  return (
    message.includes("external_player_convocations") &&
    (message.includes("does not exist") || message.includes("relation"))
  );
}

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
        { error: "A convocatória está fechada e não pode ser editada." },
        { status: 400 },
      );
    }

    const { data: insertedRow, error: insertError } = await supabase
      .from("external_player_convocations")
      .insert({
        game_id: gameId,
        name,
        jersey_number: jerseyNumber,
        position,
        lineup_status: "substitute",
        created_by: user.id,
      })
      .select("id, name, jersey_number, position, lineup_status, created_at")
      .single();

    if (insertError || !insertedRow) {
      if (isMissingExternalTableError(insertError?.message)) {
        return NextResponse.json(
          {
            error:
              "A funcionalidade de jogador externo ainda não está ativa na base de dados. Aplica as migrations pendentes.",
          },
          { status: 500 },
        );
      }

      return NextResponse.json(
        { error: "Erro ao adicionar jogador externo à convocatória." },
        { status: 500 },
      );
    }

    await supabase
      .from("convocations")
      .update({ status: "draft" })
      .eq("id", convocation.id)
      .neq("status", "closed");

    if (writeGuard.requiresAudit && writeGuard.correctionReason) {
      await insertConvocationAuditLog({
        actorId: user.id,
        gameId,
        action: "convocation_external_player_added_after_completed",
        correctionReason: writeGuard.correctionReason,
        payload: {
          externalPlayerId: insertedRow.id,
          name: insertedRow.name,
          jerseyNumber: insertedRow.jersey_number,
          position: insertedRow.position,
        },
      });
    }

    return NextResponse.json({
      success: true,
      player: insertedRow,
    });
  } catch (error) {
    return respondInternalError("api.games.id.convocation.external.post", error);
  }
}
