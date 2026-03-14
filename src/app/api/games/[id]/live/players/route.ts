import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { parseBody } from "@/lib/http/validate";
import { isExternalLivePlayerId } from "@/lib/games/live-player-ids";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type LiveStatus = "on_field" | "substitute" | "substituted";

type GameAccessContext = {
  exists: boolean;
  canWrite: boolean;
  isCoordinator: boolean;
  status: string | null;
};

const PlayerLiveUpdateSchema = z.object({
  playerId: z.string().min(1),
  status: z.enum(["on_field", "substitute", "substituted"]),
  startMinute: z.number().int().min(0).nullable().optional(),
  endMinute: z.number().int().min(0).nullable().optional(),
});

const PlayersPostSchema = z.object({
  updates: z.array(PlayerLiveUpdateSchema).min(1, "Sem updates para guardar."),
});

function toDbLiveStatus(status: LiveStatus, startMinute: number | null | undefined) {
  if (status === "substituted") return "substituted_out";
  if (status === "substitute") return "on_bench";
  return startMinute === 0 ? "starter" : "playing";
}

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

function computeSentOffPlayerIds(events: Array<{
  event_type?: string | null;
  player_id?: string | null;
  is_opponent_event?: boolean | null;
}>) {
  const sentOff = new Set<string>();
  const yellowByPlayer = new Map<string, number>();

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

  return sentOff;
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

    const parsed = await parseBody(request, PlayersPostSchema);
    if (parsed.error) return parsed.error;
    const { updates } = parsed.data;
    if (updates.some((row) => isExternalLivePlayerId(row.playerId))) {
      return NextResponse.json(
        {
          error:
            'Os jogadores "Outro" são geridos na convocatória externa; este endpoint mantém apenas o estado live dos jogadores do plantel.',
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

    const { data: eventsData, error: eventsError } = await supabase
      .from("game_events")
      .select("event_type, player_id, is_opponent_event")
      .eq("game_id", gameId)
      .order("minute", { ascending: true })
      .order("created_at", { ascending: true });

    if (eventsError) {
      return NextResponse.json(
        { error: "Erro ao validar estado disciplinar dos jogadores." },
        { status: 500 },
      );
    }

    const sentOffPlayerIds = computeSentOffPlayerIds(
      (eventsData || []) as Array<{
        event_type?: string | null;
        player_id?: string | null;
        is_opponent_event?: boolean | null;
      }>,
    );

    const playerIds = Array.from(new Set(updates.map((row) => row.playerId)));
    const { data: existingRows, error: existingRowsError } = await supabase
      .from("game_stats_live")
      .select("player_id, start_minute, end_minute")
      .eq("game_id", gameId)
      .in("player_id", playerIds);

    if (existingRowsError) {
      return NextResponse.json({ error: "Erro ao validar estado live." }, { status: 500 });
    }

    const existingByPlayer = new Map<
      string,
      { start_minute: number | null; end_minute: number | null }
    >();
    (existingRows || []).forEach((row) => {
      if (typeof row.player_id !== "string") return;
      existingByPlayer.set(row.player_id, {
        start_minute: typeof row.start_minute === "number" ? row.start_minute : null,
        end_minute: typeof row.end_minute === "number" ? row.end_minute : null,
      });
    });

    const rowsToUpsert: Array<{
      game_id: string;
      player_id: string;
      status: string;
      start_minute: number | null;
      end_minute: number | null;
    }> = [];

    const rowsToInsert: Array<{
      game_id: string;
      player_id: string;
      status: string;
      start_minute: number | null;
      end_minute: number | null;
    }> = [];

    for (const update of updates) {
      if (update.status === "on_field" && sentOffPlayerIds.has(update.playerId)) {
        return NextResponse.json(
          { error: "Jogador expulso não pode voltar a entrar em campo." },
          { status: 400 },
        );
      }

      const hasStartMinute = Object.prototype.hasOwnProperty.call(update, "startMinute");
      const hasEndMinute = Object.prototype.hasOwnProperty.call(update, "endMinute");
      const existing = existingByPlayer.get(update.playerId);

      let startMinute =
        hasStartMinute && typeof update.startMinute === "number"
          ? Math.floor(update.startMinute)
          : null;
      let endMinute =
        hasEndMinute && typeof update.endMinute === "number"
          ? Math.floor(update.endMinute)
          : null;

      if (existing) {
        if (!hasStartMinute) startMinute = existing.start_minute;
        if (!hasEndMinute) endMinute = existing.end_minute;
        if (existing.start_minute === 0) startMinute = 0;
      }

      const row = {
        game_id: gameId,
        player_id: update.playerId,
        status: toDbLiveStatus(update.status, update.startMinute),
        start_minute: startMinute,
        end_minute: endMinute,
      };

      if (existing) rowsToUpsert.push(row);
      else rowsToInsert.push(row);
    }

    if (rowsToUpsert.length > 0) {
      const { error: updateError } = await supabase
        .from("game_stats_live")
        .upsert(rowsToUpsert, { onConflict: "game_id,player_id" });

      if (updateError) {
        return NextResponse.json({ error: "Erro ao atualizar estado live." }, { status: 500 });
      }
    }

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase.from("game_stats_live").insert(rowsToInsert);

      if (insertError) {
        return NextResponse.json({ error: "Erro ao inserir estado live." }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.games.id.live.players.patch", error);
  }
}
