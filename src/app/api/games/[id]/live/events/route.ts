import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

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

type GameAccessContext = {
  exists: boolean;
  canWrite: boolean;
  isCoordinator: boolean;
  status: string | null;
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

function parseGameAccessContext(value: unknown): GameAccessContext | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return {
    exists: row.exists === true,
    canWrite: row.canWrite === true,
    isCoordinator: row.isCoordinator === true,
    status: typeof row.status === "string" ? row.status : null,
  };
}

async function assertGameAccess(
  db: SupabaseClient,
  gameId: string,
) {
  const { data: accessData, error: accessError } = await db.rpc(
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

  if (!access.canWrite) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Sem permissões." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    isCoordinator: access.isCoordinator,
    gameStatus: access.status,
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

function isExternalPlayerId(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith("external:");
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

    const access = await assertGameAccess(supabase, gameId);
    if (!access.ok) return access.response;

    const { data, error } = await supabase
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
    return respondInternalError("api.games.id.live.events.get", error);
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
    if (
      rows.some(
        (row) =>
          isExternalPlayerId(row.player_id ?? null) ||
          isExternalPlayerId(row.related_player_id ?? null),
      )
    ) {
      return NextResponse.json(
        {
          error:
            'A live interna ainda não suporta eventos individuais para jogadores "Outro". Ajusta a convocatória antes de iniciar.',
        },
        { status: 400 },
      );
    }

    const access = await assertGameAccess(supabase, gameId);
    if (!access.ok) return access.response;
    if (access.gameStatus === "completed" && !access.isCoordinator) {
      return NextResponse.json(
        { error: "Só o coordenador pode editar jogos terminados." },
        { status: 403 },
      );
    }

    const [{ data: liveRows, error: liveRowsError }, { data: existingEvents, error: existingEventsError }] =
      await Promise.all([
        supabase.from("game_stats_live").select("player_id, status").eq("game_id", gameId),
        supabase
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

    const { data, error } = await supabase
      .from("game_events")
      .insert(payload)
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Erro ao guardar eventos:", error.message);
      return NextResponse.json({ error: "Erro ao guardar eventos." }, { status: 500 });
    }

    return NextResponse.json({ success: true, events: data || [] });
  } catch (error) {
    return respondInternalError("api.games.id.live.events.post", error);
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

    const access = await assertGameAccess(supabase, gameId);
    if (!access.ok) return access.response;
    if (access.gameStatus === "completed" && !access.isCoordinator) {
      return NextResponse.json(
        { error: "Só o coordenador pode editar jogos terminados." },
        { status: 403 },
      );
    }

    const { error } = await supabase
      .from("game_events")
      .delete()
      .eq("game_id", gameId)
      .in("id", eventIds);

    if (error) {
      return NextResponse.json({ error: "Erro ao apagar eventos." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.games.id.live.events.delete", error);
  }
}
