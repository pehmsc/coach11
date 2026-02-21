import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const ageGroupId = searchParams.get("ageGroupId");

    if (!ageGroupId) {
      return NextResponse.json({ error: "ageGroupId obrigatório" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Verify access: coordinator or team staff
    let hasAccess = false;

    const { data: ag } = await admin
      .from("age_groups")
      .select("id")
      .eq("id", ageGroupId)
      .eq("coordinator_id", user.id)
      .maybeSingle();

    if (ag) {
      hasAccess = true;
    } else {
      const { data: team } = await admin
        .from("teams")
        .select("id")
        .eq("age_group_id", ageGroupId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (team?.id) {
        const { data: staff } = await admin
          .from("team_staff")
          .select("id")
          .eq("team_id", team.id)
          .eq("profile_id", user.id)
          .maybeSingle();
        hasAccess = !!staff;
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: "Sem permissões" }, { status: 403 });
    }

    // ── Players ──
    const { data: players, error: playersError } = await admin
      .from("players")
      .select("*")
      .eq("age_group_id", ageGroupId)
      .eq("status", "active")
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true });

    if (playersError) {
      return NextResponse.json({ error: "Erro ao carregar jogadores" }, { status: 500 });
    }

    const playerIds = (players || []).map((p) => p.id);

    // ── Training sessions → attendance ──
    const { data: sessions } = await admin
      .from("training_sessions")
      .select("id")
      .eq("age_group_id", ageGroupId);

    const sessionIds = (sessions || []).map((s) => s.id);

    let attendanceRows: { player_id: string; status: string }[] = [];
    if (sessionIds.length > 0 && playerIds.length > 0) {
      const { data: attRows } = await admin
        .from("attendance_records")
        .select("player_id, status")
        .in("training_session_id", sessionIds)
        .in("player_id", playerIds);
      attendanceRows = (attRows || []) as { player_id: string; status: string }[];
    }

    // ── Game final stats ──
    let finalStats: Record<string, unknown>[] = [];
    if (playerIds.length > 0) {
      const { data: fs } = await admin
        .from("game_final_stats")
        .select(
          "player_id, goals, assists, minutes_played, lineup_type, yellow_cards, red_cards, coach_rating, is_mvp, is_finalized, game_id",
        )
        .in("player_id", playerIds)
        .eq("is_finalized", true);
      finalStats = (fs || []) as Record<string, unknown>[];
    }

    // ── Games for this age_group ──
    const { data: games } = await admin
      .from("games")
      .select("id")
      .eq("age_group_id", ageGroupId);

    const gameIds = (games || []).map((g) => g.id);

    // ── Convocations ──
    let convocations: { id: string; game_id: string }[] = [];
    if (gameIds.length > 0) {
      const { data: convRows } = await admin
        .from("convocations")
        .select("id, game_id")
        .in("game_id", gameIds);
      convocations = (convRows || []) as { id: string; game_id: string }[];
    }

    // ── Convocation players ──
    let convocationPlayers: { player_id: string; convocation_id: string }[] = [];
    const convocationIds = convocations.map((c) => c.id);
    if (convocationIds.length > 0 && playerIds.length > 0) {
      const { data: cpRows } = await admin
        .from("convocation_players")
        .select("player_id, convocation_id")
        .in("convocation_id", convocationIds)
        .in("player_id", playerIds);
      convocationPlayers = (cpRows || []) as { player_id: string; convocation_id: string }[];
    }

    return NextResponse.json({
      success: true,
      players: players || [],
      attendanceRows,
      finalStats,
      convocations,
      convocationPlayers,
      gameIds,
    });
  } catch (error) {
    console.error("Erro ao carregar estatísticas:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
