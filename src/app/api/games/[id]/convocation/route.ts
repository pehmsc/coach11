import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ConvocationStatus = "draft" | "confirmed" | "closed";
type MatchPhase = "pre_match" | "first_half" | "halftime" | "second_half" | "review" | "completed";

function toConvocationStatus(value: string | null | undefined): ConvocationStatus {
  if (value === "confirmed" || value === "closed") return value;
  return "draft";
}

function isMissingCheckpointTableError(message: string | null | undefined) {
  if (!message) return false;
  return (
    message.includes("game_live_checkpoints") &&
    (message.includes("does not exist") || message.includes("relation"))
  );
}

function normalizeLiveStatusForUi(value: string | null | undefined) {
  if (!value) return null;
  if (
    value === "on_field" ||
    value === "starter" ||
    value === "playing" ||
    value === "titular"
  ) {
    return "on_field";
  }
  if (
    value === "substitute" ||
    value === "on_bench" ||
    value === "substituted_out" ||
    value === "bench" ||
    value === "suplente"
  ) {
    return "substitute";
  }
  return null;
}

function normalizeKitRowForUi(row: Record<string, unknown>) {
  return {
    ...row,
    player_type:
      typeof row.player_type === "string" && row.player_type === "field_player"
        ? "field"
        : row.player_type,
    piece_type:
      typeof row.piece_type === "string" && row.piece_type === "jersey"
        ? "shirt"
        : row.piece_type,
  };
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id: gameId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: game, error: gameError } = await admin
      .from("games")
      .select("*")
      .eq("id", gameId)
      .maybeSingle();

    if (gameError) {
      return NextResponse.json({ error: "Erro ao carregar jogo." }, { status: 500 });
    }

    if (!game) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }

    let hasAccess = false;
    let isCoordinator = false;
    let teamId: string | null = game.team_id;

    if (game.age_group_id) {
      const { data: ageGroup } = await admin
        .from("age_groups")
        .select("id")
        .eq("id", game.age_group_id)
        .eq("coordinator_id", user.id)
        .maybeSingle();
      hasAccess = !!ageGroup;
      isCoordinator = !!ageGroup;
    }

    if (!teamId && game.age_group_id) {
      const { data: fallbackTeam } = await admin
        .from("teams")
        .select("id")
        .eq("age_group_id", game.age_group_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      teamId = fallbackTeam?.id ?? null;
    }

    if (!hasAccess && teamId) {
      const { data: staffLink } = await admin
        .from("team_staff")
        .select("id")
        .eq("team_id", teamId)
        .eq("profile_id", user.id)
        .maybeSingle();
      hasAccess = !!staffLink;
    }

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Sem permissões para ver esta convocatória." },
        { status: 403 },
      );
    }

    const { data: convocations, error: convocationError } = await admin
      .from("convocations")
      .select(
        "id, status, created_at, fp_jersey_kit_id, fp_shorts_kit_id, fp_socks_kit_id, gk_jersey_kit_id, gk_shorts_kit_id, gk_socks_kit_id",
      )
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (convocationError) {
      return NextResponse.json(
        { error: "Erro ao carregar convocatória." },
        { status: 500 },
      );
    }

    const convocationIds = (convocations || []).map((c) => c.id);
    const convocationStatus = toConvocationStatus(convocations?.[0]?.status);
    const latestConvocation = convocations?.[0] || null;

    const selectedIds = new Set<string>();
    if (convocationIds.length > 0) {
      const { data: selectedRows, error: selectedError } = await admin
        .from("convocation_players")
        .select("player_id")
        .in("convocation_id", convocationIds);

      if (selectedError) {
        return NextResponse.json(
          { error: "Erro ao carregar jogadores convocados." },
          { status: 500 },
        );
      }

      (selectedRows || []).forEach((row) => {
        selectedIds.add(row.player_id);
      });
    }

    // Ensure all convocated players have a game_stats_live row (bench by default).
    // This keeps lineup/states consistent after refresh and across devices.
    if (selectedIds.size > 0) {
      const { data: existingLiveRows, error: existingLiveRowsError } = await admin
        .from("game_stats_live")
        .select("player_id")
        .eq("game_id", gameId);

      if (!existingLiveRowsError) {
        const existingLiveIds = new Set((existingLiveRows || []).map((row) => row.player_id));
        const missingLiveRows = Array.from(selectedIds)
          .filter((playerId) => !existingLiveIds.has(playerId))
          .map((playerId) => ({
            game_id: gameId,
            player_id: playerId,
            status: "on_bench",
            start_minute: null,
            end_minute: null,
          }));

        if (missingLiveRows.length > 0) {
          await admin.from("game_stats_live").insert(missingLiveRows);
        }
      }
    }

    const playersQuery = admin
      .from("players")
      .select("*")
      .eq("status", "active")
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true });

    if (game.age_group_id) {
      playersQuery.eq("age_group_id", game.age_group_id);
    } else {
      playersQuery.limit(0);
    }

    const { data: activePlayers, error: playersError } = await playersQuery;

    if (playersError) {
      return NextResponse.json(
        { error: "Erro ao carregar os jogadores do escalão." },
        { status: 500 },
      );
    }

    const blockedIds = new Set<string>();
    if (game.competition_id && game.game_datetime) {
      const gameDate = String(game.game_datetime).split("T")[0];

      if (gameDate) {
        const { data: sameDayGames } = await admin
          .from("games")
          .select("id")
          .neq("id", gameId)
          .not("competition_id", "is", null)
          .gte("game_datetime", `${gameDate}T00:00:00`)
          .lte("game_datetime", `${gameDate}T23:59:59`);

        const sameDayIds = (sameDayGames || []).map((g) => g.id);

        if (sameDayIds.length > 0) {
          const { data: otherConvocations } = await admin
            .from("convocations")
            .select("id")
            .in("game_id", sameDayIds);

          const otherConvocationIds = (otherConvocations || []).map((c) => c.id);

          if (otherConvocationIds.length > 0) {
            const { data: blockedRows } = await admin
              .from("convocation_players")
              .select("player_id")
              .in("convocation_id", otherConvocationIds);

            (blockedRows || []).forEach((row) => blockedIds.add(row.player_id));
          }
        }
      }
    }

    const players = (activePlayers || []).map((player) => {
      const isConvocated = selectedIds.has(player.id);
      return {
        ...player,
        isConvocated,
        isBlocked: blockedIds.has(player.id) && !isConvocated,
      };
    });

    // Football format from age_group
    let footballFormat: string | null = null;
    let homeClubName: string | null = null;
    let homeClubShortName: string | null = null;
    if (game.age_group_id) {
      const { data: ag } = await admin
        .from("age_groups")
        .select("football_format, club_name, club_short_name")
        .eq("id", game.age_group_id)
        .maybeSingle();
      footballFormat =
        (ag as unknown as { football_format?: string } | null)?.football_format ?? null;
      homeClubName = (ag as { club_name?: string } | null)?.club_name ?? null;
      homeClubShortName =
        (ag as { club_short_name?: string | null } | null)?.club_short_name ?? null;
    }

    // Lineup statuses from game_stats_live
    const { data: liveStats } = await admin
      .from("game_stats_live")
      .select("player_id, status, start_minute")
      .eq("game_id", gameId);
    const lineupStatuses: Record<string, string> = {};
    const starterIdsSet = new Set<string>();
    (liveStats || []).forEach((row) => {
      const r = row as unknown as { player_id?: string; status?: string; start_minute?: number | null };
      if (!r.player_id) return;
      const normalized = normalizeLiveStatusForUi(r.status);
      if (normalized) lineupStatuses[r.player_id] = normalized;
      if (r.start_minute === 0 || r.status === "starter") {
        starterIdsSet.add(r.player_id);
      }
    });
    if (starterIdsSet.size === 0) {
      Object.entries(lineupStatuses).forEach(([playerId, status]) => {
        if (status === "on_field") starterIdsSet.add(playerId);
      });
    }

    let kits: Record<string, unknown>[] = [];
    if (teamId) {
      const { data: kitRows, error: kitsError } = await admin
        .from("kit_pieces")
        .select("*")
        .eq("team_id", teamId)
        .order("kit_number")
        .order("player_type")
        .order("piece_type");

      if (kitsError) {
        return NextResponse.json(
          { error: "Erro ao carregar equipamentos da equipa." },
          { status: 500 },
        );
      }

      kits = ((kitRows || []) as unknown as Record<string, unknown>[]).map((row) =>
        normalizeKitRowForUi(row),
      );
    }

    let liveCheckpoint: {
      phase: MatchPhase;
      baseSeconds: number;
      runningSinceMs: number | null;
      updatedAt: string;
    } | null = null;

    const activityCutoffIso = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    const { data: checkpointRow, error: checkpointError } = await admin
      .from("game_live_checkpoints")
      .select("phase, base_seconds, running_since_ms, updated_at")
      .eq("game_id", gameId)
      .in("phase", ["first_half", "second_half"])
      .gte("updated_at", activityCutoffIso)
      .maybeSingle();

    if (checkpointError && !isMissingCheckpointTableError(checkpointError.message)) {
      console.error("Erro ao carregar checkpoint live:", checkpointError);
    }

    if (checkpointRow && game.status !== "completed") {
      liveCheckpoint = {
        phase: checkpointRow.phase as MatchPhase,
        baseSeconds: Math.max(0, Math.floor(checkpointRow.base_seconds ?? 0)),
        runningSinceMs:
          typeof checkpointRow.running_since_ms === "number"
            ? checkpointRow.running_since_ms
            : null,
        updatedAt: checkpointRow.updated_at,
      };
    }

    return NextResponse.json({
      success: true,
      game,
      teamId,
      isCoordinator,
      footballFormat,
      lineupStatuses,
      starterIds: Array.from(starterIdsSet),
      tacticalSystem: (game as unknown as { additional_info?: string }).additional_info ?? null,
      homeClubName,
      homeClubShortName,
      convocationStatus,
      convocationId: convocations?.[0]?.id ?? null,
      convocationCount: convocationIds.length,
      liveCheckpoint,
      kitSelection: latestConvocation
        ? {
            fp_jersey_kit_id: latestConvocation.fp_jersey_kit_id ?? null,
            fp_shorts_kit_id: latestConvocation.fp_shorts_kit_id ?? null,
            fp_socks_kit_id: latestConvocation.fp_socks_kit_id ?? null,
            gk_jersey_kit_id: latestConvocation.gk_jersey_kit_id ?? null,
            gk_shorts_kit_id: latestConvocation.gk_shorts_kit_id ?? null,
            gk_socks_kit_id: latestConvocation.gk_socks_kit_id ?? null,
          }
        : {
            fp_jersey_kit_id: null,
            fp_shorts_kit_id: null,
            fp_socks_kit_id: null,
            gk_jersey_kit_id: null,
            gk_shorts_kit_id: null,
            gk_socks_kit_id: null,
          },
      kits,
      players,
    });
  } catch (error) {
    console.error("Erro ao carregar convocatória do jogo:", error);

    const message =
      error instanceof Error ? error.message : "Erro interno ao carregar a convocatória.";

    if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      return NextResponse.json(
        {
          error:
            "Configuração do servidor incompleta: falta SUPABASE_SERVICE_ROLE_KEY no ambiente de produção.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: message || "Erro interno ao carregar a convocatória." },
      { status: 500 },
    );
  }
}
