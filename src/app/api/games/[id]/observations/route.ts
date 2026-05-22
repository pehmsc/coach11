import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { fetchGameAccessContext } from "@/lib/games/access";
import { observationCreateSchema } from "@/lib/schemas/observations";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    let access = null;
    try {
      access = await fetchGameAccessContext(supabase, gameId);
    } catch {
      return NextResponse.json({ error: "Erro ao validar jogo." }, { status: 500 });
    }

    if (!access?.exists || !access.canAccess) {
      return NextResponse.json({ error: "Sem permissões." }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("game_opponent_observations")
      .select("*")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "Erro ao carregar observações." },
        { status: 500 },
      );
    }

    return NextResponse.json({ observations: data ?? [] });
  } catch (error) {
    return respondInternalError("api.games.id.observations.get", error);
  }
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
    const parsed = observationCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "validation", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    let access = null;
    try {
      access = await fetchGameAccessContext(supabase, gameId);
    } catch {
      return NextResponse.json({ error: "Erro ao validar jogo." }, { status: 500 });
    }

    if (!access?.exists || !access.canAccess) {
      return NextResponse.json({ error: "Sem permissões." }, { status: 403 });
    }

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("opponent_id")
      .eq("id", gameId)
      .maybeSingle();

    if (gameError) {
      return NextResponse.json(
        { error: "Erro ao carregar jogo." },
        { status: 500 },
      );
    }

    if (!game?.opponent_id) {
      return NextResponse.json(
        {
          error:
            "Jogo sem adversário associado — não é possível capturar observações.",
        },
        { status: 400 },
      );
    }

    const { data: opponent, error: opponentError } = await supabase
      .from("opponents")
      .select("club_id")
      .eq("id", game.opponent_id)
      .maybeSingle();

    if (opponentError) {
      return NextResponse.json(
        { error: "Erro ao carregar adversário." },
        { status: 500 },
      );
    }

    if (!opponent?.club_id) {
      return NextResponse.json(
        { error: "Adversário sem clube associado." },
        { status: 400 },
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from("game_opponent_observations")
      .insert({
        game_id: gameId,
        opponent_id: game.opponent_id,
        club_id: opponent.club_id,
        observation: parsed.data.observation,
        minute: parsed.data.minute ?? null,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: "Erro ao guardar observação." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, observation: inserted });
  } catch (error) {
    return respondInternalError("api.games.id.observations.post", error);
  }
}
