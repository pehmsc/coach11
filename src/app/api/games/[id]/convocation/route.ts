import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import { portugalDateTimeToUtc } from "@/lib/events/presence-window";
import { fetchGameAccessContext } from "@/lib/games/access";
import { getFixtureConnector } from "@/lib/games/display";
import {
  getStarterPlayerIdsFromLiveStats,
  normalizeLiveStatusForUi,
} from "@/lib/games/lineup";
import { NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ConvocationStatus = "draft" | "confirmed" | "closed";
type MatchPhase = "pre_match" | "first_half" | "halftime" | "second_half" | "review" | "completed";
const PORTUGAL_TIMEZONE = "Europe/Lisbon";

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

function isMissingRelationError(
  message: string | null | undefined,
  relationName: string,
) {
  if (!message) return false;
  return (
    message.includes(relationName) &&
    (message.includes("does not exist") || message.includes("relation"))
  );
}

function getPortugalDateKey(value: string | null | undefined) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PORTUGAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);

  const lookup = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  if (!lookup.year || !lookup.month || !lookup.day) return null;
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

function formatPortugalTime(value: string | null | undefined) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: PORTUGAL_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
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

    // Phase 1: Load game + access + convocations + external players + checkpoint in parallel
    const [gameResult, accessResult, convocationResult, externalResult, checkpointResult] =
      await Promise.all([
        supabase.from("games").select("*").eq("id", gameId).maybeSingle(),
        fetchGameAccessContext(supabase, gameId).catch((error) => {
          console.error("[api.games.convocation.access]", { gameId, error });
          return null;
        }),
        supabase
          .from("convocations")
          .select(
            "id, status, created_at, fp_jersey_kit_id, fp_shorts_kit_id, fp_socks_kit_id, gk_jersey_kit_id, gk_shorts_kit_id, gk_socks_kit_id",
          )
          .eq("game_id", gameId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }),
        supabase
          .from("external_player_convocations")
          .select("id, name, jersey_number, position, lineup_status, created_at")
          .eq("game_id", gameId)
          .order("created_at", { ascending: true }),
        supabase
          .from("game_live_checkpoints")
          .select("phase, base_seconds, running_since_ms, updated_at")
          .eq("game_id", gameId)
          .in("phase", ["first_half", "second_half"])
          .gte("updated_at", new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString())
          .maybeSingle(),
      ]);

    const { data: game, error: gameError } = gameResult;
    if (gameError) {
      return NextResponse.json({ error: "Erro ao carregar jogo." }, { status: 500 });
    }
    if (!game) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }

    const access = accessResult;
    if (!access?.exists || !access.canAccess) {
      return NextResponse.json(
        { error: "Sem permissões para ver esta convocatória." },
        { status: 403 },
      );
    }

    const isCoordinator = access.isCoordinator;
    const teamId = access.teamId ?? game.team_id ?? null;

    const { data: convocations, error: convocationError } = convocationResult;
    if (convocationError) {
      return NextResponse.json(
        { error: "Erro ao carregar convocatória." },
        { status: 500 },
      );
    }

    const { data: externalRowsRaw, error: externalRowsError } = externalResult;
    if (
      externalRowsError &&
      !isMissingRelationError(externalRowsError.message, "external_player_convocations")
    ) {
      return NextResponse.json(
        { error: "Erro ao carregar jogadores externos da convocatória." },
        { status: 500 },
      );
    }

    const convocationIds = (convocations || []).map((c) => c.id);
    const convocationStatus = toConvocationStatus(convocations?.[0]?.status);
    const latestConvocation = convocations?.[0] || null;
    const convocationSelections: Record<
      string,
      { responseStatus: string | null; isPresent: boolean | null }
    > = {};

    // Phase 2: Parallel queries that depend on convocation results + game data
    const playersQuery = supabase
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

    const phase2Promises = [
      playersQuery,
      supabase
        .from("game_stats_live")
        .select("player_id, status, start_minute")
        .eq("game_id", gameId),
      game.age_group_id
        ? supabase
            .from("age_groups")
            .select("football_format, club_name, club_short_name, tactical_system")
            .eq("id", game.age_group_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      teamId
        ? supabase
            .from("kit_pieces")
            .select("*")
            .eq("team_id", teamId)
            .order("kit_number")
            .order("player_type")
            .order("piece_type")
        : Promise.resolve({ data: null, error: null }),
      convocationIds.length > 0
        ? supabase
            .from("convocation_players")
            .select("player_id")
            .in("convocation_id", convocationIds)
        : Promise.resolve({ data: null, error: null }),
      latestConvocation?.id
        ? supabase
            .from("convocation_players")
            .select("player_id, response_status, is_present")
            .eq("convocation_id", latestConvocation.id)
        : Promise.resolve({ data: null, error: null }),
    ] as const;

    const [playersResult, liveStatsResult, ageGroupResult, kitsResult, selectedResult, latestSelResult] =
      await Promise.all(phase2Promises);

    const { data: activePlayers, error: playersError } = playersResult;
    if (playersError) {
      return NextResponse.json(
        { error: "Erro ao carregar os jogadores do escalão." },
        { status: 500 },
      );
    }

    const selectedIds = new Set<string>();
    if (selectedResult.error) {
      return NextResponse.json(
        { error: "Erro ao carregar jogadores convocados." },
        { status: 500 },
      );
    }
    (selectedResult.data || []).forEach((row) => {
      if ("player_id" in row) selectedIds.add(row.player_id as string);
    });

    if (latestSelResult.error) {
      return NextResponse.json(
        { error: "Erro ao carregar estados de presença da convocatória." },
        { status: 500 },
      );
    }
    ((latestSelResult.data || []) as Array<{ player_id?: string; response_status?: string; is_present?: boolean }>).forEach((row) => {
      if (!row.player_id) return;
      convocationSelections[row.player_id] = {
        responseStatus:
          typeof row.response_status === "string" ? row.response_status : null,
        isPresent:
          typeof row.is_present === "boolean" ? row.is_present : null,
      };
    });

    // Ensure all convocated players have a game_stats_live row (bench by default).
    if (selectedIds.size > 0 && !liveStatsResult.error) {
      const existingLiveIds = new Set(
        ((liveStatsResult.data || []) as Array<{ player_id?: string }>).map((row) => row.player_id),
      );
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
        await supabase.from("game_stats_live").insert(missingLiveRows);
      }
    }

    const externalRows = ((externalRowsRaw || []) as Array<{
      id: string;
      name: string;
      jersey_number: number | null;
      position: string | null;
      lineup_status: string | null;
      created_at: string;
    }>).filter((row) => row?.id && row?.name);

    // Extract age group info from parallelized result
    const ag = ageGroupResult.data as { football_format?: string; club_name?: string; club_short_name?: string | null; tactical_system?: string | null } | null;
    const footballFormat = ag?.football_format ?? null;
    const homeClubName = ag?.club_name ?? null;
    const homeClubShortName = ag?.club_short_name ?? null;
    const ageGroupTacticalSystem = ag?.tactical_system ?? null;

    // Extract lineup statuses from parallelized result
    const liveStats = liveStatsResult.data;
    const lineupStatuses: Record<string, string> = {};
    const starterIdsSet = getStarterPlayerIdsFromLiveStats(
      ((liveStats || []) as Array<{
        player_id?: string | null;
        status?: string | null;
        start_minute?: number | null;
      }>),
    );
    (liveStats || []).forEach((row) => {
      const r = row as unknown as { player_id?: string; status?: string; start_minute?: number | null };
      if (!r.player_id) return;
      const normalized = normalizeLiveStatusForUi(r.status);
      if (normalized) lineupStatuses[r.player_id] = normalized;
    });

    // Extract kits from parallelized result
    let kits: Record<string, unknown>[] = [];
    if (kitsResult.error) {
      return NextResponse.json(
        { error: "Erro ao carregar equipamentos da equipa." },
        { status: 500 },
      );
    }
    kits = ((kitsResult.data || []) as unknown as Record<string, unknown>[]).map((row) =>
      normalizeKitRowForUi(row),
    );

    // Extract checkpoint from parallelized result
    let liveCheckpoint: {
      phase: MatchPhase;
      baseSeconds: number;
      runningSinceMs: number | null;
      updatedAt: string;
    } | null = null;

    const { data: checkpointRow, error: checkpointError } = checkpointResult;
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

    const blockedIds = new Set<string>();
    const sameDayConflictLabelByPlayerId = new Map<string, string>();

    const gameDateKey = getPortugalDateKey(
      typeof game.game_datetime === "string" ? game.game_datetime : null,
    );
    const dayStartUtc = portugalDateTimeToUtc(gameDateKey, "00:00:00");
    const dayEndUtc = portugalDateTimeToUtc(gameDateKey, "23:59:59");

    if (gameDateKey && dayStartUtc && dayEndUtc) {
      const sameDayGamesQuery = supabase
        .from("games")
        .select("id, game_datetime, opponent_name, is_home, competition_id")
        .neq("id", gameId)
        .gte("game_datetime", dayStartUtc.toISOString())
        .lte("game_datetime", dayEndUtc.toISOString())
        .order("game_datetime", { ascending: true });

      if (typeof game.age_group_id === "string" && game.age_group_id.length > 0) {
        sameDayGamesQuery.eq("age_group_id", game.age_group_id);
      } else if (teamId) {
        sameDayGamesQuery.eq("team_id", teamId);
      }

      const { data: sameDayGames, error: sameDayGamesError } = await sameDayGamesQuery;

      if (sameDayGamesError) {
        return NextResponse.json(
          { error: "Erro ao validar convocatórias no mesmo dia." },
          { status: 500 },
        );
      }

      const sameDayGameIds = (sameDayGames || []).map((entry) => entry.id);
      const sameDayGamesById = new Map(
        (sameDayGames || []).map((entry) => [entry.id, entry]),
      );

      if (sameDayGameIds.length > 0) {
        const { data: otherConvocations, error: otherConvocationsError } = await supabase
          .from("convocations")
          .select("id, game_id")
          .in("game_id", sameDayGameIds);

        if (otherConvocationsError) {
          return NextResponse.json(
            { error: "Erro ao carregar convocatórias no mesmo dia." },
            { status: 500 },
          );
        }

        const otherConvocationIds = (otherConvocations || []).map((entry) => entry.id);
        const convocationGameById = new Map(
          (otherConvocations || []).map((entry) => [entry.id, entry.game_id]),
        );

        if (otherConvocationIds.length > 0) {
          const { data: sameDayConvocationPlayers, error: sameDayConvocationPlayersError } =
            await supabase
              .from("convocation_players")
              .select("player_id, convocation_id")
              .in("convocation_id", otherConvocationIds);

          if (sameDayConvocationPlayersError) {
            return NextResponse.json(
              { error: "Erro ao validar jogadores convocados no mesmo dia." },
              { status: 500 },
            );
          }

          (sameDayConvocationPlayers || []).forEach((row) => {
            const otherGameId = convocationGameById.get(row.convocation_id);
            if (!otherGameId) return;

            const otherGame = sameDayGamesById.get(otherGameId);
            if (!otherGame) return;

            if (game.competition_id && otherGame.competition_id) {
              blockedIds.add(row.player_id);
            }

            if (!sameDayConflictLabelByPlayerId.has(row.player_id)) {
              const opponentName =
                (typeof otherGame.opponent_name === "string" && otherGame.opponent_name.trim()) ||
                "Adversário";
              const connector = getFixtureConnector(Boolean(otherGame.is_home));
              const timeLabel = formatPortugalTime(
                typeof otherGame.game_datetime === "string"
                  ? otherGame.game_datetime
                  : null,
              );
              const text = timeLabel
                ? `Já convocado hoje: ${connector} ${opponentName} às ${timeLabel}`
                : `Já convocado hoje: ${connector} ${opponentName}`;
              sameDayConflictLabelByPlayerId.set(row.player_id, text);
            }
          });
        }
      }
    }

    const players = [
      ...(activePlayers || []).map((player) => {
        const isConvocated = selectedIds.has(player.id);
        return {
          ...player,
          isConvocated,
          isBlocked: blockedIds.has(player.id) && !isConvocated,
          sameDayConflictLabel:
            sameDayConflictLabelByPlayerId.get(player.id) ?? null,
          isExternal: false,
          externalConvocationId: null,
        };
      }),
      ...externalRows.map((row) => ({
        id: `external:${row.id}`,
        age_group_id: game.age_group_id ?? "",
        first_name: row.name,
        last_name: "",
        jersey_number:
          typeof row.jersey_number === "number" ? row.jersey_number : null,
        preferred_position:
          typeof row.position === "string" ? row.position : null,
        status: "active" as const,
        created_at: row.created_at,
        isConvocated: true,
        isBlocked: false,
        sameDayConflictLabel: null,
        isExternal: true,
        externalConvocationId: row.id,
      })),
    ];

    externalRows.forEach((row) => {
      const externalPlayerId = `external:${row.id}`;
      const normalized =
        row.lineup_status === "on_field" ? "on_field" : "substitute";
      lineupStatuses[externalPlayerId] = normalized;
      if (normalized === "on_field") {
        starterIdsSet.add(externalPlayerId);
      }
    });

    return NextResponse.json({
      success: true,
      game,
      teamId,
      isCoordinator,
      footballFormat,
      lineupStatuses,
      starterIds: Array.from(starterIdsSet),
      tacticalSystem:
        (game as unknown as { additional_info?: string }).additional_info ??
        ageGroupTacticalSystem,
      homeClubName,
      homeClubShortName,
      convocationStatus,
      convocationId: convocations?.[0]?.id ?? null,
      convocationCount: convocationIds.length,
      convocationSelections,
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
    return respondInternalError("api.games.id.convocation.get", error);
  }
}
