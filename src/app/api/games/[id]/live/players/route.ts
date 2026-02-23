import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type LiveStatus = "on_field" | "substitute" | "substituted";

type PlayerLiveUpdate = {
  playerId: string;
  status: LiveStatus;
  startMinute?: number | null;
  endMinute?: number | null;
};

function toDbLiveStatus(status: LiveStatus, startMinute: number | null | undefined) {
  if (status === "substituted") return "substituted_out";
  if (status === "substitute") return "on_bench";
  return startMinute === 0 ? "starter" : "playing";
}

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
    const { data: ageGroupOwner } = await admin
      .from("age_groups")
      .select("id")
      .eq("id", ageGroupId)
      .eq("coordinator_id", userId)
      .maybeSingle();
    hasAccess = !!ageGroupOwner;
    isCoordinator = !!ageGroupOwner;
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

function isValidUpdate(value: unknown): value is PlayerLiveUpdate {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PlayerLiveUpdate>;
  if (typeof row.playerId !== "string" || row.playerId.length === 0) return false;
  if (row.status !== "on_field" && row.status !== "substitute" && row.status !== "substituted") {
    return false;
  }
  if (
    row.startMinute !== undefined &&
    row.startMinute !== null &&
    (!Number.isFinite(row.startMinute) || Math.floor(row.startMinute) < 0)
  ) {
    return false;
  }
  if (
    row.endMinute !== undefined &&
    row.endMinute !== null &&
    (!Number.isFinite(row.endMinute) || Math.floor(row.endMinute) < 0)
  ) {
    return false;
  }
  return true;
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

    const body = await request.json().catch(() => null);
    const updatesRaw = Array.isArray(body?.updates) ? body.updates : [];

    if (updatesRaw.length === 0) {
      return NextResponse.json({ error: "Sem updates para guardar." }, { status: 400 });
    }
    if (!updatesRaw.every((row: unknown) => isValidUpdate(row))) {
      return NextResponse.json({ error: "Formato de update inválido." }, { status: 400 });
    }

    const updates = updatesRaw as PlayerLiveUpdate[];
    const admin = createAdminClient();
    const access = await assertGameAccess(admin, gameId, user.id);
    if (!access.ok) return access.response;
    if (access.gameStatus === "completed" && !access.isCoordinator) {
      return NextResponse.json(
        { error: "Só o coordenador pode editar jogos terminados." },
        { status: 403 },
      );
    }

    const { data: eventsData, error: eventsError } = await admin
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

    for (const update of updates) {
      if (update.status === "on_field" && sentOffPlayerIds.has(update.playerId)) {
        return NextResponse.json(
          { error: "Jogador expulso não pode voltar a entrar em campo." },
          { status: 400 },
        );
      }

      const payload: {
        status: string;
        start_minute?: number | null;
        end_minute?: number | null;
      } = {
        status: toDbLiveStatus(update.status, update.startMinute),
      };

      if ("startMinute" in update) {
        payload.start_minute =
          typeof update.startMinute === "number" ? Math.floor(update.startMinute) : null;
      }
      if ("endMinute" in update) {
        payload.end_minute = typeof update.endMinute === "number" ? Math.floor(update.endMinute) : null;
      }

      const { data: existingRows, error: existingRowsError } = await admin
        .from("game_stats_live")
        .select("id, start_minute")
        .eq("game_id", gameId)
        .eq("player_id", update.playerId);

      if (existingRowsError) {
        return NextResponse.json({ error: "Erro ao validar estado live." }, { status: 500 });
      }

      if ((existingRows || []).length > 0) {
        const existingStarterStart =
          (existingRows?.[0] as { start_minute?: number | null } | undefined)?.start_minute ?? null;
        if (existingStarterStart === 0) {
          payload.start_minute = 0;
        }
        const { error: updateError } = await admin
          .from("game_stats_live")
          .update(payload)
          .eq("game_id", gameId)
          .eq("player_id", update.playerId);
        if (updateError) {
          return NextResponse.json({ error: "Erro ao atualizar estado live." }, { status: 500 });
        }
      } else {
        const { error: insertError } = await admin.from("game_stats_live").insert({
          game_id: gameId,
          player_id: update.playerId,
          ...payload,
        });
        if (insertError) {
          return NextResponse.json({ error: "Erro ao inserir estado live." }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return respondInternalError("api.games.id.live.players.patch", error);
  }
}
