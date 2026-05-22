import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { fetchGameAccessContext } from "@/lib/games/access";

type RouteContext = {
  params: Promise<{ id: string; obsId: string }>;
};

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { id: gameId, obsId } = await params;

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

    const { error } = await supabase
      .from("game_opponent_observations")
      .delete()
      .eq("id", obsId)
      .eq("game_id", gameId);

    if (error) {
      return NextResponse.json(
        { error: "Erro ao apagar observação." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.games.id.observations.id.delete", error);
  }
}
