import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserTeamContext } from "@/lib/auth/team-context";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";

type PlayerTypeInput = "field" | "field_player" | "goalkeeper";
type DbPlayerType = "field_player" | "goalkeeper";
type PieceTypeInput = "shirt" | "jersey" | "shorts" | "socks";
type DbPieceType = "jersey" | "shorts" | "socks";

type Payload = {
  teamId?: unknown;
  kitNumber?: unknown;
  playerType?: unknown;
  pieceType?: unknown;
  colorHex?: unknown;
};

function normalizeColorHex(raw: unknown) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) return null;
  return value.toLowerCase();
}

function isPlayerType(value: unknown): value is PlayerTypeInput {
  return value === "field" || value === "field_player" || value === "goalkeeper";
}

function normalizePlayerType(value: PlayerTypeInput): DbPlayerType {
  if (value === "goalkeeper") return "goalkeeper";
  return "field_player";
}

function playerTypeVariants(playerType: DbPlayerType) {
  if (playerType === "field_player") return ["field_player", "field"];
  return ["goalkeeper"];
}

function isPieceType(value: unknown): value is PieceTypeInput {
  return value === "shirt" || value === "jersey" || value === "shorts" || value === "socks";
}

function normalizePieceType(value: PieceTypeInput): DbPieceType {
  if (value === "shirt" || value === "jersey") return "jersey";
  return value;
}

function pieceTypeVariants(pieceType: DbPieceType) {
  if (pieceType === "jersey") return ["jersey", "shirt"];
  return [pieceType];
}

function normalizePieceForUi(value: string | null | undefined) {
  if (!value) return value ?? null;
  return value === "jersey" ? "shirt" : value;
}

function normalizePlayerForUi(value: string | null | undefined) {
  if (!value) return value ?? null;
  return value === "field_player" ? "field" : value;
}

function toUiPiece<T extends Record<string, unknown>>(piece: T) {
  return {
    ...piece,
    player_type: normalizePlayerForUi(
      typeof piece.player_type === "string" ? piece.player_type : null,
    ),
    piece_type: normalizePieceForUi(
      typeof piece.piece_type === "string" ? piece.piece_type : null,
    ),
  };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    let db = supabase;
    try {
      db = createAdminClient();
    } catch {
      db = supabase;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Payload | null;
    const teamId = typeof body?.teamId === "string" ? body.teamId : null;
    const rawKitNumber =
      typeof body?.kitNumber === "number"
        ? body.kitNumber
        : typeof body?.kitNumber === "string"
          ? Number(body.kitNumber)
          : null;
    const kitNumber =
      typeof rawKitNumber === "number" && [1, 2].includes(rawKitNumber)
        ? rawKitNumber
        : null;
    const rawPlayerType = isPlayerType(body?.playerType) ? body.playerType : null;
    const rawPieceType = isPieceType(body?.pieceType) ? body.pieceType : null;
    const colorHex = normalizeColorHex(body?.colorHex);
    const playerType = rawPlayerType ? normalizePlayerType(rawPlayerType) : null;
    const pieceType = rawPieceType ? normalizePieceType(rawPieceType) : null;

    if (!teamId || !kitNumber || !playerType || !pieceType || !colorHex) {
      return NextResponse.json(
        { error: "Dados inválidos para guardar cor do kit." },
        { status: 400 },
      );
    }

    const context = await resolveUserTeamContext(db, user.id);

    const { data: team, error: teamError } = await db
      .from("teams")
      .select("id, age_group_id")
      .eq("id", teamId)
      .maybeSingle();

    if (teamError) {
      return NextResponse.json({ error: "Erro ao validar equipa." }, { status: 500 });
    }

    if (!team) {
      return NextResponse.json({ error: "Equipa não encontrada." }, { status: 404 });
    }

    if (!context.accessibleTeamIds.includes(team.id)) {
      return NextResponse.json(
        { error: "Sem permissões para editar os kits desta equipa." },
        { status: 403 },
      );
    }

    const colorName = colorHex.toUpperCase();
    const candidatePlayerTypes = playerTypeVariants(playerType);
    const candidatePieceTypes = pieceTypeVariants(pieceType);

    const { data: existingPieces } = await db
      .from("kit_pieces")
      .select("*")
      .eq("team_id", team.id)
      .eq("kit_number", kitNumber)
      .in("player_type", candidatePlayerTypes)
      .in("piece_type", candidatePieceTypes)
      .order("created_at", { ascending: true });

    if ((existingPieces || []).length > 0) {
      const pieceTypesInDb = Array.from(
        new Set((existingPieces || []).map((piece) => piece.piece_type)),
      );
      const playerTypesInDb = Array.from(
        new Set((existingPieces || []).map((piece) => piece.player_type)),
      );
      const { data: updatedPieces, error: updateError } = await db
        .from("kit_pieces")
        .update({ color_hex: colorHex, color_name: colorName })
        .eq("team_id", team.id)
        .eq("kit_number", kitNumber)
        .in("player_type", playerTypesInDb)
        .in("piece_type", pieceTypesInDb)
        .select("*");

      if (updateError || !updatedPieces || updatedPieces.length === 0) {
        return NextResponse.json(
          { error: "Erro ao guardar a cor do kit." },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        piece: toUiPiece(updatedPieces[0] as Record<string, unknown>),
      });
    }

    const insertPayload = {
      team_id: team.id,
      kit_number: kitNumber,
      player_type: playerType,
      piece_type: pieceType,
      color_name: colorName,
      color_hex: colorHex,
    };

    let insertedPiece: Record<string, unknown> | null = null;
    let insertError: { code?: string; message?: string } | null = null;

    const insertCandidates: Array<{ player_type: string; piece_type: string }> = [];
    for (const pt of candidatePlayerTypes) {
      for (const piece of candidatePieceTypes) {
        insertCandidates.push({ player_type: pt, piece_type: piece });
      }
    }

    for (const candidate of insertCandidates) {
      const insertResult = await db
        .from("kit_pieces")
        .insert({ ...insertPayload, ...candidate })
        .select("*")
        .single();

      insertedPiece = insertResult.data as Record<string, unknown> | null;
      insertError = insertResult.error;
      if (!insertError && insertedPiece) break;
    }

    if (insertError || !insertedPiece) {
      return NextResponse.json(
        { error: "Erro ao guardar a cor do kit." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, piece: toUiPiece(insertedPiece) });
  } catch (error) {
    console.error("Erro ao guardar cor de kit:", error);
    return respondInternalError("api.team.kits.post", error);
  }
}
