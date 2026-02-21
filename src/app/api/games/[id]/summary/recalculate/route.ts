import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type RecalculatePayload = {
  finalMinute?: number;
  ratings?: Record<string, number | null>;
  notes?: Record<string, string | null>;
  mvpPlayerId?: string | null;
  starterIds?: string[];
};

type GameEventRow = {
  id: string;
  event_type: string;
  player_id: string | null;
  related_player_id: string | null;
  minute: number;
  is_opponent_event: boolean;
  created_at: string | null;
};

function isGoalEventType(eventType: string | null | undefined) {
  return eventType === "goal" || eventType === "penalty_goal";
}

function computeScoreFromEvents(events: GameEventRow[]) {
  let home = 0;
  let away = 0;
  events.forEach((event) => {
    if (event.event_type === "own_goal") {
      if (event.is_opponent_event) home += 1;
      else away += 1;
      return;
    }
    if (isGoalEventType(event.event_type)) {
      if (event.is_opponent_event) away += 1;
      else home += 1;
    }
  });
  return { home, away };
}

function computeMinutesPlayed(
  playerIds: string[],
  events: GameEventRow[],
  starterIds: Set<string>,
  finalMinute: number,
): Map<string, number> {
  type SubTransition = {
    minute: number;
    outPlayerId: string;
    inPlayerId: string | null;
    createdAt: string;
    order: number;
  };

  const rawTransitions: SubTransition[] = [];

  events.forEach((event, index) => {
    if (event.is_opponent_event) return;
    if (event.event_type === "substitution_out" && typeof event.player_id === "string") {
      rawTransitions.push({
        minute: Math.max(0, Math.floor(event.minute || 0)),
        outPlayerId: event.player_id,
        inPlayerId:
          typeof event.related_player_id === "string" ? event.related_player_id : null,
        createdAt: event.created_at || "",
        order: index,
      });
      return;
    }
    if (
      event.event_type === "substitution" &&
      typeof event.player_id === "string" &&
      typeof event.related_player_id === "string"
    ) {
      rawTransitions.push({
        minute: Math.max(0, Math.floor(event.minute || 0)),
        outPlayerId: event.related_player_id,
        inPlayerId: event.player_id,
        createdAt: event.created_at || "",
        order: index,
      });
      return;
    }
    if (
      event.event_type === "substitution_in" &&
      typeof event.player_id === "string" &&
      typeof event.related_player_id === "string"
    ) {
      const minute = Math.max(0, Math.floor(event.minute || 0));
      const outPlayerId = event.related_player_id;
      const inPlayerId = event.player_id;
      const hasMatchingOut = rawTransitions.some(
        (item) =>
          item.minute === minute &&
          item.outPlayerId === outPlayerId &&
          item.inPlayerId === inPlayerId,
      );
      if (!hasMatchingOut) {
        rawTransitions.push({
          minute,
          outPlayerId,
          inPlayerId,
          createdAt: event.created_at || "",
          order: index,
        });
      }
    }
  });

  const substitutions = rawTransitions.sort((a, b) => {
    if (a.minute !== b.minute) return a.minute - b.minute;
    const createdCmp = (a.createdAt || "").localeCompare(b.createdAt || "");
    if (createdCmp !== 0) return createdCmp;
    return a.order - b.order;
  });

  const normalizedFinalMinute = Math.max(0, Math.floor(finalMinute));
  const result = new Map<string, number>();

  for (const playerId of playerIds) {
    let currentStart: number | null = starterIds.has(playerId) ? 0 : null;
    let total = 0;

    for (const ev of substitutions) {
      const minute = Math.max(0, Math.min(normalizedFinalMinute, ev.minute));
      if (ev.inPlayerId === playerId) {
        if (currentStart !== null) {
          total += Math.max(0, minute - currentStart);
        }
        currentStart = minute;
      }
      if (ev.outPlayerId === playerId) {
        if (currentStart === null) continue;
        total += Math.max(0, minute - currentStart);
        currentStart = null;
      }
    }

    if (currentStart !== null) {
      total += Math.max(0, normalizedFinalMinute - currentStart);
    }

    result.set(playerId, Math.max(0, Math.min(total, normalizedFinalMinute)));
  }

  return result;
}

