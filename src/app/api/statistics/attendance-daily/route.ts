import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { PRIVATE_SWR_CACHE_CONTROL } from "@/lib/http/cache";
import { NextResponse } from "next/server";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * GET /api/statistics/attendance-daily?ageGroupId=<uuid>
 *
 * Returns daily attendance aggregates for the heatmap.
 * Each row: { date, present, late, absent, injured, total }
 */
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

    if (!ageGroupId || !isUuid(ageGroupId)) {
      return NextResponse.json(
        { error: "ageGroupId obrigatório" },
        { status: 400 },
      );
    }

    // Get completed training sessions for this age group
    const { data: sessions, error: sessionsError } = await supabase
      .from("training_sessions")
      .select("id, session_date")
      .eq("age_group_id", ageGroupId)
      .eq("status", "completed");

    if (sessionsError) {
      return NextResponse.json(
        { error: "Erro ao carregar treinos" },
        { status: 500 },
      );
    }

    if (!sessions || sessions.length === 0) {
      return NextResponse.json(
        { success: true, daily: [] },
        { headers: { "Cache-Control": PRIVATE_SWR_CACHE_CONTROL } },
      );
    }

    const sessionIds = sessions.map((s) => s.id);
    const sessionDateMap = new Map(sessions.map((s) => [s.id, s.session_date]));

    // Get attendance for all completed sessions
    const { data: attendance, error: attError } = await supabase
      .from("training_attendance")
      .select("training_session_id, status")
      .in("training_session_id", sessionIds);

    if (attError) {
      return NextResponse.json(
        { error: "Erro ao carregar presenças" },
        { status: 500 },
      );
    }

    // Aggregate by date
    const dailyMap = new Map<
      string,
      { present: number; late: number; absent: number; injured: number; total: number }
    >();

    (attendance ?? []).forEach((row) => {
      const date = sessionDateMap.get(row.training_session_id);
      if (!date) return;

      if (!dailyMap.has(date)) {
        dailyMap.set(date, { present: 0, late: 0, absent: 0, injured: 0, total: 0 });
      }
      const day = dailyMap.get(date)!;
      day.total += 1;
      if (row.status === "present") day.present += 1;
      else if (row.status === "late") day.late += 1;
      else if (row.status === "absent") day.absent += 1;
      else if (row.status === "injured") day.injured += 1;
    });

    const daily = Array.from(dailyMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json(
      { success: true, daily },
      { headers: { "Cache-Control": PRIVATE_SWR_CACHE_CONTROL } },
    );
  } catch (error) {
    return respondInternalError("api.statistics.attendance-daily.get", error);
  }
}
