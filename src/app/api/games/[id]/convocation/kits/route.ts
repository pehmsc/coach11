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

type KitSelectionPayload = {
  fp_jersey_kit_id: string | null;
  fp_shorts_kit_id: string | null;
  fp_socks_kit_id: string | null;
  gk_jersey_kit_id: string | null;
  gk_shorts_kit_id: string | null;
  gk_socks_kit_id: string | null;
};

const KIT_FIELD_RULES: Record<
  keyof KitSelectionPayload,
  {
    playerType: "field" | "field_player" | "goalkeeper";
    pieceType: "shirt" | "shorts" | "socks";
  }
> = {
  fp_jersey_kit_id: { playerType: "field", pieceType: "shirt" },
  fp_shorts_kit_id: { playerType: "field", pieceType: "shorts" },
  fp_socks_kit_id: { playerType: "field", pieceType: "socks" },
  gk_jersey_kit_id: { playerType: "goalkeeper", pieceType: "shirt" },
  gk_shorts_kit_id: { playerType: "goalkeeper", pieceType: "shorts" },
  gk_socks_kit_id: { playerType: "goalkeeper", pieceType: "socks" },
};

function pieceTypeMatches(
  actual: string | null | undefined,
  expected: "shirt" | "shorts" | "socks",
) {
  if (!actual) return false;
  if (expected === "shirt") {
    return actual === "shirt" || actual === "jersey";
  }
  return actual === expected;
}

function playerTypeMatches(
  actual: string | null | undefined,
  expected: "field" | "field_player" | "goalkeeper",
) {
  if (!actual) return false;
  if (expected === "field") {
    return actual === "field" || actual === "field_player";
  }
  return actual === expected;
}

function normalizeKitSelection(body: unknown): KitSelectionPayload {
  const getValue = (key: keyof KitSelectionPayload) => {
    const value =
      typeof body === "object" && body !== null && key in body
        ? (body as Record<string, unknown>)[key]
        : null;

    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  return {
    fp_jersey_kit_id: getValue("fp_jersey_kit_id"),
    fp_shorts_kit_id: getValue("fp_shorts_kit_id"),
    fp_socks_kit_id: getValue("fp_socks_kit_id"),
    gk_jersey_kit_id: getValue("gk_jersey_kit_id"),
    gk_shorts_kit_id: getValue("gk_shorts_kit_id"),
    gk_socks_kit_id: getValue("gk_socks_kit_id"),
  };
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
    const selection = normalizeKitSelection(body);
    const correctionReason =
      typeof body === "object" &&
      body !== null &&
      typeof (body as Record<string, unknown>).correctionReason === "string"
        ? String((body as Record<string, unknown>).correctionReason)
        : null;

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
      .select("id, team_id, age_group_id")
      .eq("id", gameId)
      .maybeSingle();

    if (gameError) {
      return NextResponse.json({ error: "Erro ao validar o jogo." }, { status: 500 });
    }

    if (!game) {
      return NextResponse.json(
        { error: "Sem permissões para editar os equipamentos deste jogo." },
        { status: 403 },
      );
    }

    let teamId: string | null = writeGuard.access.teamId ?? game.team_id;

    if (!teamId && game.age_group_id) {
      const { data: fallbackTeam } = await supabase
        .from("teams")
        .select("id")
        .eq("age_group_id", game.age_group_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      teamId = fallbackTeam?.id ?? null;
    }

    if (!teamId) {
      return NextResponse.json(
        { error: "Jogo sem equipa associada para selecionar equipamento." },
        { status: 422 },
      );
    }

    const selectedIds = Array.from(
      new Set(Object.values(selection).filter((value): value is string => !!value)),
    );

    if (selectedIds.length > 0) {
      const { data: selectedPieces, error: selectedPiecesError } = await supabase
        .from("kit_pieces")
        .select("id, team_id, player_type, piece_type")
        .in("id", selectedIds);

      if (selectedPiecesError) {
        return NextResponse.json(
          { error: "Erro ao validar equipamentos selecionados." },
          { status: 500 },
        );
      }

      const byId = new Map((selectedPieces || []).map((row) => [row.id, row]));

      for (const fieldName of Object.keys(KIT_FIELD_RULES) as Array<
        keyof KitSelectionPayload
      >) {
        const selectedId = selection[fieldName];
        if (!selectedId) continue;

        const piece = byId.get(selectedId);
        if (!piece || piece.team_id !== teamId) {
          return NextResponse.json(
            { error: "Equipamento inválido para esta equipa." },
            { status: 400 },
          );
        }

        const expected = KIT_FIELD_RULES[fieldName];
        if (
          !playerTypeMatches(piece.player_type, expected.playerType) ||
          !pieceTypeMatches(piece.piece_type, expected.pieceType)
        ) {
          return NextResponse.json(
            { error: "Combinação de equipamento inválida para a peça selecionada." },
            { status: 400 },
          );
        }
      }
    }

    // PR #156a: kits guardados directamente em games (era em convocations,
    // que ficou read-only desde 11 Mai). Convocations só é lida agora para
    // detectar status "closed" (manter regra existente).
    const { data: latestConvocation, error: convocationStatusError } = await supabase
      .from("convocations")
      .select("status")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (convocationStatusError) {
      return NextResponse.json(
        { error: "Erro ao carregar a convocatória." },
        { status: 500 },
      );
    }

    if (latestConvocation?.status === "closed") {
      return NextResponse.json(
        { error: "A convocatória está fechada e não pode ser alterada." },
        { status: 400 },
      );
    }

    const { error: updateError } = await supabase
      .from("games")
      .update({
        kit_fp_jersey_id: selection.fp_jersey_kit_id,
        kit_fp_shorts_id: selection.fp_shorts_kit_id,
        kit_fp_socks_id: selection.fp_socks_kit_id,
        kit_gk_jersey_id: selection.gk_jersey_kit_id,
        kit_gk_shorts_id: selection.gk_shorts_kit_id,
        kit_gk_socks_id: selection.gk_socks_kit_id,
      })
      .eq("id", gameId);

    if (updateError) {
      console.error("[PR #156a] Failed to update game kits:", {
        gameId,
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
      });
      return NextResponse.json(
        { error: "Não foi possível guardar o equipamento.", details: updateError.message },
        { status: 500 },
      );
    }

    if (writeGuard.requiresAudit && writeGuard.correctionReason) {
      await insertConvocationAuditLog({
        actorId: user.id,
        gameId,
        action: "convocation_kits_updated_after_completed",
        correctionReason: writeGuard.correctionReason,
        payload: selection,
      });
    }

    return NextResponse.json({ success: true, kitSelection: selection });
  } catch (error) {
    console.error("Erro ao guardar equipamentos da convocatória:", error);
    return respondInternalError("api.games.id.convocation.kits.post", error);
  }
}
