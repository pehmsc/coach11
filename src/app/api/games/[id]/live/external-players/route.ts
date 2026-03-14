import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type GameAccessContext = {
  exists: boolean;
  canWrite: boolean;
};

function parseGameAccessContext(value: unknown): GameAccessContext | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    exists: row.exists === true,
    canWrite: row.canWrite === true,
  };
}

async function assertGameAccess(db: SupabaseClient, gameId: string) {
  const { data: accessData, error: accessError } = await db.rpc(
    "rpc_game_access_context",
    { p_game_id: gameId },
  );

  if (accessError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Erro ao validar jogo." }, { status: 500 }),
    };
  }

  const access = parseGameAccessContext(accessData);
  if (!access?.exists) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 }),
    };
  }

  if (!access.canWrite) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Sem permissões." }, { status: 403 }),
    };
  }

  return { ok: true as const };
}

// PATCH: update lineup_status for an external player during a live game.
// Uses game access guard (canWrite) instead of convocation write guard,
// so it works even when the game is in "live" status.
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

    const body = await request.json().catch(() => null);
    const externalConvocationId =
      typeof body?.externalConvocationId === "string" ? body.externalConvocationId : null;
    const lineupStatus =
      body?.lineupStatus === "on_field" || body?.lineupStatus === "substitute"
        ? (body.lineupStatus as "on_field" | "substitute")
        : null;

    if (!externalConvocationId || !lineupStatus) {
      return NextResponse.json(
        { error: "Dados inválidos: externalConvocationId e lineupStatus são obrigatórios." },
        { status: 400 },
      );
    }

    const access = await assertGameAccess(supabase, gameId);
    if (!access.ok) return access.response;

    const { data: updatedRows, error: updateError } = await supabase
      .from("external_player_convocations")
      .update({ lineup_status: lineupStatus })
      .eq("id", externalConvocationId)
      .eq("game_id", gameId)
      .select("id")
      .limit(1);

    if (updateError) {
      return NextResponse.json(
        { error: "Erro ao guardar estado live do jogador externo." },
        { status: 500 },
      );
    }

    if (!updatedRows?.length) {
      return NextResponse.json(
        { error: "Jogador externo não encontrado nesta convocatória." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, externalConvocationId, lineupStatus });
  } catch (error) {
    return respondInternalError("api.games.id.live.external-players.post", error);
  }
}
