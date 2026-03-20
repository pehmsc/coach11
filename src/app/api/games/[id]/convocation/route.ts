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

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, team_id, age_group_id, competition_id, game_datetime, status")
      .eq("id", gameId)
      .maybeSingle();

    if (gameError) {
      return NextResponse.json({ error: "Erro ao carregar jogo." }, { status: 500 });
    }

    if (!game) {
      return NextResponse.json({ error: "Jogo não encontrado." }, { status: 404 });
    }

    let access = null;
    try {
      access = await fetchGameAccessContext(supabase, gameId);
    } catch {
      return NextResponse.json({ error: "Erro ao validar jogo." }, { status: 500 });
    }

    if (!access?.exists || !access.canAccess) {
      return NextResponse.json(
        { error: "Sem permissões para ver esta convocatória." },
        { status: 403 },
      );
    }

    const isCoordinator = access.isCoordinator;
    const teamId = access.teamId ?? game.team_id ?? null;

    const { data: convocations, error: convocationError } = await supabase
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
    const convocationSelections: Record<
      string,
      { responseStatus: string | null; isPresent: boolean | null }
    > = {};

    const selectedIds = new Set<string>();
    if (convocationIds.length > 0) {
      const { data: selectedRows, error: selectedError } = await supabase
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

    if (latestConvocation?.id) {
      const { data: latestSelectionRows, error: latestSelectionRowsError } = await supabase
        .from("convocation_players")
        .select("player_id, response_status, is_present")
        .eq("convocation_id", latestConvocation.id);

      if (latestSelectionRowsError) {
        return NextResponse.json(
          { error: "Erro ao carregar estados de presença da convocatória." },
          { status: 500 },
        );
      }

      (latestSelectionRows || []).forEach((row) => {
        if (!row.player_id) return;
        convocationSelections[row.player_id] = {
          responseStatus:
            typeof row.response_status === "string" ? row.response_status : null,
          isPresent:
            typeof row.is_present === "boolean" ? row.is_present : null,
        };
      });
    }

    // Ensure all convocated players have a game_stats_live row (bench by default).
    // This keeps lineup/states consistent after refresh and across devices.
    if (selectedIds.size > 0) {
      const { data: existingLiveRows, error: existingLiveRowsError } = await supabase
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
          await supabase.from("game_stats_live").insert(missingLiveRows);
        }
      }
    }

    const playersQuery = supabase
      .from("players")
      .select("id, age_group_id, first_name, last_name, short_name, photo_url, jersey_number, preferred_position, status, created_at")
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
      console.error("[convocation] players query failed:", {
        code: playersError.code,
        message: playersError.message,
        details: playersError.details,
        hint: playersError.hint,
        gameId,
        ageGroupId: game.age_group_id,
      });
      return NextResponse.json(
        { error: "Erro ao carregar os jogadores do escalão." },
        { status: 500 },
      );
    }

    const { data: externalRowsRaw, error: externalRowsError } = await supabase
      .from("external_player_convocations")
      .select("id, name, jersey_number, position, lineup_status, created_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: true });

    if (
      externalRowsError &&
      !isMissingRelationError(externalRowsError.message, "external_player_convocations")
    ) {
      return NextResponse.json(
        { error: "Erro ao carregar jogadores externos da convocatória." },
        { status: 500 },
      );
    }

    const externalRows = ((externalRowsRaw || []) as Array<{
      id: string;
      name: string;
      jersey_number: number | null;
      position: string | null;
      lineup_status: string | null;
      created_at: string;
    }>).filter((row) => row?.id && row?.name);

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

    // Football format from age_group
    let footballFormat: string | null = null;
    let homeClubName: string | null = null;
    let homeClubShortName: string | null = null;
    let ageGroupTacticalSystem: string | null = null;
    if (game.age_group_id) {
      const { data: ag } = await supabase
        .from("age_groups")
        .select("football_format, club_name, club_short_name, tactical_system")
        .eq("id", game.age_group_id)
        .maybeSingle();
      footballFormat =
        (ag as unknown as { football_format?: string } | null)?.football_format ?? null;
      homeClubName = (ag as { club_name?: string } | null)?.club_name ?? null;
      homeClubShortName =
        (ag as { club_short_name?: string | null } | null)?.club_short_name ?? null;
      ageGroupTacticalSystem =
        (ag as { tactical_system?: string | null } | null)?.tactical_system ?? null;
    }

    // Lineup statuses from game_stats_live
    const { data: liveStats } = await supabase
      .from("game_stats_live")
      .select("player_id, status, start_minute")
      .eq("game_id", gameId);
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

    externalRows.forEach((row) => {
      const externalPlayerId = `external:${row.id}`;
      const normalized =
        row.lineup_status === "on_field" ? "on_field" : "substitute";
      lineupStatuses[externalPlayerId] = normalized;
      if (normalized === "on_field") {
        starterIdsSet.add(externalPlayerId);
      }
    });

    let kits: Record<string, unknown>[] = [];
    if (teamId) {
      const { data: kitRows, error: kitsError } = await supabase
        .from("kit_pieces")
        .select("id, team_id, kit_number, player_type, piece_type, color_hex, color_name, image_url, created_at")
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
    const { data: checkpointRow, error: checkpointError } = await supabase
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
