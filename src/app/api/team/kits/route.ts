import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type PlayerType = "field" | "goalkeeper";
type PieceType = "shirt" | "shorts" | "socks";

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

function isPlayerType(value: unknown): value is PlayerType {
  return value === "field" || value === "goalkeeper";
}

function isPieceType(value: unknown): value is PieceType {
  return value === "shirt" || value === "shorts" || value === "socks";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Payload | null;
    const teamId = typeof body?.teamId === "string" ? body.teamId : null;
    const kitNumber =
      typeof body?.kitNumber === "number" && [1, 2, 3].includes(body.kitNumber)
        ? body.kitNumber
        : null;
    const playerType = isPlayerType(body?.playerType) ? body.playerType : null;
    const pieceType = isPieceType(body?.pieceType) ? body.pieceType : null;
    const colorHex = normalizeColorHex(body?.colorHex);

    if (!teamId || !kitNumber || !playerType || !pieceType || !colorHex) {
      return NextResponse.json(
        { error: "Dados inválidos para guardar cor do kit." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: team, error: teamError } = await admin
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

    let hasAccess = false;

    if (team.age_group_id) {
      const { data: ageGroup } = await admin
        .from("age_groups")
        .select("id")
        .eq("id", team.age_group_id)
        .eq("coordinator_id", user.id)
        .maybeSingle();
      hasAccess = !!ageGroup;
    }

    if (!hasAccess) {
      const { data: staffLink } = await admin
        .from("team_staff")
        .select("id")
        .eq("team_id", team.id)
        .eq("profile_id", user.id)
        .maybeSingle();
      hasAccess = !!staffLink;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Sem permissões para editar os kits desta equipa." },
        { status: 403 },
      );
    }

    const { data: existingPieces } = await admin
      .from("kit_pieces")
      .select("*")
      .eq("team_id", team.id)
      .eq("kit_number", kitNumber)
      .eq("player_type", playerType)
      .eq("piece_type", pieceType)
      .order("created_at", { ascending: true });

    if ((existingPieces || []).length > 0) {
      const { data: updatedPieces, error: updateError } = await admin
        .from("kit_pieces")
        .update({ color_hex: colorHex })
        .eq("team_id", team.id)
        .eq("kit_number", kitNumber)
        .eq("player_type", playerType)
        .eq("piece_type", pieceType)
        .select("*");

      if (updateError || !updatedPieces || updatedPieces.length === 0) {
        return NextResponse.json(
          { error: "Erro ao guardar a cor do kit." },
          { status: 500 },
        );
      }

      return NextResponse.json({ success: true, piece: updatedPieces[0] });
    }

    const { data: insertedPiece, error: insertError } = await admin
      .from("kit_pieces")
      .insert({
        team_id: team.id,
        kit_number: kitNumber,
        player_type: playerType,
        piece_type: pieceType,
        color_hex: colorHex,
      })
      .select("*")
      .single();

    if (insertError || !insertedPiece) {
      return NextResponse.json(
        { error: "Erro ao guardar a cor do kit." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, piece: insertedPiece });
  } catch (error) {
    console.error("Erro ao guardar cor de kit:", error);
    const message =
      error instanceof Error ? error.message : "Erro interno ao guardar cor de kit.";

    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        {
          error:
            "Configuração do servidor incompleta: falta SUPABASE_SERVICE_ROLE_KEY no ambiente de produção.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: message || "Erro interno ao guardar cor de kit." },
      { status: 500 },
    );
  }
}
