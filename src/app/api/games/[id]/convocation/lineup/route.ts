import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
    const playerId =
      typeof body?.playerId === "string" ? body.playerId : null;
    const lineupStatus =
      body?.lineupStatus === "on_field" || body?.lineupStatus === "substitute"
        ? (body.lineupStatus as "on_field" | "substitute")
        : null;

    if (!playerId || !lineupStatus) {
      return NextResponse.json(
        { error: "Dados inválidos: playerId e lineupStatus são obrigatórios." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: game } = await admin
      .from("games")
      .select("id, team_id, age_group_id")
      .eq("id", gameId)
      .maybeSingle();

    if (!game) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }

    let hasAccess = false;
    let teamId: string | null = (game as unknown as { team_id?: string }).team_id ?? null;
    const ageGroupId = (game as unknown as { age_group_id?: string }).age_group_id ?? null;

    if (ageGroupId) {
      const { data: ag } = await admin
        .from("age_groups")
        .select("id")
        .eq("id", ageGroupId)
        .eq("coordinator_id", user.id)
        .maybeSingle();
      hasAccess = !!ag;
    }

    if (!teamId && ageGroupId) {
      const { data: ft } = await admin
        .from("teams")
        .select("id")
        .eq("age_group_id", ageGroupId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      teamId = (ft as unknown as { id?: string } | null)?.id ?? null;
    }

    if (!hasAccess && teamId) {
      const { data: sl } = await admin
        .from("team_staff")
        .select("id")
        .eq("team_id", teamId)
        .eq("profile_id", user.id)
        .maybeSingle();
      hasAccess = !!sl;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Sem permissões para editar o lineup deste jogo." },
        { status: 403 },
      );
    }

    const { error } = await admin
      .from("game_stats_live")
      .upsert(
        {
          game_id: gameId,
          player_id: playerId,
          status: lineupStatus,
          start_minute: lineupStatus === "on_field" ? 0 : null,
        },
        { onConflict: "game_id,player_id" },
      );

    if (error) {
      console.error("Erro ao guardar lineup:", error);
      return NextResponse.json(
        { error: "Erro ao guardar lineup." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, playerId, lineupStatus });
  } catch (error) {
    console.error("Erro ao guardar lineup:", error);
    const message =
      error instanceof Error ? error.message : "Erro interno ao guardar lineup.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
