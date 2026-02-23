import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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

    const admin = createAdminClient();

    const { data: game, error: gameError } = await admin
      .from("games")
      .select("id, team_id, age_group_id")
      .eq("id", gameId)
      .maybeSingle();

    if (gameError) {
      return NextResponse.json({ error: "Erro ao validar o jogo." }, { status: 500 });
    }

    if (!game) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }

    let hasAccess = false;
    let teamId: string | null = game.team_id;

    if (game.age_group_id) {
      const { data: ageGroup } = await admin
        .from("age_groups")
        .select("id")
        .eq("id", game.age_group_id)
        .eq("coordinator_id", user.id)
        .maybeSingle();
      hasAccess = !!ageGroup;
    }

    if (!teamId && game.age_group_id) {
      const { data: fallbackTeam } = await admin
        .from("teams")
        .select("id")
        .eq("age_group_id", game.age_group_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      teamId = fallbackTeam?.id ?? null;
    }

    if (!hasAccess && teamId) {
      const { data: staffLink } = await admin
        .from("team_staff")
        .select("id")
        .eq("team_id", teamId)
        .eq("profile_id", user.id)
        .maybeSingle();
      hasAccess = !!staffLink;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Sem permissões para editar os equipamentos deste jogo." },
        { status: 403 },
      );
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
      const { data: selectedPieces, error: selectedPiecesError } = await admin
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

    const { data: convocationRows, error: convocationRowsError } = await admin
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

    let latestConvocation = convocationRows?.[0] ?? null;
    if (latestConvocation?.status === "closed") {
      return NextResponse.json(
        { error: "A convocatória está fechada e não pode ser alterada." },
        { status: 400 },
      );
    }

    const allConvocationIds = convocationRows?.map((row) => row.id) ?? [];

    if (!latestConvocation) {
      const { data: createdConvocation, error: createError } = await admin
        .from("convocations")
        .insert({
          game_id: gameId,
          status: "draft",
          ...selection,
        })
        .select("id")
        .single();

      if (createError || !createdConvocation) {
        return NextResponse.json(
          { error: "Não foi possível criar a convocatória." },
          { status: 500 },
        );
      }

      latestConvocation = { id: createdConvocation.id, status: "draft", created_at: null };
    } else {
      const updateIds = allConvocationIds.length > 0 ? allConvocationIds : [latestConvocation.id];
      const { error: updateError } = await admin
        .from("convocations")
        .update({
          ...selection,
          status: latestConvocation.status === "closed" ? "closed" : "draft",
        })
        .in("id", updateIds);

      if (updateError) {
        return NextResponse.json(
          { error: "Não foi possível guardar os equipamentos deste jogo." },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true, kitSelection: selection });
  } catch (error) {
    console.error("Erro ao guardar equipamentos da convocatória:", error);
    return respondInternalError("api.games.id.convocation.kits.post", error);
  }
}
