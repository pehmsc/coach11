import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { resolveUserTeamContext } from "@/lib/auth/team-context";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const { id: opponentId } = await params;
    const url = new URL(request.url);
    const onlyUnpromoted = url.searchParams.get("promoted") === "false";

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: opponent, error: opponentError } = await supabase
      .from("opponents")
      .select("id, age_group_id")
      .eq("id", opponentId)
      .maybeSingle();

    if (opponentError) {
      return respondInternalError(
        "api.opponents.observations.get",
        opponentError,
        { request, userId: user.id },
      );
    }
    if (!opponent) {
      return NextResponse.json(
        { error: "Adversário não encontrado." },
        { status: 404 },
      );
    }

    const context = await resolveUserTeamContext(supabase, user.id);
    if (!context.accessibleAgeGroupIds.includes(opponent.age_group_id)) {
      return NextResponse.json({ error: "Sem permissões." }, { status: 403 });
    }

    let query = supabase
      .from("game_opponent_observations")
      .select("*")
      .eq("opponent_id", opponentId)
      .order("created_at", { ascending: false });

    if (onlyUnpromoted) {
      query = query.is("promoted_to_opponent_at", null);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { error: "Erro ao carregar observações." },
        { status: 500 },
      );
    }

    return NextResponse.json({ observations: data ?? [] });
  } catch (error) {
    return respondInternalError("api.opponents.observations.get", error, {
      request,
    });
  }
}
