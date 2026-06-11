import { createAdminClient } from "@/lib/supabase/admin";
import { createNotificationForTeamOnce } from "@/lib/notifications/service";
import { portugalDateTimeToUtc } from "@/lib/events/presence-window";
import { toPortugalDateKey } from "@/lib/events/time";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Cron: notificações proactivas de treinos.
 * Corre de 15 em 15 minutos via Vercel Cron.
 *
 * T1: attendance_pending — na hora de início do treino
 * T2: attendance_reminder — 10 min após o fim (se presenças não marcadas)
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const cronWindowMs = 15 * 60 * 1000;
  const windowStart = new Date(now.getTime() - cronWindowMs);
  let t1Count = 0;
  let t2Count = 0;

  // T1: Treinos que começaram nos últimos 15 minutos. session_date e date
  // (sem fuso); usar a data calendario PT em vez de UTC para nao saltar dias
  // perto da meia-noite.
  const { data: startingSessions } = await admin
    .from("training_sessions")
    .select("id, team_id, age_group_id, session_date, start_time, title")
    .eq("status", "scheduled")
    .gte("session_date", toPortugalDateKey(windowStart))
    .lte("session_date", toPortugalDateKey(now));

  if (startingSessions) {
    for (const session of startingSessions) {
      if (!session.team_id || !session.start_time) continue;

      // Verificar se a hora de início (PT) está na janela [now-15min, now].
      const startDateTime = portugalDateTimeToUtc(
        session.session_date,
        session.start_time,
      );
      if (!startDateTime || startDateTime < windowStart || startDateTime > now)
        continue;

      const { data: coordinator } = await admin
        .from("age_groups")
        .select("coordinator_id")
        .eq("id", session.age_group_id)
        .maybeSingle();

      if (!coordinator?.coordinator_id) continue;

      const title = session.title || "Treino";
      const time = session.start_time.slice(0, 5);

      await createNotificationForTeamOnce(admin, {
        teamId: session.team_id,
        actorId: coordinator.coordinator_id,
        type: "attendance_pending",
        entityId: session.id,
        title: `Presenças por marcar — ${title} às ${time}`,
        linkPath: `/attendance?date=${session.session_date}`,
        ageGroupId: session.age_group_id,
      });
      t1Count++;
    }
  }

  // T2: Treinos que terminaram há ~10 minutos sem presenças marcadas
  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const t2WindowEnd = new Date(now.getTime() - (10 + 15) * 60 * 1000);

  const { data: endedSessions } = await admin
    .from("training_sessions")
    .select("id, team_id, age_group_id, session_date, start_time, title")
    .eq("status", "scheduled")
    .eq("session_date", toPortugalDateKey(now));

  if (endedSessions) {
    for (const session of endedSessions) {
      if (!session.team_id || !session.start_time) continue;
      // training_sessions nao tem duration_minutes — o select antigo com essa
      // coluna fazia a query inteira falhar (42703) e o T2 nunca corria.
      // Duracao assumida de 90 min; a janela de envio ja tolera +/-15 min.
      const duration = 90;
      const startInstant = portugalDateTimeToUtc(
        session.session_date,
        session.start_time,
      );
      if (!startInstant) continue;
      const endDateTime = new Date(startInstant.getTime() + duration * 60 * 1000);

      // Janela: terminou entre 10-25 min atrás (alargada para cron de 15 min)
      if (endDateTime < t2WindowEnd || endDateTime > tenMinAgo) continue;

      // Verificar se presenças já foram marcadas
      const { count } = await admin
        .from("training_attendance")
        .select("id", { count: "exact", head: true })
        .eq("training_session_id", session.id);

      if (count && count > 0) continue;

      const { data: coordinator } = await admin
        .from("age_groups")
        .select("coordinator_id")
        .eq("id", session.age_group_id)
        .maybeSingle();

      if (!coordinator?.coordinator_id) continue;

      await createNotificationForTeamOnce(admin, {
        teamId: session.team_id,
        actorId: coordinator.coordinator_id,
        type: "attendance_reminder",
        entityId: session.id,
        title: "Ainda não marcaste as presenças do treino de hoje",
        body: `${session.title || "Treino"} — marca as presenças agora`,
        linkPath: `/attendance?date=${session.session_date}`,
        ageGroupId: session.age_group_id,
      });
      t2Count++;
    }
  }

  return NextResponse.json({
    ok: true,
    t1: t1Count,
    t2: t2Count,
    timestamp: now.toISOString(),
  });
}