async function assertCoordinatorAccess(
  admin: ReturnType<typeof createAdminClient>,
  gameId: string,
  userId: string,
) {
  const { data: game, error: gameError } = await admin
    .from("games")
    .select("id, status, team_id, age_group_id")
    .eq("id", gameId)
    .maybeSingle();

  if (gameError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Erro ao validar jogo." }, { status: 500 }),
    };
  }
  if (!game) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 }),
    };
  }

  let teamId: string | null = game.team_id ?? null;
  const ageGroupId = game.age_group_id ?? null;

  if (!ageGroupId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Jogo sem escalão associado." }, { status: 400 }),
    };
  }

  const { data: coordinatorAgeGroup } = await admin
    .from("age_groups")
    .select("id")
    .eq("id", ageGroupId)
    .eq("coordinator_id", userId)
    .maybeSingle();
  const isCoordinator = !!coordinatorAgeGroup;

  if (!teamId) {
    const { data: fallbackTeam } = await admin
      .from("teams")
      .select("id")
      .eq("age_group_id", ageGroupId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    teamId = fallbackTeam?.id ?? null;
  }

  if (!isCoordinator) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Só o coordenador pode refazer estatísticas em jogos terminados." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    game: {
      id: game.id,
      status: game.status ?? null,
      teamId,
      ageGroupId,
    },
  };
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as RecalculatePayload | null;
    const admin = createAdminClient();
    const access = await assertCoordinatorAccess(admin, gameId, user.id);
    if (!access.ok) return access.response;

    if (access.game.status !== "completed") {
      return NextResponse.json(
        { error: "Esta ação só está disponível para jogos terminados." },
        { status: 400 },
      );
    }

    const { data: convocationRows } = await admin
      .from("convocations")
      .select("id, created_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    const latestConvocationId = convocationRows?.[0]?.id ?? null;

    let playerIds: string[] = [];
    if (latestConvocationId) {
      const { data: convocationPlayers } = await admin
        .from("convocation_players")
        .select("player_id")
        .eq("convocation_id", latestConvocationId);
      playerIds = Array.from(
        new Set(
          (convocationPlayers || [])
            .map((row) => row.player_id)
            .filter((value): value is string => typeof value === "string"),
        ),
      );
    }

    if (playerIds.length === 0) {
      const { data: liveRows } = await admin
        .from("game_stats_live")
        .select("player_id")
        .eq("game_id", gameId);
      playerIds = Array.from(
        new Set(
          (liveRows || [])
            .map((row) => row.player_id)
            .filter((value): value is string => typeof value === "string"),
        ),
      );
    }

    if (playerIds.length === 0) {
      return NextResponse.json(
        { error: "Não há jogadores associados a este jogo para recalcular." },
        { status: 400 },
      );
    }

    const [eventsRes, liveStatsRes, finalStatsRes, checkpointRes] = await Promise.all([
      admin
        .from("game_events")
        .select("id, event_type, player_id, related_player_id, minute, is_opponent_event, created_at")
        .eq("game_id", gameId)
        .order("minute", { ascending: true })
        .order("created_at", { ascending: true }),
      admin
        .from("game_stats_live")
        .select("player_id, status, start_minute")
        .eq("game_id", gameId)
        .in("player_id", playerIds),
      admin
        .from("game_final_stats")
        .select(
          "player_id, lineup_type, coach_rating, is_mvp, minutes_played, goals, own_goals, assists, yellow_cards, red_cards, notes, is_finalized, finalized_at",
        )
        .eq("game_id", gameId),
      admin
        .from("game_live_checkpoints")
        .select("base_seconds")
        .eq("game_id", gameId)
        .maybeSingle(),
    ]);

    if (eventsRes.error) {
      return NextResponse.json({ error: "Erro ao carregar eventos do jogo." }, { status: 500 });
    }
    if (liveStatsRes.error) {
      return NextResponse.json({ error: "Erro ao carregar estado live do jogo." }, { status: 500 });
    }
    if (finalStatsRes.error) {
      return NextResponse.json({ error: "Erro ao carregar estatísticas atuais." }, { status: 500 });
    }

    const events = (eventsRes.data || []) as GameEventRow[];
    const liveRows = liveStatsRes.data || [];
    const currentFinalStats = finalStatsRes.data || [];

    const ratingsOverridesRaw =
      body && body.ratings && typeof body.ratings === "object" ? body.ratings : {};
    const ratingsByPlayer = new Map<string, number | null>();
    currentFinalStats.forEach((row) => {
      ratingsByPlayer.set(
        row.player_id,
        typeof row.coach_rating === "number" ? row.coach_rating : null,
      );
    });
    Object.entries(ratingsOverridesRaw).forEach(([playerId, value]) => {
      if (!playerIds.includes(playerId)) return;
      if (value === null) {
        ratingsByPlayer.set(playerId, null);
        return;
      }
      if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 10) {
        ratingsByPlayer.set(playerId, value);
      }
    });

    const notesOverridesRaw = body && body.notes && typeof body.notes === "object" ? body.notes : {};
    const notesByPlayer = new Map<string, string | null>();
    currentFinalStats.forEach((row) => {
      notesByPlayer.set(row.player_id, typeof row.notes === "string" ? row.notes : null);
    });
    Object.entries(notesOverridesRaw).forEach(([playerId, value]) => {
      if (!playerIds.includes(playerId)) return;
      if (value === null) {
        notesByPlayer.set(playerId, null);
        return;
      }
      if (typeof value === "string") {
        const normalized = value.trim();
        notesByPlayer.set(playerId, normalized.length > 0 ? normalized : null);
      }
    });

    const payloadStarterIds = Array.isArray(body?.starterIds)
      ? body?.starterIds.filter((value): value is string => typeof value === "string")
      : [];
    const starterIds = new Set<string>(
      payloadStarterIds.filter((playerId) => playerIds.includes(playerId)),
    );

    if (starterIds.size === 0) {
      liveRows.forEach((row) => {
        if (row.start_minute === 0 || row.status === "starter") {
          starterIds.add(row.player_id);
        }
      });
    }

    if (starterIds.size === 0) {
      currentFinalStats.forEach((row) => {
        if (row.lineup_type === "starter") starterIds.add(row.player_id);
      });
    }

    if (starterIds.size === 0) {
      liveRows.forEach((row) => {
        if (row.status === "starter" || row.status === "playing") {
          starterIds.add(row.player_id);
        }
      });
    }

    const payloadFinalMinute =
      typeof body?.finalMinute === "number" && Number.isFinite(body.finalMinute)
        ? Math.max(1, Math.floor(body.finalMinute))
        : null;
    const checkpointMinute =
      typeof checkpointRes.data?.base_seconds === "number"
        ? Math.floor(Math.max(0, checkpointRes.data.base_seconds) / 60) + 1
        : 0;
    const maxEventMinute = events.reduce((max, row) => Math.max(max, row.minute || 0), 0);
    const maxCurrentMinute = currentFinalStats.reduce(
      (max, row) => Math.max(max, row.minutes_played || 0),
      0,
    );
    const finalMinute = payloadFinalMinute ?? Math.max(1, checkpointMinute, maxEventMinute, maxCurrentMinute);

    const mvpPlayerId =
      typeof body?.mvpPlayerId === "string" && playerIds.includes(body.mvpPlayerId)
        ? body.mvpPlayerId
        : currentFinalStats.find((row) => row.is_mvp)?.player_id ?? null;

    const minutesMap = computeMinutesPlayed(playerIds, events, starterIds, finalMinute);

    const rowsToInsert = playerIds.map((playerId) => {
      const goals = events.filter(
        (event) =>
          event.player_id === playerId &&
          !event.is_opponent_event &&
          isGoalEventType(event.event_type),
      ).length;
      const ownGoals = events.filter(
        (event) =>
          event.player_id === playerId &&
          !event.is_opponent_event &&
          event.event_type === "own_goal",
      ).length;
      const assists = events.filter(
        (event) =>
          event.related_player_id === playerId &&
          !event.is_opponent_event &&
          isGoalEventType(event.event_type),
      ).length;
      const yellowCards = events.filter(
        (event) =>
          event.player_id === playerId &&
          !event.is_opponent_event &&
          event.event_type === "yellow_card",
      ).length;
      const redCards = events.filter(
        (event) =>
          event.player_id === playerId &&
          !event.is_opponent_event &&
          event.event_type === "red_card",
      ).length;

      return {
        game_id: gameId,
        player_id: playerId,
        lineup_type: starterIds.has(playerId) ? "starter" : "substitute",
        minutes_played: Math.max(0, Math.min(finalMinute, minutesMap.get(playerId) ?? 0)),
        goals,
        own_goals: ownGoals,
        assists,
        yellow_cards: yellowCards,
        red_cards: redCards,
        coach_rating: ratingsByPlayer.get(playerId) ?? null,
        notes: notesByPlayer.get(playerId) ?? null,
        is_mvp: mvpPlayerId === playerId,
        is_finalized: true,
        finalized_at: new Date().toISOString(),
      };
    });

    const deleteResult = await admin.from("game_final_stats").delete().eq("game_id", gameId);
    if (deleteResult.error) {
      return NextResponse.json(
        { error: `Erro ao limpar estatísticas antigas: ${deleteResult.error.message}` },
        { status: 500 },
      );
    }

    const insertResult = await admin.from("game_final_stats").insert(rowsToInsert).select("id");
    if (insertResult.error) {
      const rollbackRows = currentFinalStats
        .filter(
          (row): row is {
            player_id: string;
            lineup_type: "starter" | "substitute";
            minutes_played: number | null;
            goals: number | null;
            own_goals: number | null;
            assists: number | null;
            yellow_cards: number | null;
            red_cards: number | null;
            coach_rating: number | null;
            notes: string | null;
            is_mvp: boolean;
            is_finalized: boolean | null;
            finalized_at: string | null;
          } =>
            typeof row.player_id === "string" &&
            (row.lineup_type === "starter" || row.lineup_type === "substitute"),
        )
        .map((row) => ({
          game_id: gameId,
          player_id: row.player_id,
          lineup_type: row.lineup_type,
          minutes_played: Math.max(0, Math.floor(row.minutes_played ?? 0)),
          goals: Math.max(0, Math.floor(row.goals ?? 0)),
          own_goals: Math.max(0, Math.floor(row.own_goals ?? 0)),
          assists: Math.max(0, Math.floor(row.assists ?? 0)),
          yellow_cards: Math.max(0, Math.floor(row.yellow_cards ?? 0)),
          red_cards: Math.max(0, Math.floor(row.red_cards ?? 0)),
          coach_rating: typeof row.coach_rating === "number" ? row.coach_rating : null,
          notes: typeof row.notes === "string" ? row.notes : null,
          is_mvp: row.is_mvp === true,
          is_finalized: row.is_finalized ?? true,
          finalized_at: row.finalized_at ?? null,
        }));

      if (rollbackRows.length > 0) {
        const rollbackResult = await admin.from("game_final_stats").insert(rollbackRows);
        if (rollbackResult.error) {
          console.error("Summary recalculate rollback failed:", rollbackResult.error);
        }
      }

      return NextResponse.json(
        { error: `Erro ao gravar estatísticas recalculadas: ${insertResult.error.message}` },
        { status: 500 },
      );
    }

    const score = computeScoreFromEvents(events);
    await admin
      .from("games")
      .update({
        status: "completed",
        score_home: score.home,
        score_away: score.away,
      })
      .eq("id", gameId);

    await admin
      .from("game_live_checkpoints")
      .upsert(
        {
          game_id: gameId,
          phase: "completed",
          base_seconds: Math.max(0, (finalMinute - 1) * 60),
          running_since_ms: null,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: "game_id" },
      );

    return NextResponse.json({
      success: true,
      insertedRows: insertResult.data?.length ?? 0,
      finalMinute,
      score,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    console.error("Summary recalculate error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
