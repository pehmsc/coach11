import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type EventInput = {
  event_type: string;
  player_id?: string | null;
  related_player_id?: string | null;
  minute: number;
  is_opponent_event: boolean;
};

const ALLOWED_EVENT_TYPES = new Set([
  "goal",
  "assist",
  "own_goal",
  "yellow_card",
  "red_card",
  "substitution_in",
  "substitution_out",
  "penalty_goal",
]);

async function assertGameAccess(
  admin: ReturnType<typeof createAdminClient>,
  gameId: string,
  userId: string,
) {
  const { data: game, error: gameError } = await admin
    .from("games")
    .select("id, team_id, age_group_id, status")
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

  let hasAccess = false;
  let isCoordinator = false;
  let teamId: string | null = (game as unknown as { team_id?: string }).team_id ?? null;
  const ageGroupId = (game as unknown as { age_group_id?: string }).age_group_id ?? null;
  const gameStatus = (game as unknown as { status?: string }).status ?? null;

  if (ageGroupId) {
    const { data: agOwner } = await admin
      .from("age_groups")
      .select("id")
      .eq("id", ageGroupId)
      .eq("coordinator_id", userId)
      .maybeSingle();
    hasAccess = !!agOwner;
    isCoordinator = !!agOwner;
  }

  if (!teamId && ageGroupId) {
    const { data: fallbackTeam } = await admin
      .from("teams")
      .select("id")
      .eq("age_group_id", ageGroupId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    teamId = (fallbackTeam as unknown as { id?: string } | null)?.id ?? null;
  }

  if (!hasAccess && teamId) {
    const { data: staffLink } = await admin
      .from("team_staff")
      .select("id")
      .eq("team_id", teamId)
      .eq("profile_id", userId)
      .maybeSingle();
    hasAccess = !!staffLink;
  }

  if (!hasAccess) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Sem permissões." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    isCoordinator,
    gameStatus,
  };
}

function isValidEventInput(value: unknown): value is EventInput {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<EventInput>;

  if (typeof row.event_type !== "string" || !ALLOWED_EVENT_TYPES.has(row.event_type)) {
    return false;
  }
  if (typeof row.minute !== "number" || !Number.isFinite(row.minute)) return false;
  if (Math.floor(row.minute) < 1) return false;
  if (typeof row.is_opponent_event !== "boolean") return false;
  if (row.player_id !== undefined && row.player_id !== null && typeof row.player_id !== "string") {
    return false;
  }
  if (
    row.related_player_id !== undefined &&
    row.related_player_id !== null &&
    typeof row.related_player_id !== "string"
  ) {
    return false;
  }
  return true;
}

function isDbOnFieldStatus(value: string | null | undefined) {
  if (!value) return false;
  return value === "starter" || value === "playing" || value === "on_field" || value === "titular";
}

function computeSentOffPlayers(events: Array<{
  event_type?: string | null;
  player_id?: string | null;
  is_opponent_event?: boolean | null;
}>) {
  const yellowByPlayer = new Map<string, number>();
  const sentOff = new Set<string>();

  events.forEach((event) => {
    const playerId = typeof event.player_id === "string" ? event.player_id : null;
    if (!playerId || event.is_opponent_event) return;

    if (event.event_type === "red_card") {
      sentOff.add(playerId);
      return;
    }
    if (event.event_type === "yellow_card") {
      const next = (yellowByPlayer.get(playerId) ?? 0) + 1;
      yellowByPlayer.set(playerId, next);
      if (next >= 2) sentOff.add(playerId);
    }
  });

  return { sentOff, yellowByPlayer };
}

