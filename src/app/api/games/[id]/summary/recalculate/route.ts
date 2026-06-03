import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import {
  GAME_EVENT_SELECT_COLUMNS,
  normalizeStoredGameEventRowsForClient,
} from "@/lib/games/live-event-participants";
import {
  isManualOverride,
  recalculateRequestSchema,
  type PlayerOverride,
} from "@/lib/schemas/game-recalculate";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
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

function computeScoreFromEvents(events: GameEventRow[], ourTeamIsHome: boolean) {
  let home = 0;
  let away = 0;

  const incrementScore = (isOurTeamGoal: boolean) => {
    if (ourTeamIsHome) {
      if (isOurTeamGoal) home += 1;
      else away += 1;
    } else {
      if (isOurTeamGoal) away += 1;
      else home += 1;
    }
  };

  events.forEach((event) => {
    if (event.event_type === "own_goal") {
      incrementScore(event.is_opponent_event);
      return;
    }
    if (isGoalEventType(event.event_type)) {
      incrementScore(!event.is_opponent_event);
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

type GameAccessContext = {
  exists: boolean;
  canWrite: boolean;
  isCoordinator: boolean;
  status: string | null;
  teamId: string | null;
  ageGroupId: string | null;
};

function parseGameAccessContext(value: unknown): GameAccessContext | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    exists: row.exists === true,
    canWrite: row.canWrite === true,
    isCoordinator: row.isCoordinator === true,
    status: typeof row.status === "string" ? row.status : null,
    teamId: typeof row.teamId === "string" ? row.teamId : null,
    ageGroupId: typeof row.ageGroupId === "string" ? row.ageGroupId : null,
  };
}

async function assertWriteAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  gameId: string,
) {
  const { data: accessData, error: accessError } = await supabase.rpc(
    "rpc_game_access_context",
    {
      p_game_id: gameId,
    },
  );

  if (accessError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Erro ao validar jogo." }, { status: 500 }),
    };
  }

  const access = parseGameAccessContext(accessData);
  if (!access?.exists) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 }),
    };
  }

  if (!access.ageGroupId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Jogo sem escalão associado." }, { status: 400 }),
    };
  }

  if (!access.canWrite) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Sem permissões para editar estatísticas deste jogo." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    game: {
      id: gameId,
      status: access.status,
      teamId: access.teamId,
      ageGroupId: access.ageGroupId,
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

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Corpo do pedido inválido (JSON esperado)." },
        { status: 400 },
      );
    }

    const parsed = recalculateRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Payload inválido.",
          fieldErrors: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }
    const body = parsed.data;

    const access = await assertWriteAccess(supabase, gameId);
    if (!access.ok) return access.response;

    // Bloqueio explícito de status não-editáveis. A RPC re-valida, mas
    // devolvemos 409 com mensagem específica antes de chamar.
    if (access.game.status === "live") {
      return NextResponse.json(
        {
          error:
            "Não é possível editar stats de um jogo em curso. Termina o jogo primeiro.",
        },
        { status: 409 },
      );
    }
    if (access.game.status === "scheduled") {
      return NextResponse.json(
        {
          error:
            "O jogo ainda não foi marcado como terminado. Os stats finais só podem ser editados após o jogo terminar.",
        },
        { status: 409 },
      );
    }

    // Modelo unificado: os jogadores convocados vivem em game_squads (keyed por
    // game_id). Substitui o lookup legacy convocations + convocation_players.
    const { data: squadRows } = await supabase
      .from("game_squads")
      .select("player_id")
      .eq("game_id", gameId)
      .not("player_id", "is", null);

    let playerIds: string[] = Array.from(
      new Set(
        (squadRows || [])
          .map((row) => row.player_id)
          .filter((value): value is string => typeof value === "string"),
      ),
    );

    if (playerIds.length === 0) {
      const { data: liveRows } = await supabase
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
      supabase
        .from("game_events")
        .select(GAME_EVENT_SELECT_COLUMNS)
        .eq("game_id", gameId)
        .order("minute", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("game_stats_live")
        .select("player_id, status, start_minute")
        .eq("game_id", gameId)
        .in("player_id", playerIds),
      supabase
        .from("game_final_stats")
        .select(
          "player_id, lineup_type, coach_rating, is_mvp, minutes_played, goals, own_goals, assists, yellow_cards, red_cards, notes, is_finalized, finalized_at, edited_manually",
        )
        .eq("game_id", gameId),
      supabase
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

    const events = normalizeStoredGameEventRowsForClient(
      (eventsRes.data || []) as Array<{
        id?: string;
        player_id?: string | null;
        related_player_id?: string | null;
        external_player_convocation_id?: string | null;
        external_related_player_convocation_id?: string | null;
        minute?: number | null;
        is_opponent_event?: boolean | null;
        created_at?: string | null;
      }>,
    ) as GameEventRow[];
    const liveRows = liveStatsRes.data || [];
    const currentFinalStats = finalStatsRes.data || [];

    const ratingsOverridesRaw = body.ratings ?? {};
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

    const notesOverridesRaw = body.notes ?? {};
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

    const payloadStarterIds = body.starterIds.filter((playerId) =>
      playerIds.includes(playerId),
    );
    const starterIds = new Set<string>(payloadStarterIds);

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

    const payloadFinalMinute = Math.max(1, Math.floor(body.finalMinute));
    const checkpointMinute =
      typeof checkpointRes.data?.base_seconds === "number"
        ? Math.floor(Math.max(0, checkpointRes.data.base_seconds) / 60) + 1
        : 0;
    const maxEventMinute = events.reduce((max, row) => Math.max(max, row.minute || 0), 0);
    const maxCurrentMinute = currentFinalStats.reduce(
      (max, row) => Math.max(max, row.minutes_played || 0),
      0,
    );
    const finalMinute = Math.max(payloadFinalMinute, 1, checkpointMinute, maxEventMinute, maxCurrentMinute);

    const mvpPlayerId =
      typeof body.mvpPlayerId === "string" && playerIds.includes(body.mvpPlayerId)
        ? body.mvpPlayerId
        : currentFinalStats.find((row) => row.is_mvp)?.player_id ?? null;

    const minutesMap = computeMinutesPlayed(playerIds, events, starterIds, finalMinute);

    const existingEditedManually = new Map<string, boolean>();
    currentFinalStats.forEach((row) => {
      existingEditedManually.set(row.player_id, row.edited_manually === true);
    });

    const overridesByPlayer = body.overrides ?? {};
    const forceAuto = body.force_auto === true;

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

      const baseRow = {
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

      // force_auto: ignora overrides, todas as rows passam a edited_manually=false
      if (forceAuto) {
        return { ...baseRow, edited_manually: false };
      }

      const override: PlayerOverride | undefined = overridesByPlayer[playerId];
      const wasManual = existingEditedManually.get(playerId) ?? false;

      if (!override) {
        // Sem override neste pedido: preservar manualidade anterior.
        return { ...baseRow, edited_manually: wasManual };
      }

      const merged = {
        ...baseRow,
        ...(override.lineup_type !== undefined && { lineup_type: override.lineup_type }),
        ...(override.minutes_played !== undefined && { minutes_played: override.minutes_played }),
        ...(override.goals !== undefined && { goals: override.goals }),
        ...(override.own_goals !== undefined && { own_goals: override.own_goals }),
        ...(override.assists !== undefined && { assists: override.assists }),
        ...(override.yellow_cards !== undefined && { yellow_cards: override.yellow_cards }),
        ...(override.red_cards !== undefined && { red_cards: override.red_cards }),
        ...(override.coach_rating !== undefined && { coach_rating: override.coach_rating }),
        ...(override.notes !== undefined && { notes: override.notes }),
        ...(override.is_mvp !== undefined && { is_mvp: override.is_mvp }),
      };

      // edited_manually é "sticky" (uma vez true, fica true até force_auto).
      // Apenas overrides em campos NUMÉRICOS contam como manualidade.
      return { ...merged, edited_manually: wasManual || isManualOverride(override) };
    });

    const { data: gameMeta, error: gameMetaError } = await supabase
      .from("games")
      .select("is_home")
      .eq("id", gameId)
      .maybeSingle();

    if (gameMetaError || !gameMeta) {
      return NextResponse.json({ error: "Erro ao validar jogo." }, { status: 500 });
    }

    const score = computeScoreFromEvents(events, gameMeta.is_home !== false);
    const rpcResult = await supabase.rpc("rpc_recalculate_game_summary_auth", {
      p_game_id: gameId,
      p_rows: rowsToInsert,
      p_score_home: score.home,
      p_score_away: score.away,
      p_final_minute: finalMinute,
      p_updated_by: user.id,
    });

    if (rpcResult.error) {
      const msg = rpcResult.error.message || "";
      if (msg.includes("game_in_progress")) {
        return NextResponse.json(
          {
            error:
              "Não é possível editar stats de um jogo em curso. Termina o jogo primeiro.",
          },
          { status: 409 },
        );
      }
      if (msg.includes("game_not_started")) {
        return NextResponse.json(
          {
            error:
              "O jogo ainda não foi marcado como terminado. Os stats finais só podem ser editados após o jogo terminar.",
          },
          { status: 409 },
        );
      }
      if (msg.includes("forbidden")) {
        return NextResponse.json(
          { error: "Sem permissões para editar estatísticas deste jogo." },
          { status: 403 },
        );
      }
      return respondInternalError(
        "api.games.id.summary.recalculate.post.rpc-recalculate-auth",
        rpcResult.error,
      );
    }

    const insertedRowsFromRpc =
      rpcResult.data &&
      typeof rpcResult.data === "object" &&
      "insertedRows" in rpcResult.data &&
      typeof (rpcResult.data as { insertedRows?: unknown }).insertedRows === "number"
        ? (rpcResult.data as { insertedRows: number }).insertedRows
        : null;

    return NextResponse.json({
      success: true,
      insertedRows: insertedRowsFromRpc ?? rowsToInsert.length,
      finalMinute,
      score,
    });
  } catch (error) {
    console.error("Summary recalculate error:", error);
    return respondInternalError("api.games.id.summary.recalculate.post", error);
  }
}
