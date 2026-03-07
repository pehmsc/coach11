import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { getPublicGameLiveSnapshot } from "@/lib/games/public-live";
import {
  resolvePublicAccessGate,
  resolvePublicGameId,
} from "@/lib/public-share";

type RouteContext = {
  params: Promise<{ identifier: string; gameRef: string }>;
};

function jsonNoStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Cache-Control": "private, no-store",
    },
  });
}

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { identifier, gameRef } = await params;
    const admin = createAdminClient();
    const gate = await resolvePublicAccessGate(
      admin,
      identifier,
      request.headers,
      { trackAccess: false },
    );

    if (gate.status === 404) {
      return jsonNoStore({ error: "Link público inválido." }, { status: 404 });
    }

    if (gate.status === 429) {
      return jsonNoStore({ error: "Demasiados pedidos." }, { status: 429 });
    }

    const { data: gameRows, error: gameRowsError } = await admin
      .from("games")
      .select("id")
      .eq("age_group_id", gate.access.ageGroupId)
      .limit(200);

    if (gameRowsError) {
      return jsonNoStore(
        { error: "Erro ao validar jogo público." },
        { status: 500 },
      );
    }

    const gameId = resolvePublicGameId(
      gate.access.identifier,
      gameRef,
      (gameRows || []).map((row) => row.id),
    );

    if (!gameId) {
      return jsonNoStore({ error: "Jogo não encontrado." }, { status: 404 });
    }

    const { data: game, error: gameError } = await admin
      .from("games")
      .select("id, is_home, status, score_home, score_away")
      .eq("id", gameId)
      .eq("age_group_id", gate.access.ageGroupId)
      .maybeSingle();

    if (gameError) {
      return jsonNoStore({ error: "Erro ao carregar jogo." }, { status: 500 });
    }

    if (!game) {
      return jsonNoStore({ error: "Jogo não encontrado." }, { status: 404 });
    }

    const snapshot = await getPublicGameLiveSnapshot(admin, {
      id: game.id,
      is_home: game.is_home ?? true,
      status: game.status ?? null,
      score_home: game.score_home ?? null,
      score_away: game.score_away ?? null,
    });

    return jsonNoStore({ success: true, snapshot });
  } catch (error) {
    return respondInternalError("api.public.games.identifier.gameRef.live.get", error);
  }
}