export async function GET(_: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const admin = createAdminClient();
    const access = await assertGameAccess(admin, gameId, user.id);
    if (!access.ok) return access.response;

    const { data, error } = await admin
      .from("game_events")
      .select("*")
      .eq("game_id", gameId)
      .order("minute", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: "Erro ao carregar eventos live." }, { status: 500 });
    }

    return NextResponse.json({ events: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

    const body = await request.json().catch(() => null);
    const rowsRaw = Array.isArray(body?.events)
      ? body.events
      : body?.event
        ? [body.event]
        : [];

    if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) {
      return NextResponse.json({ error: "Sem eventos para guardar." }, { status: 400 });
    }

    if (!rowsRaw.every((row) => isValidEventInput(row))) {
      return NextResponse.json({ error: "Formato de evento inválido." }, { status: 400 });
    }

    const rows = rowsRaw as EventInput[];

    const admin = createAdminClient();
    const access = await assertGameAccess(admin, gameId, user.id);
    if (!access.ok) return access.response;
    if (access.gameStatus === "completed" && !access.isCoordinator) {
      return NextResponse.json(
        { error: "Só o coordenador pode editar jogos terminados." },
        { status: 403 },
      );
    }

    const [{ data: liveRows, error: liveRowsError }, { data: existingEvents, error: existingEventsError }] =
      await Promise.all([
        admin.from("game_stats_live").select("player_id, status").eq("game_id", gameId),
        admin
          .from("game_events")
          .select("event_type, player_id, is_opponent_event, minute, created_at")
          .eq("game_id", gameId)
          .order("minute", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);

    if (liveRowsError || existingEventsError) {
      return NextResponse.json(
        { error: "Erro ao validar disponibilidade dos jogadores." },
        { status: 500 },
      );
    }

    const onFieldPlayerIds = new Set<string>();
    (liveRows || []).forEach((row) => {
      const playerId = typeof row.player_id === "string" ? row.player_id : null;
      if (!playerId) return;
      if (isDbOnFieldStatus(typeof row.status === "string" ? row.status : null)) {
        onFieldPlayerIds.add(playerId);
      }
    });

    const { sentOff: sentOffPlayerIds, yellowByPlayer } = computeSentOffPlayers(
      (existingEvents || []) as Array<{
        event_type?: string | null;
        player_id?: string | null;
        is_opponent_event?: boolean | null;
      }>,
    );
    sentOffPlayerIds.forEach((playerId) => onFieldPlayerIds.delete(playerId));

    for (const row of rows) {
      const playerId = typeof row.player_id === "string" ? row.player_id : null;
      const relatedPlayerId =
        typeof row.related_player_id === "string" ? row.related_player_id : null;

      if (playerId && sentOffPlayerIds.has(playerId)) {
        return NextResponse.json(
          { error: "Jogador expulso não pode ser selecionado para eventos." },
          { status: 400 },
        );
      }
      if (relatedPlayerId && sentOffPlayerIds.has(relatedPlayerId)) {
        return NextResponse.json(
          { error: "Jogador expulso não pode ser selecionado para eventos." },
          { status: 400 },
        );
      }

      if (row.event_type === "substitution_out") {
        if (row.is_opponent_event) {
          return NextResponse.json(
            { error: "Substituições da equipa adversária não são suportadas." },
            { status: 400 },
          );
        }
        if (!playerId || !relatedPlayerId) {
          return NextResponse.json(
            { error: "Substituição inválida: faltam jogadores de saída/entrada." },
            { status: 400 },
          );
        }
        if (!onFieldPlayerIds.has(playerId)) {
          return NextResponse.json(
            { error: "Jogador de saída não está em campo." },
            { status: 400 },
          );
        }
        if (onFieldPlayerIds.has(relatedPlayerId)) {
          return NextResponse.json(
            { error: "Jogador de entrada já está em campo." },
            { status: 400 },
          );
        }
        onFieldPlayerIds.delete(playerId);
        onFieldPlayerIds.add(relatedPlayerId);
        continue;
      }

      if (row.event_type === "substitution_in") {
        if (row.is_opponent_event) {
          return NextResponse.json(
            { error: "Substituições da equipa adversária não são suportadas." },
            { status: 400 },
          );
        }
        if (!playerId || !relatedPlayerId) {
          return NextResponse.json(
            { error: "Substituição inválida: faltam jogadores de saída/entrada." },
            { status: 400 },
          );
        }
        continue;
      }

      if (!row.is_opponent_event && playerId) {
        if (row.event_type === "red_card") {
          sentOffPlayerIds.add(playerId);
          onFieldPlayerIds.delete(playerId);
          continue;
        }

        if (row.event_type === "yellow_card") {
          const next = (yellowByPlayer.get(playerId) ?? 0) + 1;
          yellowByPlayer.set(playerId, next);
          if (next >= 2) {
            sentOffPlayerIds.add(playerId);
            onFieldPlayerIds.delete(playerId);
          }
        }
      }
    }

    const payload = rows.map((row) => ({
      game_id: gameId,
      event_type: row.event_type,
      player_id: row.player_id ?? null,
      related_player_id: row.related_player_id ?? null,
      minute: Math.floor(row.minute),
      is_opponent_event: row.is_opponent_event,
    }));

    const { data, error } = await admin
      .from("game_events")
      .insert(payload)
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message || "Erro ao guardar eventos." }, { status: 500 });
    }

    return NextResponse.json({ success: true, events: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const eventIds = Array.isArray(body?.eventIds)
      ? body.eventIds.filter((row: unknown) => typeof row === "string")
      : [];

    if (eventIds.length === 0) {
      return NextResponse.json({ error: "Sem IDs para apagar." }, { status: 400 });
    }

    const admin = createAdminClient();
    const access = await assertGameAccess(admin, gameId, user.id);
    if (!access.ok) return access.response;
    if (access.gameStatus === "completed" && !access.isCoordinator) {
      return NextResponse.json(
        { error: "Só o coordenador pode editar jogos terminados." },
        { status: 403 },
      );
    }

    const { error } = await admin
      .from("game_events")
      .delete()
      .eq("game_id", gameId)
      .in("id", eventIds);

    if (error) {
      return NextResponse.json({ error: "Erro ao apagar eventos." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
