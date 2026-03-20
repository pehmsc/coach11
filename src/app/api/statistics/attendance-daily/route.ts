import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";
import { PRIVATE_SWR_CACHE_CONTROL } from "@/lib/http/cache";
import { resolveUserTeamContext } from "@/lib/auth/team-context";

export const runtime = "nodejs";

/**
 * GET /api/statistics/attendance-daily?ageGroupId=XXX&month=2026-03
 * Retorna presenças por dia para o mapa de presenças mensal.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const ageGroupId = request.nextUrl.searchParams.get("ageGroupId");
  const month = request.nextUrl.searchParams.get("month"); // "2026-03"

  if (!ageGroupId) {
    return NextResponse.json({ error: "ageGroupId obrigatório" }, { status: 400 });
  }

  const context = await resolveUserTeamContext(supabase, user.id);
  if (!context.accessibleAgeGroupIds.includes(ageGroupId)) {
    return NextResponse.json({ error: "Sem acesso a este escalão" }, { status: 403 });
  }

  // Determinar intervalo do mês
  const now = new Date();
  const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [year, mon] = targetMonth.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const endDate = `${year}-${String(mon + 1 > 12 ? 1 : mon + 1).padStart(2, "0")}-01`;

  // Buscar treinos do mês
  const { data: sessions } = await supabase
    .from("training_sessions")
    .select("id, session_date, start_time")
    .eq("age_group_id", ageGroupId)
    .gte("session_date", startDate)
    .lt("session_date", endDate)
    .order("session_date");

  if (!sessions || sessions.length === 0) {
    return NextResponse.json(
      { success: true, month: targetMonth, sessions: [], attendance: [], players: [] },
      { headers: { "Cache-Control": PRIVATE_SWR_CACHE_CONTROL } },
    );
  }

  const sessionIds = sessions.map((s) => s.id);

  // Buscar presenças e jogadores em paralelo
  const [{ data: attendance }, { data: players }] = await Promise.all([
    supabase
      .from("training_attendance")
      .select("training_session_id, player_id, status")
      .in("training_session_id", sessionIds),
    supabase
      .from("players")
      .select("id, first_name, last_name, jersey_number")
      .eq("age_group_id", ageGroupId)
      .eq("status", "active")
      .order("first_name"),
  ]);

  return NextResponse.json(
    {
      success: true,
      month: targetMonth,
      sessions: sessions.map((s) => ({
        id: s.id,
        date: s.session_date,
        time: s.start_time,
      })),
      attendance: (attendance || []).map((a) => ({
        sessionId: a.training_session_id,
        playerId: a.player_id,
        status: a.status,
      })),
      players: (players || []).map((p) => ({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`.trim(),
        number: p.jersey_number,
      })),
    },
    { headers: { "Cache-Control": PRIVATE_SWR_CACHE_CONTROL } },
  );
}
