import { createClient } from "@/lib/supabase/server";
import { respondInternalError } from "@/lib/http/respond-internal-error";
import {
  formatPortugalTime,
  getPortugalDateKey,
  portugalDateTimeToUtc,
} from "@/lib/events/presence-window";
import { fetchGameAccessContext } from "@/lib/games/access";
import {
  buildConflictLabel,
  buildInfoLabel,
  gameInterval,
  intervalsOverlap,
} from "@/lib/games/convocation-overlap";
import { getFixtureConnector } from "@/lib/games/display";
import { filterLiveStatsBySelected } from "@/lib/games/lineup-ghost-filter";
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
      .select("id, team_id, age_group_id, competition_id, game_datetime, end_time, status, title, opponent_name, opponent_short_name, is_home, location, location_address, formatted_address, latitude, longitude, osm_place_id, location_source, score_home, score_away, notes, concentration_time, equipment, opponent_tactical_system, additional_info, image_url, game_type")
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

    // Modelo unificado: ler internos e presenças a partir de game_squads.
    // (convocation_players e convocations ficam só como reads legacy de
    // back-compat para jogos antigos onde o back-fill já criou as rows.)
    const selectedIds = new Set<string>();
    const { data: internalSquadRows, error: internalSquadError } = await supabase
      .from("game_squads")
      .select("player_id, response_status, is_present")
      .eq("game_id", gameId)
      .not("player_id", "is", null);

    if (internalSquadError) {
      return NextResponse.json(
        { error: "Erro ao carregar jogadores convocados." },
        { status: 500 },
      );
    }

    (internalSquadRows || []).forEach((row) => {
      if (!row.player_id) return;
      selectedIds.add(row.player_id);
      convocationSelections[row.player_id] = {
        responseStatus:
          typeof row.response_status === "string" ? row.response_status : null,
        isPresent:
          typeof row.is_present === "boolean" ? row.is_present : null,
      };
    });

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
      .select("id, age_group_id, first_name, last_name, avatar_url, jersey_number, preferred_position, status, created_at")
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

    // Modelo unificado: ler externos a partir de game_squads (player_id IS NULL).
    // Compat: mapear external_name → name, external_jersey_number → jersey_number,
    // initial_lineup_status (starter/substitute) → lineup_status (on_field/substitute).
    const { data: externalSquadRows, error: externalRowsError } = await supabase
      .from("game_squads")
      .select(
        "id, external_name, external_jersey_number, external_position, initial_lineup_status, created_at",
      )
      .eq("game_id", gameId)
      .is("player_id", null)
      .order("created_at", { ascending: true });

    if (externalRowsError) {
      return NextResponse.json(
        { error: "Erro ao carregar jogadores externos da convocatória." },
        { status: 500 },
      );
    }

    const externalRows = ((externalSquadRows || []) as Array<{
      id: string;
      external_name: string | null;
      external_jersey_number: number | null;
      external_position: string | null;
      initial_lineup_status: string | null;
      created_at: string;
    }>)
      .filter((row) => row?.id && row?.external_name)
      .map((row) => ({
        id: row.id,
        name: row.external_name as string,
        jersey_number: row.external_jersey_number ?? null,
        position: row.external_position ?? null,
        lineup_status:
          row.initial_lineup_status === "starter" ? "on_field" : "substitute",
        created_at: row.created_at,
      }));

    const blockedIds = new Set<string>();
    const sameDayConflictLabelByPlayerId = new Map<string, string>();
    const sameDayInfoLabelByPlayerId = new Map<string, string>();

    // Por cada jogador, lista todos os jogos do mesmo dia em que está
    // convocado, com flag de sobreposição. Usado a seguir para construir
    // a label de conflito (vermelha) OU a label informativa (amarela) —
    // mutuamente exclusivas.
    type SameDayEntry = {
      start: Date;
      end: Date;
      endIsEstimated: boolean;
      connector: string;
      opponentName: string;
      isOverlap: boolean;
    };
    const sameDayEntriesByPlayerId = new Map<string, SameDayEntry[]>();

    const gameDateKey = getPortugalDateKey(
      typeof game.game_datetime === "string" ? game.game_datetime : null,
    );
    const dayStartUtc = portugalDateTimeToUtc(gameDateKey, "00:00:00");
    const dayEndUtc = portugalDateTimeToUtc(gameDateKey, "23:59:59");

    if (gameDateKey && dayStartUtc && dayEndUtc) {
      // Filtramos pela data calendário (Portugal) para limitar a query.
      // O overlap real é aplicado em memória depois.
      const sameDayGamesQuery = supabase
        .from("games")
        .select(
          "id, game_datetime, end_time, concentration_time, opponent_name, is_home, competition_id",
        )
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
        // Modelo unificado: ler directamente de game_squads (sem passar
        // por convocations + convocation_players). Compat: o shape devolvido
        // tem que conter `convocation_id` para o map a seguir — usamos
        // `game_id` como pseudo-convocation_id (1:1 com game no novo modelo).
        const { data: sameDaySquads, error: sameDaySquadsError } = await supabase
          .from("game_squads")
          .select("player_id, game_id")
          .in("game_id", sameDayGameIds)
          .not("player_id", "is", null);

        if (sameDaySquadsError) {
          return NextResponse.json(
            { error: "Erro ao validar jogadores convocados no mesmo dia." },
            { status: 500 },
          );
        }

        const sameDayConvocationPlayers = (sameDaySquads || []).map((row) => ({
          player_id: row.player_id as string,
          convocation_id: row.game_id, // proxy: usa game_id como key
        }));
        const convocationGameById = new Map<string, string>(
          (sameDayConvocationPlayers || []).map((row) => [row.convocation_id, row.convocation_id]),
        );

        // Necessário para o `if (otherConvocationIds.length > 0)` que vinha depois.
        const otherConvocationIds: string[] = Array.from(
          new Set(sameDayConvocationPlayers.map((p) => p.convocation_id)),
        );

        if (otherConvocationIds.length > 0) {

          // Intervalo do jogo alvo (kickoff atual). Usamos `end_time` e
          // `concentration_time` reais; se não existirem, aplicamos o fallback
          // de 2h30 dentro de gameInterval().
          const targetInterval = gameInterval({
            game_datetime:
              typeof game.game_datetime === "string" ? game.game_datetime : "",
            concentration_time:
              typeof game.concentration_time === "string"
                ? game.concentration_time
                : null,
            end_time:
              typeof game.end_time === "string" ? game.end_time : null,
          });

          // Primeira passagem: acumular todos os jogos do mesmo dia em
          // que cada jogador está convocado, com flag isOverlap.
          (sameDayConvocationPlayers || []).forEach((row) => {
            const otherGameId = convocationGameById.get(row.convocation_id);
            if (!otherGameId) return;

            const otherGame = sameDayGamesById.get(otherGameId);
            if (!otherGame) return;

            const otherInterval = gameInterval({
              game_datetime:
                typeof otherGame.game_datetime === "string"
                  ? otherGame.game_datetime
                  : "",
              concentration_time:
                typeof (otherGame as { concentration_time?: unknown })
                  .concentration_time === "string"
                  ? (otherGame as { concentration_time: string })
                      .concentration_time
                  : null,
              end_time:
                typeof (otherGame as { end_time?: unknown }).end_time ===
                "string"
                  ? (otherGame as { end_time: string }).end_time
                  : null,
            });

            const isOverlap = intervalsOverlap(targetInterval, otherInterval);
            const opponentName =
              (typeof otherGame.opponent_name === "string" &&
                otherGame.opponent_name.trim()) ||
              "Adversário";
            const connector = getFixtureConnector(Boolean(otherGame.is_home));

            const entries =
              sameDayEntriesByPlayerId.get(row.player_id) ?? [];
            entries.push({
              start: otherInterval.start,
              end: otherInterval.end,
              endIsEstimated: otherInterval.endIsEstimated,
              connector,
              opponentName,
              isOverlap,
            });
            sameDayEntriesByPlayerId.set(row.player_id, entries);
          });

          // Segunda passagem: construir labels finais. Conflito (vermelho)
          // e info (amarelo) são mutuamente exclusivos — se há
          // sobreposição, ignora-se a info.
          for (const [
            playerId,
            entries,
          ] of sameDayEntriesByPlayerId.entries()) {
            const overlapEntry = entries.find((e) => e.isOverlap);

            if (overlapEntry) {
              // Bloqueia sempre que houver sobreposição (independentemente
              // de competição vs amigável — breaking change intencional vs
              // comportamento anterior, que só bloqueava competition vs
              // competition).
              blockedIds.add(playerId);
              sameDayConflictLabelByPlayerId.set(
                playerId,
                buildConflictLabel(overlapEntry, formatPortugalTime),
              );
              continue;
            }

            // Sem sobreposição mas com convocações no mesmo dia → label
            // informativa (amarela), jogador continua selecionável.
            const infoLabel = buildInfoLabel(entries, formatPortugalTime);
            if (infoLabel) {
              sameDayInfoLabelByPlayerId.set(playerId, infoLabel);
            }
          }
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
          sameDayInfoLabel:
            sameDayInfoLabelByPlayerId.get(player.id) ?? null,
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
        sameDayInfoLabel: null,
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

    // Lineup statuses from game_stats_live.
    //
    // Defesa em profundidade: descartar entradas cujo player_id já não está
    // em convocation_players (selectedIds). Estas "ghosts" surgem quando um
    // atleta é removido da convocatória sem o respectivo cleanup em
    // game_stats_live. Se chegassem ao cliente, o `lineupRef` continha-as
    // como `on_field` e a guarda `currentStarters >= format` em
    // handleLineupToggle bloqueava promoções legítimas.
    // Ver toggle/route.ts (cleanup pré-jogo).
    const { data: liveStats } = await supabase
      .from("game_stats_live")
      .select("player_id, status, start_minute")
      .eq("game_id", gameId);
    const filteredLiveStats = filterLiveStatsBySelected(
      (liveStats || []) as Array<{
        player_id?: string | null;
        status?: string | null;
        start_minute?: number | null;
      }>,
      selectedIds,
    );
    const lineupStatuses: Record<string, string> = {};
    const starterIdsSet = getStarterPlayerIdsFromLiveStats(filteredLiveStats);
    filteredLiveStats.forEach((row) => {
      if (!row.player_id) return;
      const normalized = normalizeLiveStatusForUi(row.status);
      if (normalized) lineupStatuses[row.player_id] = normalized;
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
