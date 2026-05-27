import { createAdminClient } from "@/lib/supabase/admin";
import { createNotificationForTeamOnce } from "@/lib/notifications/service";
import { parseGameDateTime, toPortugalDateKey, toPortugalWallClock } from "@/lib/events/time";
import { portugalDateTimeToUtc } from "@/lib/events/presence-window";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Cron: notificações proactivas de jogos.
 * Corre de 15 em 15 minutos via Vercel Cron.
 *
 * J1: convocation_reminder — 48h antes do jogo (se convocatória não criada)
 * J2: game_concentration — na hora de concentração
 * J3: game_starting_soon — 10 min antes do início real (game_datetime + 50min)
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
  let j1Count = 0;
  let j2Count = 0;
  let j3Count = 0;

  // Buscar jogos nos próximos 48h + jogos de hoje. game_datetime e timestamp
  // WITHOUT time zone (hora local PT) — filtrar com wall-clock PT.
  const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000 + 10 * 60 * 1000);
  const { data: upcomingGames } = await admin
    .from("games")
    .select("id, team_id, age_group_id, game_datetime, concentration_time, title, opponent_name, location, status")
    .in("status", ["scheduled", "live"])
    .gte("game_datetime", toPortugalWallClock(windowStart))
    .lte("game_datetime", toPortugalWallClock(twoDaysFromNow));

  if (!upcomingGames) {
    return NextResponse.json({ ok: true, j1: 0, j2: 0, j3: 0, timestamp: now.toISOString() });
  }

  for (const game of upcomingGames) {
    if (!game.team_id) continue;
    // Wall-clock PT -> instante UTC correcto.
    const gameDateTime = parseGameDateTime(game.game_datetime);
    if (!gameDateTime) continue;

    const { data: coordinator } = await admin
      .from("age_groups")
      .select("coordinator_id")
      .eq("id", game.age_group_id)
      .maybeSingle();

    const actorId = coordinator?.coordinator_id ?? "system";
    const gameLabel = game.title || (game.opponent_name ? `vs ${game.opponent_name}` : "Jogo");

    // J1: 48h antes — convocatória não criada
    const fortyEightHoursBefore = new Date(gameDateTime.getTime() - 48 * 60 * 60 * 1000);
    if (fortyEightHoursBefore >= windowStart && fortyEightHoursBefore <= now) {
      // Verificar se convocatória já existe
      const { count: convCount } = await admin
        .from("convocations")
        .select("id", { count: "exact", head: true })
        .eq("game_id", game.id);

      if (!convCount || convCount === 0) {
        const gameDate = new Intl.DateTimeFormat("pt-PT", {
          timeZone: "Europe/Lisbon",
          day: "numeric",
          month: "short",
        }).format(gameDateTime);
        const gameTime = new Intl.DateTimeFormat("pt-PT", {
          timeZone: "Europe/Lisbon",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(gameDateTime);

        await createNotificationForTeamOnce(admin, {
          teamId: game.team_id,
          actorId,
          type: "convocation_reminder",
          entityId: game.id,
          title: `Convocatória por definir — ${gameLabel}`,
          body: `${gameDate} às ${gameTime}`,
          linkPath: `/games/${game.id}`,
          ageGroupId: game.age_group_id,
        });
        j1Count++;
      }
    }

    // J2: Hora de concentração. concentration_time e HH:MM (text na DB);
    // combinar com a data calendario (PT) do jogo e converter para UTC.
    const gameDateKey = toPortugalDateKey(gameDateTime);
    const concentrationTime =
      game.concentration_time
        ? portugalDateTimeToUtc(gameDateKey, game.concentration_time)
        : new Date(gameDateTime.getTime() - 30 * 60 * 1000);

    if (concentrationTime && concentrationTime >= windowStart && concentrationTime <= now) {
      await createNotificationForTeamOnce(admin, {
        teamId: game.team_id,
        actorId,
        type: "game_concentration",
        entityId: game.id,
        title: `Hora de concentração — ${gameLabel}`,
        body: game.location || undefined,
        linkPath: `/games/${game.id}`,
        ageGroupId: game.age_group_id,
      });
      j2Count++;
    }

    // J3: 10 min antes do início real (game_datetime + 50min)
    // Início real = game_datetime + 1h → alerta = game_datetime + 50min
    const alertTime = new Date(gameDateTime.getTime() + 50 * 60 * 1000);
    if (alertTime >= windowStart && alertTime <= now && game.status === "scheduled") {
      await createNotificationForTeamOnce(admin, {
        teamId: game.team_id,
        actorId,
        type: "game_starting_soon",
        entityId: game.id,
        title: `Jogo começa em 10 minutos — ${gameLabel}`,
        body: game.opponent_name ? `vs ${game.opponent_name}` : undefined,
        linkPath: `/games/${game.id}`,
        ageGroupId: game.age_group_id,
      });
      j3Count++;
    }
  }

  return NextResponse.json({
    ok: true,
    j1: j1Count,
    j2: j2Count,
    j3: j3Count,
    timestamp: now.toISOString(),
  });
}
